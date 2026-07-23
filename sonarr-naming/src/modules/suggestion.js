import { NETWORKS, EDITIONS, HDTV_FIX, MAX_LANG } from "./constants.js";
import { getSpData } from "./state.js";
import { apiReq, waitForCommand, waitForFileUpdate } from "./api.js";
import { fmtEp, firstEp, showToast } from "./utils.js";
import { buildValue, needsRGSuggestion } from "./rg-parser.js";
import { makeSelect2 } from "./pickers.js";
import { mapLangNameToCode, suggestRGFromFile, sortedLangs } from "./lang.js";
import { advanceRenameThenStrip } from "./flow-steps.js";
import { createProgress } from "./progress-ui.js";

// ── RG Suggestion — detect missing Audio in Release Group, suggest from mediaInfo ──

/** Re-fetch files and rebuild RG suggestion panel. Called from the 💡 FAB. */
export async function recheckRGSuggestions() {
    const _spData = getSpData();
    if (!_spData?.series) return;
    try {
        const files = await apiReq("GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`);
        _spData.files = files;

        const candidates = _buildSuggCandidates(files, _spData.epMap, _spData.series);

        if (candidates.length > 0) {
            buildRGSuggestionUI(_spData.series, candidates);
        } else {
            document.getElementById("rg-sugg-panel")?.remove();
            showToast("✓ All files have Audio in Release Group");
            document.getElementById("rg-suggest-btn")?.classList.remove("has-suggestions");
        }
    } catch (e) {
        showToast("✗ " + e.message.slice(0, 60));
    }
}

/** Build sorted suggestion candidate list from files + epMap. */
export function _buildSuggCandidates(files, epMap, series) {
    // Derive the series' original language code (e.g. "KO" for Korean)
    // used as the 3rd-priority slot in sortAudioCodes.
    const originalCode = mapLangNameToCode(series?.originalLanguage?.name ?? "");
    return files
        .filter(f => needsRGSuggestion(f))
        .map(f => ({
            ...f,
            ep:         epMap.get(f.id) ?? [],
            suggestion: suggestRGFromFile(f, originalCode),
        }))
        .filter(c => c.suggestion !== null)
        .sort((a, b) => {
            const ae = firstEp(a.ep), be = firstEp(b.ep);
            const ds = (ae?.seasonNumber ?? 0) - (be?.seasonNumber ?? 0);
            return ds !== 0 ? ds : (ae?.episodeNumber ?? 0) - (be?.episodeNumber ?? 0);
        });
}

/** Build the RG suggestion slide panel. */
export function buildRGSuggestionUI(series, candidates) {
    document.getElementById("rg-sugg-panel")?.remove();

    // ── Most common suggestion (for pre-fill) ────────────────────────────
    const counts = new Map();
    for (const c of candidates) {
        if (!c.suggestion) continue;
        const key = c.suggestion.audioCodes.join(",") + "|" + c.suggestion.subCodes.join(",");
        const prev = counts.get(key);
        if (prev) prev.count++;
        else counts.set(key, { count: 1, suggestion: c.suggestion });
    }
    let bestSugg = { audioCodes: [], subCodes: [] };
    let bestCount = 0;
    counts.forEach(({ count, suggestion }) => {
        if (count > bestCount) { bestCount = count; bestSugg = suggestion; }
    });

    // ── HDTV candidates ──────────────────────────────────────────────────
    const hdtvFiles = candidates.filter(c => HDTV_FIX[c.quality?.quality?.id]);

    // ── Total episode count (for multi-episode files) ────────────────────
    const totalEpCount = candidates.reduce(
        (s, c) => s + (Array.isArray(c.ep) ? c.ep.length : (c.ep ? 1 : 0)), 0);

    // ── Group by season (use first episode in multi-ep files) ────────────
    const bySeason = new Map();
    for (const c of candidates) {
        const sn = firstEp(c.ep)?.seasonNumber ?? 0;
        if (!bySeason.has(sn)) bySeason.set(sn, []);
        bySeason.get(sn).push(c);
    }
    const seasons = [...bySeason.keys()].sort((a, b) => a - b);
    const checked = new Set(candidates.map(c => c.id));

    // ── Panel skeleton ───────────────────────────────────────────────────
    const renameNowDefault = GM_getValue("rgsp_rename_now", true);

    const panel = document.createElement("div");
    panel.id = "rg-sugg-panel";
    const descHtml = (() => {
        const f = candidates.length, e = totalEpCount;
        const fLabel = `<strong>${f}</strong> file${f > 1 ? "s" : ""}`;
        const eLabel = e !== f ? ` (<strong>${e}</strong> episode${e > 1 ? "s" : ""})` : "";
        return `${fLabel}${eLabel} have no language in their Release Group.`;
    })();
    panel.classList.add("rgm-overlay");
    panel.innerHTML = `
        <div class="rgm-modal rgm-modal--wide">
            <div class="rgm-head">
                <span class="rgm-title">💡 Suggest Release Group</span>
                <span class="rgm-close">✕</span>
            </div>
            <div class="rgm-main">
                <div class="rgm-left">
                    <p class="rgm-desc">${descHtml} คลิกไฟล์เพื่อแก้ทีละตัว หรือแก้ที่นี่เพื่อใช้กับไฟล์ที่ติ๊กทั้งหมด</p>
                    <div class="rgm-section-lbl">
                        Release Group
                        <span class="rgsp-edit-target-bar">— editing: <span id="rgsp-edit-target-val" class="rgsp-edit-target-val">All files</span></span>
                    </div>
                    <div class="rgm-picker-box" id="rgsp-picker-box"></div>
                    <div class="rgm-section-lbl">Preview</div>
                    <div id="rgsp-preview" class="rgm-preview empty">—</div>
                    ${hdtvFiles.length > 0 ? `
                    <label class="rgm-opt-row">
                        <input type="checkbox" class="rgm-chk" id="rgsp-q-fix" checked>
                        <span class="rgm-opt-txt">
                            <span class="rgm-opt-label">Fix HDTV → WEBDL for ${hdtvFiles.length} file${hdtvFiles.length > 1 ? "s" : ""}</span>
                            <span class="rgm-opt-detail">e.g. HDTV-1080p → WEBDL-1080p</span>
                        </span>
                    </label>` : ""}
                    <label class="rgm-opt-row">
                        <input type="checkbox" class="rgm-chk" id="rgsp-rename-now" ${renameNowDefault ? "checked" : ""}>
                        <span class="rgm-opt-txt">
                            <span class="rgm-opt-label">Rename files immediately after applying</span>
                            <span class="rgm-opt-detail">Uncheck to show rename confirmation popup first</span>
                        </span>
                    </label>
                </div>
                <div class="rgm-right">
                    <div class="rgm-section-lbl">Files (${candidates.length})
                        <span class="rgm-hint">— click a row to edit its Release Group</span>
                    </div>
                    <div class="rfp-tree" id="rgsp-tree"></div>
                    <div class="rgsp-status" id="rgsp-status"></div>
                </div>
            </div>
            <div class="rgm-footer">
                <button class="rgm-btn rgm-btn--ghost" id="rgsp-cancel">Dismiss</button>
                <button class="rgm-btn rgm-btn--primary" id="rgsp-apply" disabled>Apply (0)</button>
            </div>
        </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    const closeSugg = () => { panel.classList.remove("open"); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") closeSugg(); };
    document.addEventListener("keydown", onKey);
    // Backdrop blocks page clicks but does NOT close — prevents accidental dismiss
    panel.addEventListener("mousedown", e => { if (e.target === panel) { e.preventDefault(); e.stopPropagation(); } });

    // ── Picker ───────────────────────────────────────────────────────────
    const pickerBox = panel.querySelector("#rgsp-picker-box");
    const mkField = (label, comp) => {
        const f = document.createElement("div"); f.className = "rgm-field";
        const l = document.createElement("div"); l.className = "rgm-sub-lbl"; l.textContent = label;
        f.append(l, comp.el);
        return f;
    };

    const netComp   = makeSelect2(NETWORKS, [], syncPreview, "network");
    const edtComp   = makeSelect2(EDITIONS, [], syncPreview, "edition");
    const audioComp = makeSelect2(sortedLangs(), bestSugg.audioCodes, syncPreview, "audio", MAX_LANG);
    const subComp   = makeSelect2(sortedLangs(), bestSugg.subCodes,   syncPreview, "sub",   MAX_LANG);

    const langRow = document.createElement("div"); langRow.className = "rgm-lang-row";
    langRow.append(mkField("Audio", audioComp), mkField("Subtitle", subComp));
    pickerBox.append(mkField("Network", netComp), mkField("Edition", edtComp), langRow);

    const preview = panel.querySelector("#rgsp-preview");
    // ── File tree — declared BEFORE syncPreview() to avoid TDZ error ─────
    const tree = panel.querySelector("#rgsp-tree");

    // ── Per-file editable values, initialized from each file's suggestion ─
    // Maps fileId → { audioCodes, subCodes, nets, edts }
    const fileValues = new Map();
    for (const c of candidates) {
        fileValues.set(c.id, {
            audioCodes: c.suggestion ? [...c.suggestion.audioCodes] : [],
            subCodes:   c.suggestion ? [...c.suggestion.subCodes]   : [],
            nets: [], edts: [],
        });
    }

    // ── editTarget: null = "All files" | {isSeason, sn, files} | candidate ──
    let editTarget = null;

    /**
     * Load values for the given target into the picker.
     *   null                      → "All files" mode  (only nets/edts propagate)
     *   {isSeason, sn, files}     → season mode       (all dims for that season)
     *   candidate object          → per-file mode     (all dims for that file)
     */
    function loadTarget(target) {
        editTarget = target;
        const lbl = panel.querySelector("#rgsp-edit-target-val");

        // ── Label ──
        if (lbl) {
            if (!target)             lbl.textContent = "All files";
            else if (target.isSeason) lbl.textContent = `Season ${target.sn} (${target.files.length} file${target.files.length > 1 ? "s" : ""})`;
            else                      lbl.textContent = fmtEp(target.ep);
        }

        // ── Highlight season heads ──
        tree.querySelectorAll(".rfp-season-head[data-sn]").forEach(h =>
            h.classList.toggle("rgsp-season-focused",
                target?.isSeason && String(h.dataset.sn) === String(target.sn)));

        // ── Highlight episode rows ──
        tree.querySelectorAll(".rfp-ep-row").forEach(row => {
            let focused = false;
            if (target?.isSeason)   focused = target.files.some(f => String(f.id) === row.dataset.fileId);
            else if (target)        focused = row.dataset.fileId === String(target.id);
            row.classList.toggle("rgsp-focused", focused);
        });

        // ── Values to load into the picker ──
        let vals;
        if (!target) {
            vals = { audioCodes: bestSugg.audioCodes, subCodes: bestSugg.subCodes, nets: [], edts: [] };
        } else if (target.isSeason) {
            // Seed from the first file in the season that has values
            const seed = target.files.find(f => fileValues.has(f.id));
            vals = seed ? { ...fileValues.get(seed.id) } : { audioCodes: [], subCodes: [], nets: [], edts: [] };
        } else {
            vals = fileValues.get(target.id) ?? { audioCodes: [], subCodes: [], nets: [], edts: [] };
        }

        netComp.set(vals.nets,         true);
        edtComp.set(vals.edts,         true);
        audioComp.set(vals.audioCodes,  true);
        subComp.set(vals.subCodes,      true);

        // Update preview without writing back to fileValues
        const val = buildValue(vals.nets, vals.edts, vals.audioCodes, vals.subCodes);
        preview.textContent = val || "—";
        preview.className = "rgm-preview" +
            (!val ? " empty" : vals.nets.length || vals.edts.length ? " has-network" : "");
    }

    // Guard: prevent syncPreview from overwriting per-file values during initial setup.
    // Picker constructors may fire the callback when setting initial values; we only
    // want those writes to happen after the tree is fully rendered.
    let initialized = false;

    /** Called whenever the picker changes — saves to fileValues and updates rows. */
    function syncPreview() {
        const nets = netComp.get(), edts = edtComp.get();
        const audio = audioComp.get(), sub = subComp.get();
        const val = buildValue(nets, edts, audio, sub);

        preview.textContent = val || "—";
        preview.className = "rgm-preview" +
            (!val ? " empty" : nets.length || edts.length ? " has-network" : "");

        // Don't touch fileValues until initialization is complete
        if (!initialized) return;

        if (editTarget?.isSeason) {
            // Season mode: apply ALL dimensions to all checked files in this season
            const newVals = { audioCodes: audio, subCodes: sub, nets, edts };
            for (const f of editTarget.files) {
                if (!checked.has(f.id)) continue;
                fileValues.set(f.id, { ...newVals });
                const span = tree.querySelector(`.rgsp-new-rg[data-file-id="${f.id}"]`);
                if (span) span.textContent = val || "—";
            }
        } else if (editTarget) {
            // Per-file mode: save all dimensions to the focused file
            fileValues.set(editTarget.id, { audioCodes: audio, subCodes: sub, nets, edts });
            const span = tree.querySelector(`.rgsp-new-rg[data-file-id="${editTarget.id}"]`);
            if (span) span.textContent = val || "—";
        } else {
            // "All files" mode: only nets & edts propagate — audio/sub stay per-file
            for (const c of candidates) {
                if (!checked.has(c.id)) continue;
                const fv = fileValues.get(c.id);
                if (fv) fileValues.set(c.id, { ...fv, nets, edts });
            }
            // Refresh tree rows using each file's own audio/sub
            tree.querySelectorAll(".rgsp-new-rg[data-file-id]").forEach(el => {
                const id = parseInt(el.dataset.fileId);
                if (!checked.has(id)) return;
                const fv = fileValues.get(id);
                if (fv) el.textContent = buildValue(fv.nets, fv.edts, fv.audioCodes, fv.subCodes) || "—";
            });
        }
        updateApplyBtn();
    }

    // Quality fix checkbox: toggle badge visibility in tree
    const qFixChk = panel.querySelector("#rgsp-q-fix");
    qFixChk?.addEventListener("change", () => {
        const show = qFixChk.checked;
        tree.querySelectorAll(".rgsp-quality-badge").forEach(el =>
            el.style.display = show ? "" : "none");
    });

    function renderTree() {
        tree.innerHTML = "";
        for (const sn of seasons) {
            const files = bySeason.get(sn);
            const allC  = files.every(f => checked.has(f.id));
            const someC = files.some(f => checked.has(f.id));
            let expanded = true;

            const block = document.createElement("div");
            block.className = "rfp-season-block";

            const head = document.createElement("div");
            head.className = "rfp-season-head";
            head.dataset.sn = sn;
            head.innerHTML = `
                <input type="checkbox" class="rfp-chk rfp-season-chk" data-sn="${sn}">
                <span class="rfp-season-label" title="Click to edit this season's Release Group">
                    Season ${sn} <em>(${files.length} file${files.length > 1 ? "s" : ""})</em>
                </span>
                <span class="rfp-toggle">▲</span>`;
            block.appendChild(head);

            const chk = head.querySelector(".rfp-season-chk");
            chk.checked = allC; chk.indeterminate = someC && !allC;

            const epList = document.createElement("div");
            epList.className = "rfp-ep-list";

            for (const c of files) {
                const row = document.createElement("div");
                row.className = "rfp-ep-row";
                row.dataset.fileId = c.id;
                const vals = fileValues.get(c.id);
                const suggStr = vals
                    ? buildValue(vals.nets, vals.edts, vals.audioCodes, vals.subCodes)
                    : "(no mediaInfo)";
                const qualFix = HDTV_FIX[c.quality?.quality?.id];

                // Row has checkbox + clickable edit area
                row.innerHTML = `
                    <input type="checkbox" class="rfp-chk rfp-ep-chk" data-id="${c.id}"
                        ${checked.has(c.id) ? "checked" : ""}>
                    <div class="rfp-ep-edit-area" title="Click to edit this file's Release Group">
                        <span class="rfp-ep-label">${fmtEp(c.ep)}</span>
                        <span class="rfp-old">${c.releaseGroup || "(none)"}</span>
                        <span class="rfp-arrow">→</span>
                        <span class="rfp-new rgsp-new-rg" data-file-id="${c.id}">${suggStr}</span>
                        ${qualFix ? `<span class="rgsp-quality-badge">🎬${c.quality.quality.name}→${qualFix.name}</span>` : ""}
                    </div>`;
                epList.appendChild(row);

                // Click on the edit area → focus this file in the picker
                row.querySelector(".rfp-ep-edit-area").addEventListener("click", () => {
                    if (editTarget?.id === c.id) {
                        loadTarget(null); // toggle off — back to All
                    } else {
                        loadTarget(c);
                    }
                });
            }
            block.appendChild(epList);
            tree.appendChild(block);

            const toggle = head.querySelector(".rfp-toggle");
            const label  = head.querySelector(".rfp-season-label");

            // ▲/▼ chevron → expand/collapse only
            toggle.addEventListener("click", () => {
                expanded = !expanded;
                epList.style.display = expanded ? "block" : "none";
                toggle.textContent = expanded ? "▲" : "▼";
            });

            // Season label → enter/exit season edit mode
            label.addEventListener("click", () => {
                const alreadyFocused = editTarget?.isSeason && editTarget.sn === sn;
                loadTarget(alreadyFocused ? null : { isSeason: true, sn, files });
            });

            // Season checkbox
            chk.addEventListener("change", () => {
                files.forEach(f => chk.checked ? checked.add(f.id) : checked.delete(f.id));
                epList.querySelectorAll(".rfp-ep-chk").forEach(ec => ec.checked = chk.checked);
                updateApplyBtn();
            });

            // Episode checkboxes
            epList.querySelectorAll(".rfp-ep-chk").forEach(ec => {
                ec.addEventListener("change", () => {
                    const id = parseInt(ec.dataset.id);
                    ec.checked ? checked.add(id) : checked.delete(id);
                    const allC2  = files.every(f => checked.has(f.id));
                    const someC2 = files.some(f => checked.has(f.id));
                    chk.checked = allC2; chk.indeterminate = someC2 && !allC2;
                    updateApplyBtn();
                });
            });
        }
    }
    renderTree();
    // Initialize picker to "All files" view showing bestSugg values.
    // Set initialized AFTER this so any sync callbacks fired by the pickers
    // during setup do not overwrite the per-file fileValues.
    loadTarget(null);
    initialized = true;

    function updateApplyBtn() {
        const btn = panel.querySelector("#rgsp-apply");
        if (!btn) return;
        const renameNow = panel.querySelector("#rgsp-rename-now")?.checked ?? true;
        const label = renameNow ? "Apply & Rename" : "Apply RG only";
        btn.disabled = checked.size === 0;
        btn.textContent = `${label} (${checked.size})`;
    }
    updateApplyBtn();

    // Rename checkbox: update button label and persist preference
    panel.querySelector("#rgsp-rename-now")?.addEventListener("change", e => {
        GM_setValue("rgsp_rename_now", e.target.checked);
        updateApplyBtn();
    });

    // ── Event handlers ───────────────────────────────────────────────────
    panel.querySelector(".rgm-close").addEventListener("click",  closeSugg);
    panel.querySelector("#rgsp-cancel").addEventListener("click", closeSugg);
    panel.querySelector("#rgsp-apply").addEventListener("click", () => {
        const applyQFix = panel.querySelector("#rgsp-q-fix")?.checked ?? false;
        const renameNow = panel.querySelector("#rgsp-rename-now")?.checked ?? true;
        const selected  = candidates.filter(c => checked.has(c.id));
        // Determine whether any file will have a network/edition prefix
        const hasPrefix = selected.some(c => {
            const fv = fileValues.get(c.id);
            return fv && (fv.nets.length > 0 || fv.edts.length > 0);
        });
        executeRGSuggestion(series, selected, { fileValues, applyQFix, renameNow, hasPrefix }, panel);
    });
}

/**
 * Apply Release Group suggestions to selected files.
 *
 * opts = {
 *   fileValues: Map<fileId, {audioCodes, subCodes, nets, edts}>
 *   applyQFix:  boolean  — fix HDTV → WEBDL quality
 *   renameNow:  boolean  — trigger rename immediately; if false, show popup
 *   hasPrefix:  boolean  — any file has Network/Edition → run strip check after rename
 * }
 */
export async function executeRGSuggestion(series, selected, opts, panel) {
    if (!selected.length) return;

    const applyBtn  = panel.querySelector("#rgsp-apply");
    const cancelBtn = panel.querySelector("#rgsp-cancel");
    applyBtn.disabled = cancelBtn.disabled = true;

    const prog = createProgress("💡 Applying Release Group", [
        `Setting Release Group (${selected.length} file${selected.length > 1 ? "s" : ""})`,
        "Verifying with API",
    ]);

    try {
        // ── Step 0: PUT each file's Release Group ─────────────────────────
        let lastFileId, lastExpectedRG;
        for (let i = 0; i < selected.length; i++) {
            const f = selected[i];
            prog.update(0, "active", `${i + 1} / ${selected.length}`);

            const fv = opts.fileValues.get(f.id);
            const fileRG = fv
                ? buildValue(fv.nets, fv.edts, fv.audioCodes, fv.subCodes)
                : buildValue([], [], f.suggestion?.audioCodes ?? [], f.suggestion?.subCodes ?? []);

            const update = { ...f, releaseGroup: fileRG };

            // Quality fix if requested and applicable
            if (opts.applyQFix && HDTV_FIX[f.quality?.quality?.id]) {
                const fix = HDTV_FIX[f.quality.quality.id];
                update.quality = {
                    ...f.quality,
                    quality: { ...f.quality.quality, id: fix.id, name: fix.name },
                };
            }

            await apiReq("PUT", `/api/v3/episodefile/${f.id}`, update);

            const _spData = getSpData();
            if (_spData) {
                const idx = _spData.files.findIndex(x => x.id === f.id);
                if (idx !== -1) _spData.files[idx] = { ..._spData.files[idx], releaseGroup: fileRG };
            }

            lastFileId = f.id;
            lastExpectedRG = fileRG;
        }
        prog.update(0, "done", `${selected.length} updated`);

        // ── Step 1: Verify DB commit via API poll ─────────────────────────
        prog.update(1, "active", "polling…");
        if (lastFileId != null) await waitForFileUpdate(lastFileId, lastExpectedRG);
        prog.update(1, "done");

        document.getElementById("rg-suggest-btn")?.classList.remove("has-suggestions");
        prog.finish(`✓ ${selected.length} Release Group(s) set.`, 900);

        // Advance the SAME modal through Rename → Strip (auto-run per Settings)
        await advanceRenameThenStrip(panel, series);

    } catch (e) {
        prog.fail(`✗ ${e.message}`);
        applyBtn.disabled = cancelBtn.disabled = false;
    }
}
