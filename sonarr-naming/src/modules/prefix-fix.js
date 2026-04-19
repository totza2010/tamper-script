import { RG_PREFIX_RE } from "./constants.js";
import { getSpData } from "./state.js";
import { apiReq, waitForCommand } from "./api.js";
import { fmtEp, firstEp, showToast } from "./utils.js";

// ── Series page — Auto-detect [network]- prefix in Release Group ──────────────

/**
 * Strip condition gate — returns true only when:
 *   1. releaseGroup starts with [prefix]-
 *   2. The ACTUAL filename on disk (relativePath basename) already contains that prefix.
 *
 * Condition 2 ensures we don't show the strip panel for files where the prefix
 * was just set in the DB but Sonarr hasn't renamed the file yet.
 * e.g. RG="[TrueID]-AudioTH" but file is still "…-AudioTH.mkv" → returns false.
 *      RG="[TrueID]-AudioTH" and file is "…[TrueID]-AudioTH.mkv" → returns true.
 */
export function prefixAlreadyInFilename(f) {
    const rg = f.releaseGroup || "";
    if (!RG_PREFIX_RE.test(rg)) return false;
    // Full prefix e.g. "[TrueID][IQ]-" — RG_PREFIX_RE now covers multi-bracket
    const prefix = rg.match(RG_PREFIX_RE)?.[0] ?? "";
    if (!prefix) return false;
    const basename = (f.relativePath || "").split(/[/\\]/).pop();
    // Filename may have the prefix embedded after quality brackets, e.g.
    // "S01E39 - [WEBDL-2160p]-[TrueID][IQ]-AudioTH…"
    // so we search for the prefix anywhere in the basename (not just at start)
    return basename.includes(prefix);
}

/** Re-fetch episode files and rebuild the Strip-prefix UI without page reload. */
export async function recheckPrefixFiles() {
    const _spData = getSpData();
    if (!_spData?.series) return;
    // Remove old fix UI so it refreshes cleanly
    document.getElementById("rg-fix-panel")?.remove();
    try {
        const files = await apiReq("GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`);
        _spData.files = files;

        const affected = files
            .filter(f => prefixAlreadyInFilename(f))
            .map(f => ({
                ...f,
                ep: _spData.epMap.get(f.id) ?? [],
                newReleaseGroup: (f.releaseGroup || "").replace(RG_PREFIX_RE, ""),
            }))
            .sort((a, b) => {
                const ae = firstEp(a.ep), be = firstEp(b.ep);
                const ds = (ae?.seasonNumber ?? 0) - (be?.seasonNumber ?? 0);
                return ds !== 0 ? ds : (ae?.episodeNumber ?? 0) - (be?.episodeNumber ?? 0);
            });

        if (affected.length > 0) {
            buildFixUI(_spData.series, affected);
        } else {
            showToast("✓ No [prefix]- files found");
        }
    } catch (e) {
        showToast("✗ " + e.message.slice(0, 60));
        console.warn("[RG Strip recheck]", e.message);
    }
}

// ── Build the confirmation panel with season/episode tree ──────────────────

export function buildFixUI(series, affected) {
    document.getElementById("rg-fix-panel")?.remove();

    const prefixes = [...new Set(affected.map(f => (f.releaseGroup.match(RG_PREFIX_RE) || [""])[0]))];
    const prefixLabel = prefixes.join(", ");

    // Group by season
    const bySeason = new Map();
    for (const f of affected) {
        const sn = firstEp(f.ep)?.seasonNumber ?? 0;
        if (!bySeason.has(sn)) bySeason.set(sn, []);
        bySeason.get(sn).push(f);
    }
    const seasons = [...bySeason.keys()].sort((a, b) => a - b);

    // Selection state
    const checked = new Set(affected.map(f => f.id));

    // Panel
    const panel = document.createElement("div");
    panel.id = "rg-fix-panel";
    document.body.appendChild(panel);

    function updateConfirmBtn() {
        const btn = panel.querySelector("#rfp-confirm");
        if (btn) {
            btn.textContent = `✂ Strip & Rename (${checked.size})`;
            btn.disabled = checked.size === 0;
        }
    }

    function setSeasonCheckState(sn) {
        const files = bySeason.get(sn);
        const allC = files.every(f => checked.has(f.id));
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
            const allChecked = files.every(f => checked.has(f.id));
            const someChecked = files.some(f => checked.has(f.id));
            // Auto-expand if season is partially selected
            let expanded = !allChecked;

            const block = document.createElement("div");
            block.className = "rfp-season-block";

            // Season header
            const head = document.createElement("div");
            head.className = "rfp-season-head";
            head.innerHTML = `
                <input type="checkbox" class="rfp-chk rfp-season-chk" data-sn="${sn}">
                <span class="rfp-season-label">
                    Season ${sn} <em>(${files.length} file${files.length > 1 ? "s" : ""})</em>
                </span>
                <span class="rfp-toggle">${expanded ? "▲" : "▼"}</span>
            `;
            block.appendChild(head);

            // Set initial checkbox state
            const chk = head.querySelector(".rfp-season-chk");
            chk.checked = allChecked;
            chk.indeterminate = someChecked && !allChecked;

            // Episode list
            const epList = document.createElement("div");
            epList.className = "rfp-ep-list";
            epList.style.display = expanded ? "block" : "none";

            for (const f of files) {
                const row = document.createElement("div");
                row.className = "rfp-ep-row";
                row.innerHTML = `
                    <input type="checkbox" class="rfp-chk rfp-ep-chk" data-id="${f.id}"
                        ${checked.has(f.id) ? "checked" : ""}>
                    <div class="rfp-ep-info">
                        <span class="rfp-ep-label">${fmtEp(f.ep)}</span>
                        <span class="rfp-old">${f.releaseGroup}</span>
                        <span class="rfp-arrow">→</span>
                        <span class="rfp-new">${f.newReleaseGroup}</span>
                    </div>
                `;
                epList.appendChild(row);
            }
            block.appendChild(epList);
            tree.appendChild(block);

            // Toggle expand/collapse (click label or arrow, not checkbox)
            const toggle = head.querySelector(".rfp-toggle");
            const label = head.querySelector(".rfp-season-label");
            [toggle, label].forEach(el => el.addEventListener("click", () => {
                expanded = !expanded;
                epList.style.display = expanded ? "block" : "none";
                toggle.textContent = expanded ? "▲" : "▼";
            }));

            // Season checkbox → select/deselect all in season
            chk.addEventListener("change", () => {
                files.forEach(f => chk.checked ? checked.add(f.id) : checked.delete(f.id));
                epList.querySelectorAll(".rfp-ep-chk")
                    .forEach(ec => ec.checked = chk.checked);
                updateConfirmBtn();
            });

            // Episode checkboxes
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

    const stripNowDefault = GM_getValue("rfp_strip_now", false);

    // Build panel HTML skeleton
    panel.innerHTML = `
        <div class="rfp-head">
            ✂ Strip Release Group Prefix
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            <p class="rfp-desc">
                Strip <code>${prefixLabel}</code> from selected files, then rename.
            </p>
            <div class="rfp-tree" id="rfp-tree"></div>
            <div class="rgsp-section-lbl" style="margin-top:8px">Strip option</div>
            <label class="rgsp-quality-row" style="margin-bottom:0">
                <input type="checkbox" class="rgsp-quality-chk" id="rfp-strip-now"
                    ${stripNowDefault ? "checked" : ""}>
                <span class="rgsp-quality-txt">
                    <span class="rgsp-quality-label">Strip & Rename immediately when opened</span>
                    <span class="rgsp-quality-detail">Uncheck to review and confirm manually</span>
                </span>
            </label>
            <div class="rfp-status" id="rfp-status"></div>
            <div class="rfp-btns">
                <button class="rfp-btn rfp-cancel" id="rfp-cancel">Cancel</button>
                <button class="rfp-btn rfp-confirm" id="rfp-confirm"></button>
            </div>
        </div>
    `;
    renderTree();
    updateConfirmBtn();

    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#rfp-cancel").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#rfp-confirm").addEventListener("click", () => {
        executeGroupFix(series, affected.filter(f => checked.has(f.id)));
    });

    // Persist strip-now preference
    panel.querySelector("#rfp-strip-now").addEventListener("change", e => {
        GM_setValue("rfp_strip_now", e.target.checked);
    });

    // Always open the panel immediately
    requestAnimationFrame(() => panel.classList.add("open"));

    // If "strip immediately" is enabled, fire the strip command automatically
    if (stripNowDefault) {
        setTimeout(() => {
            executeGroupFix(series, affected.filter(f => checked.has(f.id)));
        }, 800);
    }
}

