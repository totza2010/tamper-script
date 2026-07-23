import { RG_PREFIX_RE } from "./constants.js";
import { stripRGPrefix } from "./rg-parser.js";
import { getSpData } from "./state.js";
import { apiReq, waitForCommand, waitForFileUpdate } from "./api.js";
import { fmtEp, firstEp, showToast } from "./utils.js";
import { createProgress } from "./progress-ui.js";
import { getFlowOverlay, renderStep, closeOverlay } from "./flow-modal.js";

// ── Series page — Auto-detect [network]- prefix in Release Group ──────────────

/**
 * Strip condition gate — returns true only when:
 *   1. releaseGroup starts with [prefix]-
 *   2. The ACTUAL filename on disk (relativePath basename) already contains that prefix.
 *
 * Condition 2 ensures we don't show the strip panel for files where the prefix
 * was just set in the DB but Sonarr hasn't renamed the file yet.
 */
export function prefixAlreadyInFilename(f) {
    const rg = f.releaseGroup || "";
    if (!RG_PREFIX_RE.test(rg)) return false;
    const prefix = rg.match(RG_PREFIX_RE)?.[0] ?? "";
    if (!prefix) return false;
    const basename = (f.relativePath || "").split(/[/\\]/).pop();
    return basename.includes(prefix);
}

/** Fetch episode files and return those whose filename still carries the prefix. */
export async function getStripAffected(series, epMap) {
    const files = await apiReq("GET", `/api/v3/episodefile?seriesId=${series.id}`);
    const _spData = getSpData();
    if (_spData) _spData.files = files;
    const map = epMap ?? _spData?.epMap ?? new Map();
    return files
        .filter(f => prefixAlreadyInFilename(f))
        .map(f => ({
            ...f,
            ep: map.get(f.id) ?? [],
            newReleaseGroup: stripRGPrefix(f.releaseGroup || ""),
        }))
        .sort((a, b) => {
            const ae = firstEp(a.ep), be = firstEp(b.ep);
            const ds = (ae?.seasonNumber ?? 0) - (be?.seasonNumber ?? 0);
            return ds !== 0 ? ds : (ae?.episodeNumber ?? 0) - (be?.episodeNumber ?? 0);
        });
}

/** Re-fetch files and (re)build the Strip step in the shared flow modal. */
export async function recheckPrefixFiles() {
    const _spData = getSpData();
    if (!_spData?.series) return;
    try {
        const affected = await getStripAffected(_spData.series, _spData.epMap);
        if (affected.length > 0) renderStripStep(getFlowOverlay(), _spData.series, affected);
        else showToast("✓ No [prefix]- files found");
    } catch (e) {
        showToast("✗ " + e.message.slice(0, 60));
        console.warn("[RG Strip recheck]", e.message);
    }
}

/** Standalone entry (also used by the ✂ FAB). */
export function buildFixUI(series, affected, hostOverlay) {
    renderStripStep(hostOverlay ?? getFlowOverlay(), series, affected);
}

// ── Strip step — season/episode tree in the shared flow modal ─────────────────

