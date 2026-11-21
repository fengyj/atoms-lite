"use client";

import { useEffect, useState } from "react";
import {
  collectElementSelection,
  type ElementSelection,
} from "./element-selection";

/**
 * 给同源 iframe 挂元素选择器。
 * 只在用户主动开启（enabled）时挂 mouseover/click/keydown，选中后由 onPicked
 * 关闭选择模式；跨端口本地预览读不到 contentDocument 时返回 pickerError。
 */
export function useElementPicker({
  enabled,
  getIframe,
  frameKey,
  onPicked,
  onCancel,
}: {
  enabled: boolean;
  getIframe: () => HTMLIFrameElement | null;
  /** iframe 重新加载时递增，用于重新挂监听 */
  frameKey: number;
  onPicked: (selection: ElementSelection) => void;
  onCancel: () => void;
}) {
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPickerError(null);
      return;
    }

    let doc: Document | null = null;
    try {
      doc = getIframe()?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) {
      setPickerError(
        "无法读取预览 DOM：本地开发时预览与主站不同源，生产环境可用。",
      );
      return;
    }

    setPickerError(null);
    let highlighted: HTMLElement | null = null;
    let previousOutline = "";
    let previousOffset = "";

    const clearHighlight = () => {
      if (!highlighted) return;
      highlighted.style.outline = previousOutline;
      highlighted.style.outlineOffset = previousOffset;
      highlighted = null;
    };

    const onOver = (event: Event) => {
      const target = event.target;
      if (!(target instanceof doc!.defaultView!.HTMLElement)) return;
      if (target === highlighted) return;
      clearHighlight();
      highlighted = target;
      previousOutline = target.style.outline;
      previousOffset = target.style.outlineOffset;
      target.style.outline = "2px solid #8f9fff";
      target.style.outlineOffset = "2px";
    };

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof doc!.defaultView!.Element)) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = collectElementSelection(target);
      clearHighlight();
      onPicked(selection);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearHighlight();
        onCancel();
      }
    };

    doc.addEventListener("mouseover", onOver, true);
    doc.addEventListener("mouseout", clearHighlight, true);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("keydown", onKey, true);
    return () => {
      clearHighlight();
      doc?.removeEventListener("mouseover", onOver, true);
      doc?.removeEventListener("mouseout", clearHighlight, true);
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("keydown", onKey, true);
    };
  }, [enabled, frameKey, getIframe, onPicked, onCancel]);

  return { pickerError };
}
