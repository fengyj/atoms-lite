import wasmModule from "./impeccable_wasm_bg.wasm";
import detector from "./impeccable_wasm.js";

export type DetectorFinding = {
  antipattern: string;
  name?: string;
  description?: string;
  severity?: "warning" | "advisory" | "error";
  advisory?: boolean;
  category?: string;
  file?: string;
  line?: number;
  snippet?: string;
};

let initialized = false;

function ensure() {
  if (initialized) return;
  detector.initSync({ module: wasmModule });
  initialized = true;
}

function parse(raw: string): DetectorFinding[] {
  try {
    const parsed = JSON.parse(raw) as DetectorFinding[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function detectTextSource(
  content: string,
  filePath: string,
  options: Record<string, unknown> = {},
): DetectorFinding[] {
  ensure();
  return parse(detector.detect_text_json(content, filePath, JSON.stringify(options)));
}

export function detectHtmlSource(
  html: string,
  filePath: string,
  options: Record<string, unknown> = {},
): DetectorFinding[] {
  ensure();
  return parse(
    detector.detect_html_source_json(html, filePath, JSON.stringify(options)),
  );
}