// ── Execute: all PUTs first, then rename ──────────────────────────────────

function rfpStatus(msg, type) {
    const el = document.getElementById("rfp-status");
    if (!el) return;
    el.textContent = msg;
    el.className = `rfp-status ${type}`;
}

export async function executeGroupFix(series, selectedFiles) {
    if (!selectedFiles.length) return;
    const confirmBtn = document.getElementById("rfp-confirm");
    const cancelBtn = document.getElementById("rfp-cancel");
    confirmBtn.disabled = cancelBtn.disabled = true;

    try {
        // ── Step 1: Update every Release Group sequentially ──────────
        for (let i = 0; i < selectedFiles.length; i++) {
            const f = selectedFiles[i];
            rfpStatus(`Updating Release Group ${i + 1} / ${selectedFiles.length}…`, "loading");
            await apiReq("PUT", `/api/v3/episodefile/${f.id}`, {
                ...f,
                releaseGroup: f.newReleaseGroup,
            });
        }

        // ── Step 2: Wait for Sonarr to commit all DB writes ──────────
        rfpStatus(`All ${selectedFiles.length} updated. Waiting for Sonarr…`, "loading");
        await new Promise(r => setTimeout(r, 600));

        // ── Step 3: Trigger rename ────────────────────────────────────
        rfpStatus("Renaming files…", "loading");
        const cmd = await apiReq("POST", "/api/v3/command", {
            name: "RenameFiles",
            seriesId: series.id,
            files: selectedFiles.map(f => f.id),
        });
        // Poll until Sonarr actually finishes renaming
        await waitForCommand(cmd.id, st => rfpStatus(`Renaming… (${st})`, "loading"));

        rfpStatus(`✓ Done — ${selectedFiles.length} file(s) renamed.`, "ok");
        // Close UI; injectEpEditBtns will auto-refetch when React re-renders new paths.
        setTimeout(() => {
            document.getElementById("rg-fix-panel")?.remove();
        }, 1500);

    } catch (e) {
        rfpStatus(`✗ ${e.message}`, "err");
        confirmBtn.disabled = cancelBtn.disabled = false;
    }
}
