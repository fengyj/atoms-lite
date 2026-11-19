import { selectorForElement } from "@/lib/element-selection";

export type DesignFinding = {
  id: string;
  rule: string;
  severity: "warning" | "advisory";
  message: string;
  selector: string;
  snippet: string;
  element: Element;
};

type RGB = { r: number; g: number; b: number; a: number };

function parseColor(value: string): RGB | null {
  const match = value.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i,
  );
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function luminance(color: RGB): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(a: RGB, b: RGB): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function blend(fg: RGB, bg: RGB): RGB {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

function effectiveBackground(
  element: Element,
  view: Window,
): RGB | null {
  let current: Element | null = element;
  while (current) {
    const style = view.getComputedStyle(current);
    if (style.backgroundImage && style.backgroundImage !== "none") return null;
    const color = parseColor(style.backgroundColor);
    if (color && color.a > 0.05) {
      return color.a >= 1 ? color : blend(color, { r: 255, g: 255, b: 255, a: 1 });
    }
    current = current.parentElement;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

function hasDirectText(element: Element): boolean {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === 3 && (node.textContent ?? "").trim().length > 0,
  );
}

function textSnippet(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function selector(element: Element): string {
  return selectorForElement(element);
}

/**
 * 轻量设计检查：只覆盖可以直接从 DOM/计算样式判断的高价值问题。
 * 规则参考 Impeccable detector 的方向，但不是完整规则集。
 */
export function scanDesign(doc: Document): DesignFinding[] {
  const view = doc.defaultView;
  if (!view) return [];
  const findings: DesignFinding[] = [];
  const seen = new Set<string>();
  let index = 0;

  const push = (
    rule: string,
    severity: DesignFinding["severity"],
    message: string,
    element: Element,
    snippet: string,
  ) => {
    const path = selector(element);
    const key = `${rule}:${path}`;
    if (seen.has(key) || findings.length >= 40) return;
    seen.add(key);
    findings.push({
      id: `finding_${index++}`,
      rule,
      severity,
      message,
      selector: path,
      snippet,
      element,
    });
  };

  const elements = Array.from(doc.body?.querySelectorAll<HTMLElement>("*") ?? []);
  for (const element of elements) {
    const style = view.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      element.closest("[data-atoms-picker], [data-atoms-design-overlay]")
    ) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const tag = element.tagName.toLowerCase();
    if (
      tag === "script" ||
      tag === "style" ||
      tag === "svg" ||
      tag === "path" ||
      tag === "style"
    ) {
      continue;
    }

    const fontSize = Number.parseFloat(style.fontSize);
    if (hasDirectText(element) && fontSize > 0 && fontSize < 11) {
      push(
        "undersized-text",
        "warning",
        `功能性文字只有 ${Math.round(fontSize * 10) / 10}px，低于 11px 可读性下限。`,
        element,
        textSnippet(element),
      );
    }

    if (hasDirectText(element)) {
      const foreground = parseColor(style.color);
      const background = effectiveBackground(element, view);
      if (foreground && background) {
        const fg = foreground.a < 1 ? blend(foreground, background) : foreground;
        const ratio = contrast(fg, background);
        const large =
          fontSize >= 24 ||
          (fontSize >= 18.66 && Number.parseFloat(style.fontWeight) >= 700);
        const floor = large ? 3 : 4.5;
        if (ratio < floor) {
          push(
            "low-contrast",
            "warning",
            `文字对比度约 ${ratio.toFixed(1)}:1，低于 WCAG AA 的 ${floor}:1。`,
            element,
            textSnippet(element),
          );
        }
      }
    }

    if (element.scrollWidth > element.clientWidth + 2) {
      const overflow = style.overflowX;
      if (overflow === "visible" || overflow === "clip") {
        push(
          "horizontal-overflow",
          "advisory",
          "内容横向溢出容器，窄屏可能被裁切或撑破布局。",
          element,
          textSnippet(element),
        );
      }
    }

    if (["button", "a", "input", "select", "textarea"].includes(tag)) {
      if (rect.width < 32 || rect.height < 32) {
        push(
          "small-target",
          "advisory",
          `可点击区域约 ${Math.round(rect.width)}×${Math.round(rect.height)}px，小于 32px 触控建议值。`,
          element,
          textSnippet(element),
        );
      }
    }

    if (
      ["h1", "h2", "h3", "h4"].includes(tag) &&
      style.backgroundImage.includes("gradient") &&
      (style.webkitTextFillColor === "transparent" ||
        style.color === "rgba(0, 0, 0, 0)")
    ) {
      push(
        "gradient-text",
        "advisory",
        "标题使用渐变文字；确认这是有意的品牌选择，而不是模板化装饰。",
        element,
        textSnippet(element),
      );
    }
  }

  return findings.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1,
  );
}
