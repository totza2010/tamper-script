import { NETWORKS, EDITIONS } from "./constants.js";
import { getSpData, setSpData, isRefetching, setRefetching } from "./state.js";
import { apiReq } from "./api.js";
import { fmtEp, firstEp } from "./utils.js";
import { parseRG, buildValue } from "./rg-parser.js";
import { makeMultiPills, makeLangPicker } from "./pickers.js";
import { checkRenameMismatch } from "./rename.js";

// ── Per-episode Release Group editor ─────────────────────────────────────────

/** Open floating Release Group editor anchored to `anchorEl`, editing `file`.
 *  @param {Element}  anchorEl  – the ✎ button element
 *  @param {Object}   file      – episode file object from _spData.files
 *  @param {Object}   [ep]      – episode metadata from _spData.epMap (optional)
 */
export function openEpRGEditor(anchorEl, file, ep = null) {
    document.getElementById("ep-rg-popup")?.remove();

    const parsed = parseRG(file.releaseGroup || "");
    const popup  = document.createElement("div");
    popup.id     = "ep-rg-popup";

    // Position — prefer below the button; flip above if insufficient room.
    // max-height is set dynamically so overflow-y: auto always has a constrained box to scroll within.
    const rect   = anchorEl.getBoundingClientRect();
    const MARGIN = 10;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    let topPx, maxH;
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
        // Open downward
        topPx = rect.bottom + 6;
        maxH  = spaceBelow - 6;
    } else {
        // Open upward — estimate height then anchor bottom to button top
        const estimatedH = Math.min(560, spaceAbove);
        topPx = Math.max(MARGIN, rect.top - estimatedH - 6);
        maxH  = spaceAbove - 6;
    }
    popup.style.top       = `${Math.max(MARGIN, topPx)}px`;
    popup.style.maxHeight = `${Math.max(180, maxH)}px`;
    popup.style.left      = `${Math.max(4, Math.min(rect.left, window.innerWidth - 434))}px`;

    // Header
    const head = document.createElement("div");
    head.className = "ep-pop-head";
    head.innerHTML = `✎ Edit Release Group <span class="ep-pop-close">✕</span>`;
    popup.appendChild(head);

    // Episode info box (for re-verification)
    const epLabel = ep ? fmtEp(ep) : "";
    const epTitle = ep?.title ?? "";
    const fname   = file.relativePath?.split(/[/\\]/).pop() ?? "";
    if (epLabel || fname) {
        const info = document.createElement("div");
        info.className = "ep-pop-epinfo";
        info.innerHTML = `
            ${epLabel ? `<div class="ep-pop-epinfo-label">${epLabel}${epTitle ? ` — ${epTitle}` : ""}</div>` : ""}
            ${fname   ? `<div class="ep-pop-epinfo-path">${fname}</div>` : ""}
            <div class="ep-pop-epinfo-rg">Current RG: <code>${file.releaseGroup || "(none)"}</code></div>`;
        popup.appendChild(info);
    }

    // Network (multi-select)
    const netRow = makeEpPopRow("Network");
    const netComp = makeMultiPills(NETWORKS, "net", parsed.networks, sync);
    netRow.appendChild(netComp.el);

    // Edition (multi-select)
    const edtRow = makeEpPopRow("Edition");
    const edtComp = makeMultiPills(EDITIONS, "edt", parsed.editions, sync);
    edtRow.appendChild(edtComp.el);

    // Language (dual)
    const langRow = makeEpPopRow("Language");
    const dual = document.createElement("div"); dual.className = "rg-dual";
    const audioComp = makeLangPicker("Audio",    parsed.audioCodes, sync);
    const subComp   = makeLangPicker("Subtitle", parsed.subCodes,   sync);
    dual.append(audioComp.el, subComp.el);
    langRow.appendChild(dual);

    // Preview
    const prevRow = makeEpPopRow("Preview");
    const preview = document.createElement("div");
    preview.className = "ep-pop-preview empty";
    preview.textContent = "—";
    prevRow.appendChild(preview);

    // Buttons
    const btns      = document.createElement("div"); btns.className = "ep-pop-btns";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ep-pop-btn ep-pop-cancel"; cancelBtn.textContent = "Cancel";
    const saveBtn   = document.createElement("button");
    saveBtn.className   = "ep-pop-btn ep-pop-save";   saveBtn.textContent   = "Save";
    btns.append(cancelBtn, saveBtn);

    popup.append(netRow, edtRow, langRow, prevRow, btns);
    document.body.appendChild(popup);

    function makeEpPopRow(label) {
        const row = document.createElement("div"); row.className = "ep-pop-row";
        const lbl = document.createElement("div"); lbl.className = "ep-pop-lbl"; lbl.textContent = label;
        row.appendChild(lbl);
        return row;
    }

    function sync() {
        const nets = netComp.get(), edts = edtComp.get();
        const val  = buildValue(nets, edts, audioComp.get(), subComp.get());
        preview.textContent = val || "—";
        preview.className   = "ep-pop-preview" +
            (!val ? " empty" : nets.length || edts.length ? " has-network" : "");
    }
    sync();

    const close = () => popup.remove();
    head.querySelector(".ep-pop-close").addEventListener("click", close);
    cancelBtn.addEventListener("click", close);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener("mousedown", function outside(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener("mousedown", outside, true);
            }
        }, true);
    }, 0);

    // Save — PUT → verify → unified rename check
    saveBtn.addEventListener("click", async () => {
        const value = buildValue(netComp.get(), edtComp.get(), audioComp.get(), subComp.get());
        saveBtn.disabled = true;

        try {
            // 1. PUT
            saveBtn.textContent = "Saving…";
            await apiReq("PUT", `/api/v3/episodefile/${file.id}`, {
                ...file, releaseGroup: value,
            });

            // 2. Wait for Sonarr DB commit
            saveBtn.textContent = "Verifying…";
            await new Promise(r => setTimeout(r, 500));

            // 3. Re-fetch to confirm the change actually applied
            const fresh = await apiReq("GET", `/api/v3/episodefile/${file.id}`);
            if (fresh.releaseGroup !== value) {
                throw new Error(`Not saved — got: "${fresh.releaseGroup}"`);
            }

            // 4. Update local cache with fresh data
            const _spData = getSpData();
            if (_spData) {
                const idx = _spData.files.findIndex(f => f.id === file.id);
                if (idx !== -1) _spData.files[idx] = fresh;
            }

            popup.remove();

            // 5a. Immediately update the Release Group cell text in the DOM.
            //     React may not re-render until Sonarr gets a SignalR push, so we patch
            //     the text node directly so the user sees the new value right away.
            try {
                const rgCell = anchorEl.parentElement; // anchorEl = ✎ btn inside <td>
                if (rgCell && rgCell.matches("td[class*='releaseGroup']")) {
                    // React renders the RG value as a plain text node before our button
                    const textNode = [...rgCell.childNodes]
                        .find(n => n.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.textContent = value;
                    } else {
                        rgCell.insertBefore(document.createTextNode(value), anchorEl);
                    }
                    // Refresh button tooltip with new value
                    const latestSpData = getSpData();
                    const latestEpArr = latestSpData?.epMap.get(file.id);
                    const latestEp0   = firstEp(latestEpArr);
                    anchorEl.title = latestEpArr
                        ? `Edit RG — ${fmtEp(latestEpArr)} ${latestEp0?.title ?? ""} (${value || "—"})`
                        : `Edit Release Group (${value || "—"})`;
                    // NOTE: intentionally do NOT delete epEditAdded —
                    // deleting it causes MutationObserver to inject a duplicate button.
                    // The click handler always reads _spData.files (updated in step 4)
                    // so the existing button stays up-to-date without re-injection.
                }
            } catch (_) { /* DOM update is best-effort; ignore errors */ }

            // 5b. Unified rename mismatch check (same as series-page load)
            const spData = getSpData();
            if (spData?.series) checkRenameMismatch(spData.series, [file.id]);
            // Strip-prefix check is intentionally NOT triggered here —
            // it only runs on page load or when the user presses the ✂ button.

        } catch (err) {
            const msg = err.message.startsWith("Not saved") ? `✗ ${err.message}` : "✗ Save failed";
            saveBtn.textContent = msg.slice(0, 34);
            saveBtn.style.background = "#5c1a1a";
            setTimeout(() => {
                saveBtn.disabled  = false;
                saveBtn.textContent = "Retry";
                saveBtn.style.background = "";
            }, 3000);
        }
    });
}