export function renderStripStep(overlay, series, affected) {
    const prefixes    = [...new Set(affected.map(f => (f.releaseGroup.match(RG_PREFIX_RE) || [""])[0]))];
    const prefixLabel = prefixes.join(", ");

    const bySeason = new Map();
    for (const f of affected) {
        const sn = firstEp(f.ep)?.seasonNumber ?? 0;
        if (!bySeason.has(sn)) bySeason.set(sn, []);
        bySeason.get(sn).push(f);
    }
    const seasons = [...bySeason.keys()].sort((a, b) => a - b);
    const checked = new Set(affected.map(f => f.id));

    const panel = renderStep(overlay, {
        title: "✂ Strip Release Group Prefix",
        body: `<div class="rgm-body">
            <p class="rgm-desc">Strip <code>${prefixLabel}</code> from selected files, then rename.</p>
            <div class="rfp-tree" id="rfp-tree"></div>
        </div>`,
        footer: `<div class="rgm-footer">
            <button class="rgm-btn rgm-btn--ghost" id="rfp-cancel">Cancel</button>
            <button class="rgm-btn rgm-btn--primary" id="rfp-confirm"></button>
        </div>`,
    });

    function updateConfirmBtn() {
        const btn = panel.querySelector("#rfp-confirm");
        if (btn) {
            btn.textContent = `✂ Strip & Rename (${checked.size})`;
            btn.disabled = checked.size === 0;
        }
    }

    function setSeasonCheckState(sn) {
        const files = bySeason.get(sn);
        const allC  = files.every(f => checked.has(f.id));
        const someC = files.some(f => checked.has(f.id));
        const chk = panel.querySelector(`.rfp-season-chk[data-sn="${sn}"]`);
        if (!chk) return;
        chk.checked = allC;
        chk.indeterminate = someC && !allC;
    }

    function renderTree() {
        const tree = panel.querySelector("#rfp-tree");
        tree.innerHTML = "";
        for (const sn of seasons) {
            const files = bySeason.get(sn);
            const allChecked  = files.every(f => checked.has(f.id));
            const someChecked = files.some(f => checked.has(f.id));
            let expanded = !allChecked;

            const block = document.createElement("div");
            block.className = "rfp-season-block";

            const head = document.createElement("div");
            head.className = "rfp-season-head";
            head.innerHTML = `
                <input type="checkbox" class="rfp-chk rfp-season-chk" data-sn="${sn}">
                <span class="rfp-season-label">
                    Season ${sn} <em>(${files.length} file${files.length > 1 ? "s" : ""})</em>
                </span>
                <span class="rfp-toggle">${expanded ? "▲" : "▼"}</span>`;
            block.appendChild(head);

            const chk = head.querySelector(".rfp-season-chk");
            chk.checked = allChecked;
            chk.indeterminate = someChecked && !allChecked;

            const epList = document.createElement("div");
            epList.className = "rfp-ep-list";
            epList.style.display = expanded ? "block" : "none";

            for (const f of files) {
                const row = document.createElement("div");
                row.className = "rfp-ep-row";
                row.innerHTML = `
                    <input type="checkbox" class="rfp-chk rfp-ep-chk" data-id="${f.id}"
                        ${checked.has(f.id) ? "checked" : ""}>
                    <div class="rfp-ep-edit-area" style="cursor:default">
                        <span class="rfp-ep-label">${fmtEp(f.ep)}</span>
                        <span class="rfp-old">${f.releaseGroup}</span>
                        <span class="rfp-arrow">→</span>
                        <span class="rfp-new">${f.newReleaseGroup}</span>
                    </div>`;
                epList.appendChild(row);
            }
            block.appendChild(epList);
            tree.appendChild(block);

            const toggle = head.querySelector(".rfp-toggle");
            const label  = head.querySelector(".rfp-season-label");
            [toggle, label].forEach(el => el.addEventListener("click", () => {
                expanded = !expanded;
                epList.style.display = expanded ? "block" : "none";
                toggle.textContent = expanded ? "▲" : "▼";
            }));

            chk.addEventListener("change", () => {
                files.forEach(f => chk.checked ? checked.add(f.id) : checked.delete(f.id));
                epList.querySelectorAll(".rfp-ep-chk").forEach(ec => ec.checked = chk.checked);
                updateConfirmBtn();
            });

            epList.querySelectorAll(".rfp-ep-chk").forEach(ec => {
                ec.addEventListener("change", () => {
                    const id = parseInt(ec.dataset.id);
                    ec.checked ? checked.add(id) : checked.delete(id);
                    setSeasonCheckState(sn);
                    updateConfirmBtn();
                });
            });
        }
    }

    renderTree();
    updateConfirmBtn();

    panel.querySelector("#rfp-cancel").addEventListener("click", () => closeOverlay(overlay));
    panel.querySelector("#rfp-confirm").addEventListener("click", () => {
        executeGroupFix(series, affected.filter(f => checked.has(f.id)), () => closeOverlay(overlay));
    });

    // Auto-strip: fire immediately when enabled in Settings
    if (GM_getValue("rfp_strip_now", false)) {
        executeGroupFix(series, affected.filter(f => checked.has(f.id)), () => closeOverlay(overlay));
    }
}

// ── Execute strip: PUT stripped RG → verify → rename ──────────────────────────

export async function executeGroupFix(series, selectedFiles, onDone) {
    if (!selectedFiles.length) return;
    const confirmBtn = document.getElementById("rfp-confirm");
    const cancelBtn  = document.getElementById("rfp-cancel");
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn)  cancelBtn.disabled  = true;

    const prog = createProgress("✂️ Strip Network Prefix", [
        `Updating Release Group (${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""})`,
        "Verifying with API",
        "Sending rename command",
        "Waiting for rename",
    ]);

    try {
        let lastFileId, lastExpectedRG;
        for (let i = 0; i < selectedFiles.length; i++) {
            const f = selectedFiles[i];
            prog.update(0, "active", `${i + 1} / ${selectedFiles.length}`);
            await apiReq("PUT", `/api/v3/episodefile/${f.id}`, { ...f, releaseGroup: f.newReleaseGroup });
            lastFileId    = f.id;
            lastExpectedRG = f.newReleaseGroup;
        }
        prog.update(0, "done", `${selectedFiles.length} updated`);

        prog.update(1, "active", "polling…");
        if (lastFileId != null) await waitForFileUpdate(lastFileId, lastExpectedRG);
        prog.update(1, "done");

        prog.update(2, "active");
        const cmd = await apiReq("POST", "/api/v3/command", {
            name: "RenameFiles",
            seriesId: series.id,
            files: selectedFiles.map(f => f.id),
        });
        prog.update(2, "done");

        prog.update(3, "active", "queued");
        await waitForCommand(cmd.id, st => prog.update(3, "active", st));
        prog.update(3, "done");

        if (onDone) onDone();
        prog.finish(`✓ ${selectedFiles.length} file(s) renamed.`, 1500);

    } catch (e) {
        prog.fail(`✗ ${e.message}`);
        if (confirmBtn) confirmBtn.disabled = false;
        if (cancelBtn)  cancelBtn.disabled  = false;
    }
}
