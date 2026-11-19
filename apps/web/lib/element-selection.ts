export type ElementSelection = {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  text: string;
  outerHTML: string;
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  url: string;
};

const STYLE_KEYS = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "gap",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "color",
  "background-color",
  "border",
  "border-radius",
  "box-shadow",
  "flex-direction",
  "justify-content",
  "align-items",
  "grid-template-columns",
] as const;

function escapeCss(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function selectorFor(element: Element): string {
  if (element.id) return `#${escapeCss(element.id)}`;
  const doc = element.ownerDocument;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === 1 && current !== doc.body) {
    let part = current.tagName.toLowerCase();
    const classes = Array.from(current.classList).slice(0, 3);
    if (classes.length > 0) {
      part += `.${classes.map(escapeCss).join(".")}`;
    }
    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    if (parts.length >= 4) break;
    current = current.parentElement;
  }
  return parts.join(" > ");
}

export function collectElementSelection(element: Element): ElementSelection {
  const view = element.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(element) ?? getComputedStyle(element);
  const styles: Record<string, string> = {};
  for (const key of STYLE_KEYS) {
    const value = computed.getPropertyValue(key).trim();
    if (value) styles[key] = value.slice(0, 200);
  }
  const rect = element.getBoundingClientRect();
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList).slice(0, 8),
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    outerHTML: element.outerHTML.slice(0, 3000),
    styles,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    url: view?.location.href ?? window.location.href,
  };
}