/**
 * Re-fetch _spData.files from the API, then re-run injectEpEditBtns.
 *
 * Called when injectEpEditBtns finds a cell whose DOM path doesn't exist in the
 * cached file list (Sonarr renamed files asynchronously after strip/RG-edit).
 *
 * Uses a boolean flag instead of a timer so:
 *  - Only one fetch runs at a time (concurrent MutationObserver bursts are ignored)
 *  - No fixed delay — re-injection fires as soon as the API responds
 */
export async function refetchFilesAndReInject() {
    const _spData = getSpData();
    if (!_spData?.series || isRefetching()) return;
    setRefetching(true);
    try {
        const fresh = await apiReq(
            "GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`
        );
        const currentSpData = getSpData();
        if (currentSpData) currentSpData.files = fresh; // guard: user may have navigated away
        injectEpEditBtns();
    } catch (_) { /* non-critical */ }
    finally { setRefetching(false); }
}

export function injectEpEditBtns() {
    const _spData = getSpData();
    if (!_spData) return;
    if (!/^\/series\/[^/]+/.test(location.pathname)) return;

    // Determine "Relative Path" column index once from the <thead>
    // Sonarr marks column headers with a `label` attribute
    const headerThs = [...document.querySelectorAll("table thead th, thead th")];
    const pathColIdx = headerThs.findIndex(th =>
        th.getAttribute("label") === "Relative Path" ||
        th.textContent.trim() === "Relative Path"
    );

    // Remove any stale duplicate buttons (can happen after page re-renders)
    document.querySelectorAll("td[class*='releaseGroup']").forEach(cell => {
        const btns = [...cell.querySelectorAll(".ep-rg-edit-btn")];
        if (btns.length > 1) btns.slice(1).forEach(b => b.remove());
    });

    // Use td selector to skip the <th> header cell (which also contains "releaseGroup" text)
    document.querySelectorAll("td[class*='releaseGroup']").forEach(cell => {
        if (cell.dataset.epEditAdded) {
            // Flag is set — but React may have re-rendered this cell's content,
            // removing our button while keeping the <td> element (and its dataset).
            // Check that the button still actually exists; if not, clear the flag
            // so we fall through and re-inject it.
            if (cell.querySelector(".ep-rg-edit-btn")) return; // still intact, skip
            delete cell.dataset.epEditAdded; // React wiped our button — re-inject
        }

        const tr = cell.closest("tr");
        if (!tr) return;

        // Method 1: use column index from header label
        let pathTxt = pathColIdx >= 0
            ? (tr.cells[pathColIdx]?.textContent.trim() ?? "")
            : "";

        // Method 2: scan sibling <td> cells for path-like content (fallback)
        if (!pathTxt) {
            for (const td of tr.cells) {
                if (td === cell) continue;
                const t = td.textContent.trim();
                if (t.length > 8 && t.includes("/") && /\.\w{2,5}$/.test(t)) {
                    pathTxt = t;
                    break;
                }
            }
        }

        let file = null;
        let hadPath = false; // true if we got a path string but couldn't match a file
        if (pathTxt) {
            // Exact relativePath match
            file = _spData.files.find(f => f.relativePath === pathTxt);
            // Filename-only match (strips leading season directory)
            if (!file) {
                const fname = pathTxt.split(/[/\\]/).pop().trim();
                if (fname) file = _spData.files.find(f =>
                    f.relativePath?.split(/[/\\]/).pop() === fname
                );
            }
            if (!file) hadPath = true; // path exists but no match → data is likely stale
        }

        // Last resort: unique release-group text (only safe if exactly 1 file has that RG)
        if (!file) {
            const rgText = cell.textContent.replace("✎", "").trim();
            if (rgText) {
                const hits = _spData.files.filter(f => (f.releaseGroup || "") === rgText);
                if (hits.length === 1) file = hits[0];
            }
        }

        if (!file) {
            // If we had a path but still couldn't match, _spData.files is stale
            // (Sonarr renamed files asynchronously — new DOM paths not in cache yet).
            // Fetch fresh data immediately; throttle prevents concurrent requests.
            if (hadPath) refetchFilesAndReInject();
            return;
        }

        const epArr = _spData.epMap.get(file.id) ?? [];
        const ep0   = firstEp(epArr);

        const btn = document.createElement("span");
        btn.className    = "ep-rg-edit-btn";
        btn.title        = epArr.length
            ? `Edit RG — ${fmtEp(epArr)} ${ep0?.title ?? ""} (${file.releaseGroup || "—"})`
            : `Edit Release Group (${file.releaseGroup || "—"})`;
        btn.textContent  = "✎";
        btn.dataset.fileId = String(file.id); // visible in DevTools for debugging

        btn.addEventListener("click", e => {
            e.stopPropagation();
            const currentSpData = getSpData();
            const latest     = currentSpData?.files.find(f => f.id === file.id) ?? file;
            const latestEpArr = currentSpData?.epMap.get(latest.id) ?? [];
            openEpRGEditor(btn, latest, firstEp(latestEpArr));
        });
        cell.appendChild(btn);
        // Mark as processed ONLY after successful injection so failed-match cells
        // remain retryable (refetchFilesAndReInject will re-run injectEpEditBtns).
        cell.dataset.epEditAdded = "true";
    });
}
