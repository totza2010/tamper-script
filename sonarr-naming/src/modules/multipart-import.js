"use strict";

// ── Multi-part auto-pairing for the Interactive Import modal ──────────────────
//
// Sonarr's Interactive Import maps one file → one episode. For Plex multi-part
// releases (2+ files that together make one episode) the mapping has to be done
// by hand, file by file. This automates it:
//   • pair consecutive files onto the same episode (N parts per episode)
//   • build the Release Group (network/edition/audio/sub) right here — the files
//     aren't imported yet so Sonarr has no mediainfo/language to read — and
//     prepend partN- to it
//   • reprocess so Sonarr clears the stale "Episodes not selected" rejection
// Afterwards the user reviews the table and clicks Sonarr's own Import button.
//
// Everything lives in Sonarr's Redux store (client-side until Import), so we
// reach the store off a row's React fiber and dispatch its update action. The
// action type + reprocess endpoint were verified against a live Sonarr v3 UI.

import { apiReq } from "./api.js";
import { showToast } from "./utils.js";
import { NETWORKS, EDITIONS } from "./constants.js";
import { makeMultiPills, makeLangPicker } from "./pickers.js";
import { buildValue } from "./rg-parser.js";

const UPDATE_ACTION = "interactiveImport/updateInteractiveImportItems";

// ── Redux store access ────────────────────────────────────────────────────────

/** Walk up a row cell's React fiber to find the Redux store. */
function getImportStore() {
    const cell = document.querySelector("[class*='InteractiveImportRow-relativePath']");
    if (!cell) return null;
    const key = Object.keys(cell).find(k => k.startsWith("__reactFiber$"));
    let f = key ? cell[key] : null;
    for (let i = 0; i < 120 && f; i++) {
        const mp = f.memoizedProps;
        if (mp) {
            if (mp.store?.getState) return mp.store;
            if (mp.value?.store?.getState) return mp.value.store;
        }
        f = f.return;
    }
    return null;
}

function getItems(store) {
    return store.getState()?.interactiveImport?.items ?? [];
}

/** Dispatch a partial update onto one or more import items. */
function updateItems(store, ids, patch) {
    store.dispatch({ type: UPDATE_ACTION, payload: { ids, ...patch } });
}

// ── Episode fetching ──────────────────────────────────────────────────────────

const epCache = new Map();
async function fetchEpisodes(seriesId, seasonNumber) {
    const cacheKey = `${seriesId}|${seasonNumber}`;
    if (epCache.has(cacheKey)) return epCache.get(cacheKey);
    const eps = await apiReq("GET",
        `/api/v3/episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`);
    const sorted = (eps ?? [])
        .filter(e => e.seasonNumber === seasonNumber)
        .sort((a, b) => a.episodeNumber - b.episodeNumber);
    epCache.set(cacheKey, sorted);
    return sorted;
}

// ── Pairing + apply ───────────────────────────────────────────────────────────

/** Compute file→episode→part assignments for every item, grouped by season. */
async function computeAssignments(items, parts) {
    const bySeason = new Map();
    for (const it of items) {
        const k = `${it.seriesId}|${it.seasonNumber}`;
        (bySeason.get(k) ?? bySeason.set(k, []).get(k)).push(it);
    }

    const assignments = [];
    for (const [k, group] of bySeason) {
        const [seriesId, season] = k.split("|").map(Number);
        const eps = await fetchEpisodes(seriesId, season);
        const sortedItems = group.slice().sort((a, b) =>
            (a.relativePath ?? "").localeCompare(b.relativePath ?? "", undefined, { numeric: true }));

        for (let i = 0; i < sortedItems.length; i++) {
            const episode = eps[Math.floor(i / parts)];
            if (!episode) break;   // more files than episodes — stop this season
            assignments.push({ item: sortedItems[i], episode, part: (i % parts) + 1 });
        }
    }
    return assignments;
}

/** Apply episode + Release Group to every item, then reprocess to clear flags. */
async function applyPairing(store, assignments, rgBody) {
    for (const { item, episode, part } of assignments) {
        const rg = rgBody ? `part${part}-${rgBody}` : `part${part}`;
        updateItems(store, [item.id], { episodes: [episode], releaseGroup: rg });
    }

    const fresh = getItems(store);
    const affected = new Set(assignments.map(a => a.item.id));
    const payload = fresh.filter(it => affected.has(it.id)).map(it => ({
        path:         it.path,
        seriesId:     it.seriesId,
        seasonNumber: it.seasonNumber,
        episodeIds:   (it.episodes ?? []).map(e => e.id),
        quality:      it.quality,
        languages:    it.languages,
        releaseGroup: it.releaseGroup,
        downloadId:   it.downloadId,
        indexerFlags: it.indexerFlags,
        releaseType:  it.releaseType,
    }));
    const resp = await apiReq("POST", "/api/v3/manualimport", payload);
    if (Array.isArray(resp)) {
        for (const r of resp) {
            const match = fresh.find(it => it.path === r.path);
            if (match) updateItems(store, [match.id], { rejections: r.rejections ?? [] });
        }
    }
}

