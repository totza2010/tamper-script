import { NETWORKS, EDITIONS, MAX_LANG } from "./constants.js";
import { getSpData, setSpData, isRefetching, setRefetching } from "./state.js";
import { apiReq } from "./api.js";
import { fmtEp, firstEp } from "./utils.js";
import { parseRG, buildValue } from "./rg-parser.js";
import { makeSelect2, makePartPills } from "./pickers.js";
import { sortedLangs } from "./lang.js";
import { checkRenameMismatch } from "./rename.js";

// ── Per-episode Release Group editor ─────────────────────────────────────────

/** Open floating Release Group editor anchored to `anchorEl`, editing `file`.
 *  @param {Element}  anchorEl  – the ✎ button element
 *  @param {Object}   file      – episode file object from _spData.files
 *  @param {Object}   [ep]      – episode metadata from _spData.epMap (optional)
 */
export function openEpRGEditor(anchorEl, file, ep = null) {
    document.getElementById("ep-rg-popup")?.remove();

    const parsed  = parseRG(file.releaseGroup || "");
    const epLabel = ep ? fmtEp(ep) : "";
    const epTitle = ep?.title ?? "";
    const fname   = file.relativePath?.split(/[/\\]/).pop() ?? "";

    const popup = document.createElement("div");
    popup.id = "ep-rg-popup";
    popup.className = "rgm-overlay";
    popup.innerHTML = `
        <div class="rgm-modal ep-rg-modal">
            <div class="rgm-head">
                <span class="rgm-title">✎ Edit Release Group</span>
                <span class="rgm-close">✕</span>
            </div>
            <div class="ep-rg-body">
                <div class="rgm-info">
                    ${epLabel ? `<div class="rgm-info-label">${epLabel}${epTitle ? ` — ${epTitle}` : ""}</div>` : ""}
                    ${fname   ? `<div class="rgm-info-path">${fname}</div>` : ""}
                    <div class="rgm-info-rg">Current RG: <code>${file.releaseGroup || "(none)"}</code></div>
                </div>
                <div class="rgm-picker-box" id="ep-picker-box"></div>
                <div class="rgm-section-lbl">Preview</div>
                <div id="ep-preview" class="rgm-preview empty">—</div>
            </div>
            <div class="rgm-footer">
                <button class="rgm-btn rgm-btn--ghost" id="ep-cancel">Cancel</button>
                <button class="rgm-btn rgm-btn--primary" id="ep-save">Save</button>
            </div>
        </div>`;
    document.body.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add("open"));

    const pickerBox = popup.querySelector("#ep-picker-box");
    const preview   = popup.querySelector("#ep-preview");
    const saveBtn   = popup.querySelector("#ep-save");
    const cancelBtn = popup.querySelector("#ep-cancel");

    const mkField = (label, comp) => {
        const f = document.createElement("div"); f.className = "rgm-field";
        const l = document.createElement("div"); l.className = "rgm-sub-lbl"; l.textContent = label;
        f.append(l, comp.el);
        return f;
    };

    const netComp   = makeSelect2(NETWORKS, parsed.networks, sync, "network");
    const edtComp   = makeSelect2(EDITIONS, parsed.editions, sync, "edition");
    const audioComp = makeSelect2(sortedLangs(), parsed.audioCodes, sync, "audio", MAX_LANG);
    const subComp   = makeSelect2(sortedLangs(), parsed.subCodes,   sync, "sub",   MAX_LANG);
    const partComp  = makePartPills(parsed.token, sync);

    const langRow = document.createElement("div"); langRow.className = "rgm-lang-row";
    langRow.append(mkField("Audio", audioComp), mkField("Subtitle", subComp));
    pickerBox.append(mkField("Network", netComp), mkField("Edition", edtComp), langRow, mkField("Multi-part", partComp));

    function sync() {
        const nets = netComp.get(), edts = edtComp.get();
        const val  = buildValue(nets, edts, audioComp.get(), subComp.get(), partComp.get());
        preview.textContent = val || "—";
        preview.className   = "rgm-preview" +
            (!val ? " empty" : nets.length || edts.length ? " has-network" : "");
    }
    sync();

    const close = () => { popup.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    popup.querySelector(".rgm-close").addEventListener("click", close);
    cancelBtn.addEventListener("click", close);
    // Backdrop blocks page clicks but does not close — prevents accidental dismiss
    popup.addEventListener("mousedown", e => { if (e.target === popup) { e.preventDefault(); e.stopPropagation(); } });

    // Save — PUT → verify → unified rename check
    saveBtn.addEventListener("click", async () => {
        const value = buildValue(netComp.get(), edtComp.get(), audioComp.get(), subComp.get(), partComp.get());
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

            close();

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
