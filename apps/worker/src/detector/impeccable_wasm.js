let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * The rule registry as JSON: `[{ id, name, category, severity, advisory, description }]`.
     * Built-ins in registry order, then any installed rule pack's rows.
     * @returns {string}
     */
    function antipatterns_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.antipatterns_json(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.antipatterns_json = antipatterns_json;

    /**
     * `collectBrowserFindings()`: `config_json` is `{ extensionMode,
     * disabledRules, disabledValues, skipScan, designSystem, lineLengthMax }`;
     * returns
     * `{ groups: [{ el, findings }], pageLevel: [...] }`.
     * @param {string} config_json
     * @returns {string}
     */
    function collect_browser_findings(config_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(config_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.collect_browser_findings(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.collect_browser_findings = collect_browser_findings;

    /**
     * One-shot: load `snapshot_json` and run `collectBrowserFindings` with
     * `config_json`. Returns `{ groups, pageLevel }` when the snapshot answered
     * everything, else `{ needs: { hitTests } }` — answer them (inline as
     * `hits` in the snapshot, or `snapshot_add_facts` + `collect_browser_findings`)
     * and run again. The snapshot stays loaded.
     * @param {string} snapshot_json
     * @param {string} config_json
     * @returns {string}
     */
    function collect_findings_from_snapshot(snapshot_json, config_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(snapshot_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(config_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.collect_findings_from_snapshot(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.collect_findings_from_snapshot = collect_findings_from_snapshot;

    /**
     * `collectVisualContrastCandidates(options)`: `options_json` is
     * `{ maxCandidates?, imageOnly? }`; returns the candidate array.
     * @param {string} options_json
     * @returns {string}
     */
    function collect_visual_contrast_candidates(options_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(options_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.collect_visual_contrast_candidates(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.collect_visual_contrast_candidates = collect_visual_contrast_candidates;

    /**
     * The static HTML engine over HTML already in memory: the parsed page, the
     * CSS cascade, the element and page rules, and the text-content analyzers.
     * `file_path` names the file in the findings; linked stylesheets are
     * resolved relative to it, which in wasm means only inline `<style>` blocks
     * contribute (there is no filesystem).
     * @param {string} html
     * @param {string} file_path
     * @param {string} options_json
     * @returns {string}
     */
    function detect_html_source_json(html, file_path, options_json) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(html, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(file_path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(options_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            wasm.detect_html_source_json(retptr, ptr0, len0, ptr1, len1, ptr2, len2);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred4_0 = r0;
            deferred4_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred4_0, deferred4_1, 1);
        }
    }
    exports.detect_html_source_json = detect_html_source_json;

    /**
     * The text/source engine (`impeccable detect` on anything but HTML): CSS,
     * JSX, TSX, Vue, Svelte, Astro, and plain source. `file_path` names the file
     * in the findings and picks the matchers by extension.
     * @param {string} content
     * @param {string} file_path
     * @param {string} options_json
     * @returns {string}
     */
    function detect_text_json(content, file_path, options_json) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(content, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(file_path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(options_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            wasm.detect_text_json(retptr, ptr0, len0, ptr1, len1, ptr2, len2);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred4_0 = r0;
            deferred4_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred4_0, deferred4_1, 1);
        }
    }
    exports.detect_text_json = detect_text_json;

    /**
     * The immediate tier: the rule ids the design hook fixes at edit time, as a
     * JSON array of strings.
     *
     * It rides the `detect` feature because the consumers that need it are the
     * ones scanning files without the binary. A reviewer downstream reads it to
     * decide how loudly a finding is reported, and copying the list into that
     * codebase is how the two drift apart.
     * @returns {string}
     */
    function immediate_tier_rules_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.immediate_tier_rules_json(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.immediate_tier_rules_json = immediate_tier_rules_json;

    /**
     * `isRenderedForBrowserRule(el)`.
     * @param {number} el
     * @returns {boolean}
     */
    function is_rendered_for_browser_rule(el) {
        const ret = wasm.is_rendered_for_browser_rule(el);
        return ret !== 0;
    }
    exports.is_rendered_for_browser_rule = is_rendered_for_browser_rule;

    /**
     * `measureHiddenTextDOM()`.
     * @returns {string}
     */
    function measure_hidden_text() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.measure_hidden_text(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.measure_hidden_text = measure_hidden_text;

    /**
     * `scopedIgnoreActive(el, ruleId)`.
     * @param {number} el
     * @param {string} rule_id
     * @returns {boolean}
     */
    function scoped_ignore_active(el, rule_id) {
        const ptr0 = passStringToWasm0(rule_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scoped_ignore_active(el, ptr0, len0);
        return ret !== 0;
    }
    exports.scoped_ignore_active = scoped_ignore_active;

    /**
     * `serializeFindings(allFindings)`: `groups_json` is `[{ el, findings }]`.
     * @param {string} groups_json
     * @returns {string}
     */
    function serialize_findings(groups_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(groups_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.serialize_findings(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.serialize_findings = serialize_findings;

    /**
     * Facts (`{ hits: [{ x, y, top, stack }] }`) answering an earlier
     * `snapshot_take_needs`.
     * @param {string} json
     * @returns {boolean}
     */
    function snapshot_add_facts(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.snapshot_add_facts(ptr0, len0);
        return ret !== 0;
    }
    exports.snapshot_add_facts = snapshot_add_facts;

    /**
     * Drop the loaded snapshot; exports go back to the live-page probe.
     */
    function snapshot_clear() {
        wasm.snapshot_clear();
    }
    exports.snapshot_clear = snapshot_clear;

    /**
     * Whether the calls since the last `snapshot_take_needs` asked something
     * the snapshot could not answer.
     * @returns {boolean}
     */
    function snapshot_has_needs() {
        const ret = wasm.snapshot_has_needs();
        return ret !== 0;
    }
    exports.snapshot_has_needs = snapshot_has_needs;

    /**
     * Load a page snapshot (JSON from `15-snapshot.js`) as the probe for every
     * following export call. Returns the element count, or `u32::MAX` when the
     * JSON did not parse (the previous snapshot, if any, is dropped either way).
     * @param {string} json
     * @returns {number}
     */
    function snapshot_load(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.snapshot_load(ptr0, len0);
        return ret >>> 0;
    }
    exports.snapshot_load = snapshot_load;

    /**
     * Whether a snapshot is the current probe.
     * @returns {boolean}
     */
    function snapshot_loaded() {
        const ret = wasm.snapshot_loaded();
        return ret !== 0;
    }
    exports.snapshot_loaded = snapshot_loaded;

    /**
     * The media intrinsics the capture recorded for `el` (`{ nw, nh, vw, vh,
     * w, h, cur, src }`), or `null`.
     * @param {number} el
     * @returns {string}
     */
    function snapshot_media(el) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.snapshot_media(retptr, el);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.snapshot_media = snapshot_media;

    /**
     * `node.parentElement || document.body` over the loaded snapshot (the
     * offscreen visual-contrast adapter's `parentOrBody`); 0 without a snapshot.
     * @param {number} el
     * @returns {number}
     */
    function snapshot_parent_or_body(el) {
        const ret = wasm.snapshot_parent_or_body(el);
        return ret >>> 0;
    }
    exports.snapshot_parent_or_body = snapshot_parent_or_body;

    /**
     * The pending questions as `{ hitTests: [[x, y], ...] }` (drained).
     * @returns {string}
     */
    function snapshot_take_needs() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.snapshot_take_needs(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.snapshot_take_needs = snapshot_take_needs;

    /**
     * Computed-style properties the rules asked for that the capture did not
     * record (a parity diagnostic; empty on a complete capture).
     * @returns {string}
     */
    function snapshot_unknown_style_props() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.snapshot_unknown_style_props(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.snapshot_unknown_style_props = snapshot_unknown_style_props;

    /**
     * `{ scrollX, scrollY, innerWidth, innerHeight }` of the loaded snapshot.
     * @returns {string}
     */
    function snapshot_viewport() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.snapshot_viewport(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.snapshot_viewport = snapshot_viewport;

    /**
     * The alpha-compositing step over the sample beneath.
     * @param {string} sample_json
     * @param {string} under_json
     * @returns {string}
     */
    function vc_alpha_composite(sample_json, under_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(sample_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(under_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.vc_alpha_composite(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.vc_alpha_composite = vc_alpha_composite;

    /**
     * `blendRgba(fg, bg)`: colors as `{r,g,b,a}` JSON or `null`.
     * @param {string} fg_json
     * @param {string} bg_json
     * @returns {string}
     */
    function vc_blend(fg_json, bg_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(fg_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(bg_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.vc_blend(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.vc_blend = vc_blend;

    /**
     * The walk's compositing fold: the translucent samples it passed through
     * (topmost first) over the opaque sample beneath them.
     * @param {string} pending_json
     * @param {string} ground_json
     * @returns {string}
     */
    function vc_composite_stack(pending_json, ground_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(pending_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(ground_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.vc_composite_stack(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.vc_composite_stack = vc_composite_stack;

    /**
     * `sampleCssBackground` plan for `node`: `{ kind: 'sample', sample }` or
     * `{ kind: 'url', url, size, position }`.
     * @param {number} node
     * @param {string} text_color_json
     * @returns {string}
     */
    function vc_css_plan(node, text_color_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(text_color_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_css_plan(retptr, node, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_css_plan = vc_css_plan;

    /**
     * `{ ...sample, method: 'canvas-background-image' }` when sampled, laid
     * over `node`'s own `background-color` where the pixel is translucent.
     * @param {number} node
     * @param {string} sample_json
     * @returns {string}
     */
    function vc_css_url_finish(node, sample_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(sample_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_css_url_finish(retptr, node, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_css_url_finish = vc_css_url_finish;

    /**
     * url path, no image loaded: `{ status: 'unresolved', reason: 'image
     * unavailable' }`, or the sample that ends the walk when the image's stated
     * placement covers neither the candidate `el`'s text nor `node`'s box.
     * @param {number} node
     * @param {number} el
     * @param {string} size
     * @param {string} position
     * @returns {string}
     */
    function vc_css_url_no_image(node, el, size, position) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(size, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(position, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.vc_css_url_no_image(retptr, node, el, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.vc_css_url_no_image = vc_css_url_no_image;

    /**
     * url path: source point on the loaded image (`{ point }` or `{ sample }`).
     * `el` is the candidate whose text is being sampled: an image that covers
     * neither its own box nor that text answers with a sample that ends the walk.
     * @param {number} node
     * @param {number} el
     * @param {number} intrinsic_w
     * @param {number} intrinsic_h
     * @param {string} size
     * @param {string} position
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    function vc_css_url_source_point(node, el, intrinsic_w, intrinsic_h, size, position, x, y) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(size, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(position, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.vc_css_url_source_point(retptr, node, el, intrinsic_w, intrinsic_h, ptr0, len0, ptr1, len1, x, y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.vc_css_url_source_point = vc_css_url_source_point;

    /**
     * `analyzeVisualContrastCandidate` after sampling: the result object.
     * @param {string} candidate_json
     * @param {string} text_color_json
     * @param {string} samples_json
     * @param {number} points_len
     * @returns {string}
     */
    function vc_finish_analysis(candidate_json, text_color_json, samples_json, points_len) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(candidate_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(text_color_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(samples_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            wasm.vc_finish_analysis(retptr, ptr0, len0, ptr1, len1, ptr2, len2, points_len);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred4_0 = r0;
            deferred4_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred4_0, deferred4_1, 1);
        }
    }
    exports.vc_finish_analysis = vc_finish_analysis;

    /**
     * `{ ...sample, method: 'canvas-img-underlay' }` when sampled.
     * @param {string} sample_json
     * @returns {string}
     */
    function vc_img_finish(sample_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(sample_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_img_finish(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_img_finish = vc_img_finish;

    /**
     * `sampleImageElement` retry with the separately loaded image: the source
     * point (`{x,y}` or `null`) using the loaded intrinsic size.
     * @param {string} painted_json
     * @param {number} loaded_w
     * @param {number} loaded_h
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    function vc_img_loaded_source_point(painted_json, loaded_w, loaded_h, x, y) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(painted_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_img_loaded_source_point(retptr, ptr0, len0, loaded_w, loaded_h, x, y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_img_loaded_source_point = vc_img_loaded_source_point;

    /**
     * `sampleImageElement` geometry: `intrinsic_*` = `naturalWidth || videoWidth
     * || width` (0 when none). Returns `{ painted, point }` or `{ sample }`.
     * @param {number} node
     * @param {number} intrinsic_w
     * @param {number} intrinsic_h
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    function vc_img_source_point(node, intrinsic_w, intrinsic_h, x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_img_source_point(retptr, node, intrinsic_w, intrinsic_h, x, y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_img_source_point = vc_img_source_point;

    /**
     * A picture's sample finished for the stack walk: faded by its own box's
     * opacity, or ending the walk where it could not be read
     * (`visual::media_sample`). `node` is the picture, `el` the text.
     * @param {number} node
     * @param {number} el
     * @param {string} sample_json
     * @returns {string}
     */
    function vc_media_sample(node, el, sample_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(sample_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_media_sample(retptr, node, el, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_media_sample = vc_media_sample;

    /**
     * `analyzeVisualContrast`: retry after scrollIntoView?
     * @param {string} result_json
     * @returns {boolean}
     */
    function vc_needs_scroll_retry(result_json) {
        const ptr0 = passStringToWasm0(result_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.vc_needs_scroll_retry(ptr0, len0);
        return ret !== 0;
    }
    exports.vc_needs_scroll_retry = vc_needs_scroll_retry;

    /**
     * `{ status: 'sampled', color: { r, g, b, a: a255 / 255 } }`.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {number} a255
     * @returns {string}
     */
    function vc_pixel_sample(r, g, b, a255) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_pixel_sample(retptr, r, g, b, a255);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_pixel_sample = vc_pixel_sample;

    /**
     * `analyzeVisualContrastCandidate` before sampling: `{ early }` (a finished
     * result) or `{ el, points: [{x,y}], textColor }`.
     * @param {string} candidate_json
     * @returns {string}
     */
    function vc_prepare_analysis(candidate_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(candidate_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_prepare_analysis(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_prepare_analysis = vc_prepare_analysis;

    /**
     * The canvas error → reason string (`'tainted image'` / `'image sample failed'`).
     * @param {string} message
     * @returns {string}
     */
    function vc_raster_error_reason(message) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(message, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_raster_error_reason(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_raster_error_reason = vc_raster_error_reason;

    /**
     * `{ status: 'unresolved', reason: reason || 'image sample failed' }`.
     * @param {string} reason
     * @returns {string}
     */
    function vc_raster_failure_sample(reason) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(reason, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_raster_failure_sample(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_raster_failure_sample = vc_raster_failure_sample;

    /**
     * `{ ...sample, method: 'canvas-<tag>-underlay' }` when sampled.
     * @param {number} node
     * @param {string} sample_json
     * @returns {string}
     */
    function vc_raster_finish(node, sample_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(sample_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_raster_finish(retptr, node, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_raster_finish = vc_raster_finish;

    /**
     * `{ status: 'unresolved', reason: 'canvas unavailable' }`.
     * @returns {string}
     */
    function vc_raster_no_context_sample() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_raster_no_context_sample(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_raster_no_context_sample = vc_raster_no_context_sample;

    /**
     * `sampleDrawablePixel` pixel address on the raster: `{x,y}`.
     * @param {string} plan_json
     * @param {number} source_x
     * @param {number} source_y
     * @returns {string}
     */
    function vc_raster_pixel(plan_json, source_x, source_y) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(plan_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_raster_pixel(retptr, ptr0, len0, source_x, source_y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_raster_pixel = vc_raster_pixel;

    /**
     * `sampleDrawablePixel` canvas sizing: `{ width, height, scaleX, scaleY }`.
     * @param {number} intrinsic_w
     * @param {number} intrinsic_h
     * @returns {string}
     */
    function vc_raster_plan(intrinsic_w, intrinsic_h) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_raster_plan(retptr, intrinsic_w, intrinsic_h);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_raster_plan = vc_raster_plan;

    /**
     * canvas/video underlay source point (`intrinsic_*` = `node.width ||
     * node.videoWidth`, 0 when none); `{x,y}` or `null`.
     * @param {number} node
     * @param {number} intrinsic_w
     * @param {number} intrinsic_h
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    function vc_raster_source_point(node, intrinsic_w, intrinsic_h, x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_raster_source_point(retptr, node, intrinsic_w, intrinsic_h, x, y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_raster_source_point = vc_raster_source_point;

    /**
     * A sampled color that ends the walk (no compositing beneath).
     * @param {string} sample_json
     * @returns {boolean}
     */
    function vc_sample_is_opaque(sample_json) {
        const ptr0 = passStringToWasm0(sample_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.vc_sample_is_opaque(ptr0, len0);
        return ret !== 0;
    }
    exports.vc_sample_is_opaque = vc_sample_is_opaque;

    /**
     * `sampleVisualBackgroundAtPoint` step 1: the nodes to walk for `el` at
     * `(x, y)` with their branch (`{ nodes: [{ el, kind }] }`), or the early
     * unresolved sample (`{ unresolved: {...} }`) when the depth cap is hit.
     * @param {number} el
     * @param {number} x
     * @param {number} y
     * @param {number} depth
     * @returns {string}
     */
    function vc_stack_nodes(el, x, y, depth) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_stack_nodes(retptr, el, x, y, depth);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_stack_nodes = vc_stack_nodes;

    /**
     * `textSamplePoints(rect)` for the live viewport: `[{x,y}]`.
     * @param {number} left
     * @param {number} top
     * @param {number} width
     * @param {number} height
     * @returns {string}
     */
    function vc_text_sample_points(left, top, width, height) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_text_sample_points(retptr, left, top, width, height);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_text_sample_points = vc_text_sample_points;

    /**
     * The walk's stop at paint it cannot read (an `unreadable` stack node).
     * @param {number} node
     * @returns {string}
     */
    function vc_unreadable_stack_sample(node) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.vc_unreadable_stack_sample(retptr, node);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
        }
    }
    exports.vc_unreadable_stack_sample = vc_unreadable_stack_sample;

    /**
     * The walk's final unresolved sample from the collected reasons (`[string]`).
     * @param {string} reasons_json
     * @returns {string}
     */
    function vc_unresolved_from_reasons(reasons_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(reasons_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.vc_unresolved_from_reasons(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
        }
    }
    exports.vc_unresolved_from_reasons = vc_unresolved_from_reasons;

    /**
     * `addVisualContrastResult` step 1: the element the result attaches to
     * (0 when nothing should be added).
     * @param {string} result_json
     * @returns {number}
     */
    function visual_contrast_result_el(result_json) {
        const ptr0 = passStringToWasm0(result_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.visual_contrast_result_el(ptr0, len0);
        return ret >>> 0;
    }
    exports.visual_contrast_result_el = visual_contrast_result_el;

    /**
     * `addVisualContrastResult` step 2: the finding to append to `el`'s group,
     * or `null`.
     * @param {number} el
     * @param {string} existing_json
     * @param {string} result_json
     * @returns {string}
     */
    function visual_contrast_result_finding(el, existing_json, result_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(existing_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(result_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.visual_contrast_result_finding(retptr, el, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred3_0 = r0;
            deferred3_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
        }
    }
    exports.visual_contrast_result_finding = visual_contrast_result_finding;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_string_get_d154f1e671052120: function(arg0, arg1) {
                const obj = getObject(arg1);
                const ret = typeof(obj) === 'string' ? obj : undefined;
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_attr_f7cffdd8ab117a14: function(arg0, arg1, arg2, arg3) {
                const ret = __impeccableDom.attr(arg1 >>> 0, getStringFromWasm0(arg2, arg3));
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_body_caa8f82abe0dd9a5: function() {
                const ret = __impeccableDom.body();
                return ret;
            },
            __wbg_check_visibility_e773caf05f01d211: function(arg0) {
                const ret = __impeccableDom.check_visibility(arg0 >>> 0);
                return ret;
            },
            __wbg_child_node_kinds_c4ad3401940fe017: function(arg0, arg1) {
                const ret = __impeccableDom.child_node_kinds(arg1 >>> 0);
                const ptr1 = passArray32ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_children_23a97e3759285957: function(arg0, arg1) {
                const ret = __impeccableDom.children(arg1 >>> 0);
                const ptr1 = passArray32ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_class_name_prop_9ad9b7cf3f8cb4c0: function(arg0, arg1) {
                const ret = __impeccableDom.class_name_prop(arg1 >>> 0);
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_client_height_c7b24d9dd799474a: function(arg0) {
                const ret = __impeccableDom.client_height(arg0 >>> 0);
                return ret;
            },
            __wbg_client_left_47d6c74a097050ec: function(arg0) {
                const ret = __impeccableDom.client_left(arg0 >>> 0);
                return ret;
            },
            __wbg_client_width_f48645643fcc42c2: function(arg0) {
                const ret = __impeccableDom.client_width(arg0 >>> 0);
                return ret;
            },
            __wbg_closest_25be97fb788b7b69: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.closest(arg0 >>> 0, getStringFromWasm0(arg1, arg2));
                return ret;
            },
            __wbg_contains_d3049a44abfd5e57: function(arg0, arg1) {
                const ret = __impeccableDom.contains(arg0 >>> 0, arg1 >>> 0);
                return ret;
            },
            __wbg_css_escape_3471c6eea7a4c663: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.css_escape(getStringFromWasm0(arg1, arg2));
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_direct_text_nodes_b7f12a7d3666fcd1: function(arg0, arg1) {
                const ret = __impeccableDom.direct_text_nodes(arg1 >>> 0);
                const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_direct_text_rect_7e961a86ad9886ff: function(arg0, arg1) {
                const ret = __impeccableDom.direct_text_rect(arg1 >>> 0);
                const ptr1 = passArrayF64ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_document_element_d14391e7118f0e05: function() {
                const ret = __impeccableDom.document_element();
                return ret;
            },
            __wbg_document_font_faces_9238c78c919b80d3: function(arg0) {
                const ret = __impeccableDom.document_font_faces();
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_document_html_for_patterns_9d2777c793ee3813: function(arg0) {
                const ret = __impeccableDom.document_html_for_patterns();
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_element_from_point_9a2d04ab182a1203: function(arg0, arg1) {
                const ret = __impeccableDom.element_from_point(arg0, arg1);
                return ret;
            },
            __wbg_elements_from_point_f909a656b2012edf: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.elements_from_point(arg1, arg2);
                const ptr1 = passArray32ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_hidden_prop_2f7c64b01eed56a6: function(arg0) {
                const ret = __impeccableDom.hidden_prop(arg0 >>> 0);
                return ret;
            },
            __wbg_hostname_207c68e944d5b8d7: function(arg0) {
                const ret = __impeccableDom.hostname();
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_id_prop_968dd20a17508bdf: function(arg0, arg1) {
                const ret = __impeccableDom.id_prop(arg1 >>> 0);
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_image_complete_b43b6aada2d35ed3: function(arg0) {
                const ret = __impeccableDom.image_complete(arg0 >>> 0);
                return ret;
            },
            __wbg_image_current_src_20fed088a8f1ae20: function(arg0, arg1) {
                const ret = __impeccableDom.image_current_src(arg1 >>> 0);
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_image_natural_size_6c1e6fa4e4cfa88d: function(arg0, arg1) {
                const ret = __impeccableDom.image_natural_size(arg1 >>> 0);
                const ptr1 = passArrayF64ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_inner_height_03a4c676de8c57cc: function() {
                const ret = __impeccableDom.inner_height();
                return ret;
            },
            __wbg_inner_text_0447c30bc7468f82: function(arg0, arg1) {
                const ret = __impeccableDom.inner_text(arg1 >>> 0);
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_inner_width_df9f3e978a98f9bc: function() {
                const ret = __impeccableDom.inner_width();
                return ret;
            },
            __wbg_is_content_editable_5fe47e6ee87eac1b: function(arg0) {
                const ret = __impeccableDom.is_content_editable(arg0 >>> 0);
                return ret;
            },
            __wbg_keyframe_keys_9255ed9ec34cac8f: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.keyframe_keys(getStringFromWasm0(arg1, arg2));
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_keyframes_a913a2961a8ad4dc: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.keyframes(getStringFromWasm0(arg1, arg2));
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_last_word_rects_7f30d2c332c8c92e: function(arg0, arg1) {
                const ret = __impeccableDom.last_word_rects(arg1 >>> 0);
                const ptr1 = passArrayF64ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_linked_stylesheet_text_690d7c849b1c8c7e: function(arg0) {
                const ret = __impeccableDom.linked_stylesheet_text();
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_matches_b6a33b9088b4be69: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.matches(arg0 >>> 0, getStringFromWasm0(arg1, arg2));
                return ret;
            },
            __wbg_namespace_uri_fa86a35cbb3cfa19: function(arg0, arg1) {
                const ret = __impeccableDom.namespace_uri(arg1 >>> 0);
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_next_element_sibling_143bb38377d6a95f: function(arg0) {
                const ret = __impeccableDom.next_element_sibling(arg0 >>> 0);
                return ret;
            },
            __wbg_offset_height_c770f26b8e0da3cd: function(arg0) {
                const ret = __impeccableDom.offset_height(arg0 >>> 0);
                return ret;
            },
            __wbg_offset_width_80920ffe717bdb2f: function(arg0) {
                const ret = __impeccableDom.offset_width(arg0 >>> 0);
                return ret;
            },
            __wbg_parent_9763a381b5952589: function(arg0) {
                const ret = __impeccableDom.parent(arg0 >>> 0);
                return ret;
            },
            __wbg_previous_element_sibling_01c2ad9707746486: function(arg0) {
                const ret = __impeccableDom.previous_element_sibling(arg0 >>> 0);
                return ret;
            },
            __wbg_pseudo_style_a358449720909457: function(arg0, arg1, arg2, arg3, arg4, arg5) {
                const ret = __impeccableDom.pseudo_style(arg1 >>> 0, getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5));
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_query_all_6f667e73a740fd7c: function(arg0, arg1, arg2, arg3) {
                const ret = __impeccableDom.query_all(arg1 >>> 0, getStringFromWasm0(arg2, arg3));
                const ptr1 = passArray32ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_query_one_8ee4b92ee1621105: function(arg0, arg1, arg2) {
                const ret = __impeccableDom.query_one(arg0 >>> 0, getStringFromWasm0(arg1, arg2));
                return ret;
            },
            __wbg_rect_9949a7da2462cc82: function(arg0, arg1) {
                const ret = __impeccableDom.rect(arg1 >>> 0);
                const ptr1 = passArrayF64ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_rendered_faces_f4a9eb7105ca60a0: function(arg0) {
                const ret = __impeccableDom.rendered_faces();
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_running_animation_properties_690ecb01a5621c9a: function(arg0, arg1) {
                const ret = __impeccableDom.running_animation_properties(arg1 >>> 0);
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_scroll_height_cc0ba769260253d4: function(arg0) {
                const ret = __impeccableDom.scroll_height(arg0 >>> 0);
                return ret;
            },
            __wbg_scroll_left_859085698b74c9ab: function(arg0) {
                const ret = __impeccableDom.scroll_left(arg0 >>> 0);
                return ret;
            },
            __wbg_scroll_width_27cd555b56605b5e: function(arg0) {
                const ret = __impeccableDom.scroll_width(arg0 >>> 0);
                return ret;
            },
            __wbg_scroll_x_777709966b01fe51: function() {
                const ret = __impeccableDom.scroll_x();
                return ret;
            },
            __wbg_scroll_y_73e8732f40c1f070: function() {
                const ret = __impeccableDom.scroll_y();
                return ret;
            },
            __wbg_shadow_children_10dda6e6fda109f0: function(arg0, arg1) {
                const ret = __impeccableDom.shadow_children(arg1 >>> 0);
                const ptr1 = passArray32ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_style_da16754d5afb6993: function(arg0, arg1, arg2, arg3) {
                const ret = __impeccableDom.style(arg1 >>> 0, getStringFromWasm0(arg2, arg3));
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_tag_name_fd8d13d6bd867642: function(arg0, arg1) {
                const ret = __impeccableDom.tag_name(arg1 >>> 0);
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_text_content_3f971f2d869f94a3: function(arg0, arg1) {
                const ret = __impeccableDom.text_content(arg1 >>> 0);
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_text_rects_8191669ea61a47ee: function(arg0, arg1) {
                const ret = __impeccableDom.text_rects(arg1 >>> 0);
                const ptr1 = passArrayF64ToWasm0(ret, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg_text_wrap_pretty_supported_70aae58f81aa04e9: function() {
                const ret = __impeccableDom.text_wrap_pretty_supported();
                return ret;
            },
            __wbg_video_ready_state_f8540d23b36b0def: function(arg0) {
                const ret = __impeccableDom.video_ready_state(arg0 >>> 0);
                return ret;
            },
            __wbindgen_object_drop_ref: function(arg0) {
                takeObject(arg0);
            },
        };
        return {
            __proto__: null,
            "./impeccable_wasm_bg.js": import0,
        };
    }

    function addHeapObject(obj) {
        if (heap_next === heap.length) heap.push(heap.length + 1);
        const idx = heap_next;
        heap_next = heap[idx];

        heap[idx] = obj;
        return idx;
    }

    function dropObject(idx) {
        if (idx < 1028) return;
        heap[idx] = heap_next;
        heap_next = idx;
    }

    let cachedDataViewMemory0 = null;
    function getDataViewMemory0() {
        if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
            cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
        }
        return cachedDataViewMemory0;
    }

    let cachedFloat64ArrayMemory0 = null;
    function getFloat64ArrayMemory0() {
        if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
            cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
        }
        return cachedFloat64ArrayMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint32ArrayMemory0 = null;
    function getUint32ArrayMemory0() {
        if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
            cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
        }
        return cachedUint32ArrayMemory0;
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function getObject(idx) { return heap[idx]; }

    let heap = new Array(1024).fill(undefined);
    heap.push(undefined, null, true, false);

    let heap_next = heap.length;

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    function passArray32ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 4, 4) >>> 0;
        getUint32ArrayMemory0().set(arg, ptr / 4);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArrayF64ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 8, 8) >>> 0;
        getFloat64ArrayMemory0().set(arg, ptr / 8);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArrayJsValueToWasm0(array, malloc) {
        const ptr = malloc(array.length * 4, 4) >>> 0;
        const mem = getDataViewMemory0();
        for (let i = 0; i < array.length; i++) {
            mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
        }
        WASM_VECTOR_LEN = array.length;
        return ptr;
    }

    function passStringToWasm0(arg, malloc, realloc) {
        if (realloc === undefined) {
            const buf = cachedTextEncoder.encode(arg);
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

        let offset = 0;

        for (; offset < len; offset++) {
            const code = arg.charCodeAt(offset);
            if (code > 0x7F) break;
            mem[ptr + offset] = code;
        }
        if (offset !== len) {
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    function takeObject(idx) {
        const ret = getObject(idx);
        dropObject(idx);
        return ret;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedDataViewMemory0 = null;
        cachedFloat64ArrayMemory0 = null;
        cachedUint32ArrayMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (!module.ok) {
                throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
            }

            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });

export default wasm_bindgen;