// ── Modal UI ──────────────────────────────────────────────────────────────────

function closeModal() { document.getElementById("mpp-overlay")?.remove(); }

/**
 * Entry point — opens the Multi-part pair modal.
 * Set languages here (files aren't imported yet, so mediainfo is unavailable);
 * the modal builds the full Release Group and prepends partN in one step.
 */
export function autoPairMultipart() {
    const store = getImportStore();
    if (!store) { alert("เปิดหน้า Interactive Import (Manual Import) ก่อน แล้วค่อยกดปุ่มนี้"); return; }
    if (!getItems(store).length) { alert("ไม่พบไฟล์ในหน้านี้"); return; }

    closeModal();

    const overlay = document.createElement("div");
    overlay.id = "mpp-overlay";
    overlay.innerHTML = `
        <div id="mpp-modal">
            <div class="mpp-head"><span>🔗 Multi-part pair</span><span class="mpp-close">✕</span></div>
            <div class="mpp-sub">จับคู่ไฟล์ตามลำดับชื่อเข้า episode เดียวกัน + ตั้ง Release Group พร้อม partN</div>
            <div class="mpp-body">
                <div class="mpp-row">
                    <div class="mpp-row-lbl">Parts / ตอน</div>
                    <div class="mpp-row-right" style="display:flex;align-items:center">
                        <input type="number" class="mpp-parts" min="1" value="2">
                        <span class="mpp-parts-hint">เช่น 2 = part1 + part2 ต่อ episode</span>
                    </div>
                </div>
                <div class="mpp-row"><div class="mpp-row-lbl">Network</div><div class="mpp-row-right mpp-net"></div></div>
                <div class="mpp-row"><div class="mpp-row-lbl">Edition</div><div class="mpp-row-right mpp-edt"></div></div>
                <div class="mpp-row"><div class="mpp-row-lbl">Language</div><div class="mpp-row-right"><div class="rg-dual mpp-langs"></div></div></div>
                <div class="mpp-preview-lbl">Preview</div>
                <div class="mpp-preview" id="mpp-preview"></div>
            </div>
            <div class="mpp-btns">
                <button class="mpp-btn mpp-cancel">Cancel</button>
                <button class="mpp-btn mpp-apply">Apply</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const partsInput = overlay.querySelector(".mpp-parts");
    const preview    = overlay.querySelector("#mpp-preview");
    const applyBtn   = overlay.querySelector(".mpp-apply");

    // Pickers (reuse the Release Group builder components)
    const netComp   = makeMultiPills(NETWORKS, "net", [], sync);
    const edtComp   = makeMultiPills(EDITIONS, "edt", [], sync);
    const audioComp = makeLangPicker("Audio", [], sync);
    const subComp   = makeLangPicker("Subtitle", [], sync);
    overlay.querySelector(".mpp-net").appendChild(netComp.el);
    overlay.querySelector(".mpp-edt").appendChild(edtComp.el);
    overlay.querySelector(".mpp-langs").append(audioComp.el, subComp.el);

    function currentBody() {
        return buildValue(netComp.get(), edtComp.get(), audioComp.get(), subComp.get());
    }

    function sync() {
        const parts = Math.max(1, parseInt(partsInput.value, 10) || 1);
        const body  = currentBody();
        const lines = [];
        for (let p = 1; p <= Math.min(parts, 6); p++) {
            lines.push(body ? `part${p}-${body}` : `part${p}`);
        }
        preview.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
    }

    partsInput.addEventListener("input", sync);
    sync();

    // Close handlers
    overlay.querySelector(".mpp-close").addEventListener("click", closeModal);
    overlay.querySelector(".mpp-cancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

    // Apply
    applyBtn.addEventListener("click", async () => {
        const parts = parseInt(partsInput.value, 10);
        if (!(parts >= 1)) { alert("ใส่จำนวน part เป็นเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไป"); return; }

        applyBtn.disabled = true;
        applyBtn.textContent = "กำลังจับคู่…";
        try {
            const items = getItems(store);
            const assignments = await computeAssignments(items, parts);
            if (!assignments.length) { alert("จับคู่ไม่ได้ — ไม่พบ episode ของซีรีส์นี้"); return; }

            await applyPairing(store, assignments, currentBody());
            closeModal();
            showToast(`จับคู่ multi-part ${assignments.length} ไฟล์เสร็จ — ตรวจในตารางแล้วกด Import`);
        } catch (e) {
            console.warn("[RG MultiPair]", e.message);
            alert("ทำไม่สำเร็จ: " + e.message);
        } finally {
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply";
        }
    });
}
