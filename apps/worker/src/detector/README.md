# Impeccable detector WASM

Vendored from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) v0.1.27,
Apache-2.0 (see `LICENSE`).

Built with:

```bash
wasm-pack build crates/wasm --target no-modules --release --features detect
```

`impeccable_wasm.js` has one local addition at the end:

```js
export default wasm_bindgen;
```

so the Worker can import the no-modules bundle and call:

```ts
detector.initSync({ module: wasmModule });
detector.detect_text_json(content, path, "{}");
```

Used by the `design_check` tool for deterministic source scans.
