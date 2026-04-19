import { NETWORKS, EDITIONS, HDTV_FIX } from "./constants.js";
import { getSpData } from "./state.js";
import { apiReq, waitForCommand } from "./api.js";
import { fmtEp, firstEp, showToast } from "./utils.js";
import { buildValue, needsRGSuggestion } from "./rg-parser.js";
import { makeMultiPills, makeLangPicker } from "./pickers.js";
import { mapLangNameToCode, suggestRGFromFile } from "./lang.js";
import { checkRenameMismatch } from "./rename.js";
import { recheckPrefixFiles } from "./prefix-fix.js";

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
    panel.innerHTML = `
        <div class="rgsp-head">
            💡 Suggest Release Group
            <span class="rgsp-close">✕</span>
        </div>
        <div class="rgsp-body">
            <p class="rgsp-desc">
                ${(() => {
                    const f = candidates.length, e = totalEpCount;
                    const fLabel = `<strong>${f}</strong> file${f > 1 ? "s" : ""}`;
                    const eLabel = e !== f ? ` (<strong>${e}</strong> episode${e > 1 ? "s" : ""})` : "";
                    return `${fLabel}${eLabel} have no Audio in Release Group.`;
                })()}
                Click a file row to edit its values, or edit here to apply to all checked files.
            </p>
            <div class="rgsp-section-lbl">
                Release Group
                <span class="rgsp-edit-target-bar" style="display:inline-flex;margin-left:8px">
                    — editing: <span id="rgsp-edit-target-val" class="rgsp-edit-target-val">All files</span>
                </span>
            </div>
            <div class="rgsp-picker-box" id="rgsp-picker-box"></div>
            <div class="rgsp-section-lbl">Preview</div>
            <div id="rgsp-preview" class="ep-pop-preview empty" style="margin-bottom:10px">—</div>
            ${hdtvFiles.length > 0 ? `
            <div class="rgsp-section-lbl">Quality fix</div>
            <label class="rgsp-quality-row">
                <input type="checkbox" class="rgsp-quality-chk" id="rgsp-q-fix" checked>
                <span class="rgsp-quality-txt">
                    <span class="rgsp-quality-label">Fix HDTV → WEBDL for ${hdtvFiles.length} file${hdtvFiles.length > 1 ? "s" : ""}</span>
                    <span class="rgsp-quality-detail">e.g. HDTV-1080p → WEBDL-1080p</span>
                </span>
            </label>` : ""}
            <div class="rgsp-section-lbl">Rename option</div>
            <label class="rgsp-quality-row" style="margin-bottom:0">
                <input type="checkbox" class="rgsp-quality-chk" id="rgsp-rename-now"
                    ${renameNowDefault ? "checked" : ""}>
                <span class="rgsp-quality-txt">
                    <span class="rgsp-quality-label">Rename files immediately after applying</span>
                    <span class="rgsp-quality-detail">Uncheck to show rename confirmation popup first</span>
                </span>
            </label>
            <div class="rgsp-section-lbl">Files (${candidates.length})
                <span style="font-size:10px;color:#567;font-weight:normal;margin-left:6px">
                    — click a row to edit its Release Group
                </span>
            </div>
            <div class="rfp-tree" id="rgsp-tree"></div>
            <div class="rgsp-status" id="rgsp-status"></div>
        </div>
        <div class="rgsp-footer">
            <button class="rgsp-btn rgsp-cancel" id="rgsp-cancel">Dismiss</button>
            <button class="rgsp-btn rgsp-apply" id="rgsp-apply" disabled>Apply (0)</button>
        </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    // ── Picker ───────────────────────────────────────────────────────────
    const pickerBox = panel.querySelector("#rgsp-picker-box");

    const netLbl = document.createElement("div");
    netLbl.className = "rgsp-picker-sub-lbl"; netLbl.textContent = "Network";
    const netComp = makeMultiPills(NETWORKS, "net", [], syncPreview);

    const edtLbl = document.createElement("div");
    edtLbl.className = "rgsp-picker-sub-lbl"; edtLbl.textContent = "Edition";
    const edtComp = makeMultiPills(EDITIONS, "edt", [], syncPreview);

    const langLbl = document.createElement("div");
    langLbl.className = "rgsp-picker-sub-lbl"; langLbl.textContent = "Language";
    const dual = document.createElement("div"); dual.className = "rg-dual";
    const audioComp = makeLangPicker("Audio",    bestSugg.audioCodes, syncPreview);
    const subComp   = makeLangPicker("Subtitle", bestSugg.subCodes,   syncPreview);
    dual.append(audioComp.el, subComp.el);

    pickerBox.append(netLbl, netComp.el, edtLbl, edtComp.el, langLbl, dual);

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

    // ── editTarget: null = "All files", or a specific candidate ──────────
    let editTarget = null;

    /** Load values for the given target into the picker (null = All files). */
    function loadTarget(target) {
        editTarget = target;
        const lbl = panel.querySelector("#rgsp-edit-target-val");
        if (lbl) lbl.textContent = target ? fmtEp(target.ep) : "All files";

        // Highlight the focused row
        tree.querySelectorAll(".rfp-ep-row").forEach(row =>
            row.classList.toggle("rgsp-focused",
                !!target && row.dataset.fileId === String(target.id)));

        const vals = target
            ? fileValues.get(target.id)
            : { audioCodes: bestSugg.audioCodes, subCodes: bestSugg.subCodes, nets: [], edts: [] };

        netComp.set(vals.nets,        true);
        edtComp.set(vals.edts,        true);
        audioComp.set(vals.audioCodes, true);
        subComp.set(vals.subCodes,     true);

        // Update preview without writing back to fileValues
        const val = buildValue(vals.nets, vals.edts, vals.audioCodes, vals.subCodes);
        preview.textContent = val || "—";
        preview.className = "ep-pop-preview" +
            (!val ? " empty" : vals.nets.length || vals.edts.length ? " has-network" : "");
    }

    /** Called whenever the picker changes — saves to fileValues and updates rows. */
    function syncPreview() {
        const nets = netComp.get(), edts = edtComp.get();
        const audio = audioComp.get(), sub = subComp.get();
        const val = buildValue(nets, edts, audio, sub);

        preview.textContent = val || "—";
        preview.className = "ep-pop-preview" +
            (!val ? " empty" : nets.length || edts.length ? " has-network" : "");

        const newVals = { audioCodes: audio, subCodes: sub, nets, edts };

        if (editTarget) {
            // Save only to the focused file
            fileValues.set(editTarget.id, newVals);
            const span = tree.querySelector(`.rgsp-new-rg[data-file-id="${editTarget.id}"]`);
            if (span) span.textContent = val || "—";
        } else {
            // Save to all checked files and update their rows
            for (const c of candidates) {
                if (checked.has(c.id)) fileValues.set(c.id, { ...newVals });
            }
            tree.querySelectorAll(".rgsp-new-rg[data-file-id]").forEach(el => {
                if (checked.has(parseInt(el.dataset.fileId))) el.textContent = val || "—";
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
            head.innerHTML = `
                <input type="checkbox" class="rfp-chk rfp-season-chk" data-sn="${sn}">
                <span class="rfp-season-label">
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
                        <span class="rfp-new rgsp-new-rg" data-file-id="${c.id}" style="color:#fa0">${suggStr}</span>
                        ${qualFix ? `<span class="rgsp-quality-badge" style="font-size:10px;color:#b80;opacity:.8">🎬${c.quality.quality.name}→${qualFix.name}</span>` : ""}
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

            // Toggle expand/collapse
            const toggle = head.querySelector(".rfp-toggle");
            const label  = head.querySelector(".rfp-season-label");
            [toggle, label].forEach(el => el.addEventListener("click", () => {
                expanded = !expanded;
                epList.style.display = expanded ? "block" : "none";
                toggle.textContent = expanded ? "▲" : "▼";
            }));

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
    // Initialize picker to "All files" view showing bestSugg values
    loadTarget(null);

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
    panel.querySelector(".rgsp-close").addEventListener("click",  () => panel.classList.remove("open"));
    panel.querySelector("#rgsp-cancel").addEventListener("click", () => panel.classList.remove("open"));
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

    const rgspSt = (msg, type) => {
        const el = panel.querySelector("#rgsp-status");
        if (el) { el.textContent = msg; el.className = `rgsp-status ${type}`; }
    };

    try {
        // ── Step 1: PUT each file's Release Group ─────────────────────────
        for (let i = 0; i < selected.length; i++) {
            const f = selected[i];
            rgspSt(`Updating ${i + 1} / ${selected.length}…`, "loading");

            // Determine the RG for this specific file from its individual fileValues
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

            // Update local cache
            const _spData = getSpData();
            if (_spData) {
                const idx = _spData.files.findIndex(x => x.id === f.id);
                if (idx !== -1) _spData.files[idx] = { ..._spData.files[idx], releaseGroup: fileRG };
            }
        }

        rgspSt(`All ${selected.length} updated. Waiting for Sonarr…`, "loading");
        await new Promise(r => setTimeout(r, 600));

        document.getElementById("rg-suggest-btn")?.classList.remove("has-suggestions");

        if (opts.renameNow) {
            // ── Step 2a: Rename immediately ───────────────────────────────
            rgspSt("Renaming files…", "loading");
            const cmd = await apiReq("POST", "/api/v3/command", {
                name: "RenameFiles",
                seriesId: series.id,
                files: selected.map(f => f.id),
            });
            // Poll until Sonarr actually finishes renaming (not just queued)
            await waitForCommand(cmd.id, st => rgspSt(`Renaming… (${st})`, "loading"));
            rgspSt(`✓ Done — ${selected.length} file(s) updated & renamed.`, "ok");
            setTimeout(async () => {
                panel.classList.remove("open");
                // If Network/Edition prefix was applied, check for strip
                const _spData = getSpData();
                if (opts.hasPrefix && _spData?.series) {
                    await recheckPrefixFiles();
                }
            }, 1500);
        } else {
            // ── Step 2b: Show rename confirmation popup ────────────────────
            rgspSt(`✓ ${selected.length} RG(s) updated — confirm rename below.`, "ok");

            // Post-rename callback: check strip if prefix was applied
            const afterRename = opts.hasPrefix
                ? () => recheckPrefixFiles()
                : null;

            setTimeout(() => {
                panel.classList.remove("open");
                const _spData = getSpData();
                if (_spData?.series) checkRenameMismatch(_spData.series, null, afterRename);
            }, 1500);
        }

    } catch (e) {
        rgspSt(`✗ ${e.message}`, "err");
        applyBtn.disabled = cancelBtn.disabled = false;
    }
}
