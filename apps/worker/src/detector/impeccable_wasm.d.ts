declare const detector: {
  initSync(input?: { module?: WebAssembly.Module } | WebAssembly.Module): unknown;
  detect_text_json(content: string, filePath: string, optionsJson: string): string;
  detect_html_source_json(
    html: string,
    filePath: string,
    optionsJson: string,
  ): string;
  antipatterns_json(): string;
};

export default detector;
