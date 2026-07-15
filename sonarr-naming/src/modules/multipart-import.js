"use strict";

// ── Multi-part helpers for the Interactive Import modal ───────────────────────
//
// Two concerns, kept separate:
//   1. autoPairMultipart()  — map consecutive files onto episodes (N parts per
//      episode) starting from a chosen episode. Episode mapping only, no RG.
//   2. applyAutoPartRelease(baseRG) — once files are mapped, add partN to the
//      Release Group of every file that SHARES an episode with another. Called
//      from the Set Release Group modal, which supplies the base RG.
//
// Everything lives in Sonarr's Redux store (client-side until Import), so we
// reach the store off a row's React fiber and dispatch its update action. The
// action type + reprocess endpoint were verified against a live Sonarr v3 UI.

import { apiReq } from "./api.js";
import { showToast } from "./utils.js";
import { withRGToken } from "./rg-parser.js";

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

// ── Shared bits ───────────────────────────────────────────────────────────────

const byName = (a, b) =>
    (a.relativePath ?? "").localeCompare(b.relativePath ?? "", undefined, { numeric: true });

/**
 * Group files by the episode they're mapped to and keep only the groups where
 * more than one file shares an episode — those are the multi-part sets. Each
 * group is sorted by filename so part numbers follow the on-disk order.
 */
function multipartGroups(items) {
    const byEp = new Map();
    for (const it of items) {
        const ep = (it.episodes ?? [])[0];
        if (!ep) continue;
        (byEp.get(ep.id) ?? byEp.set(ep.id, []).get(ep.id)).push(it);
    }
    return [...byEp.values()].filter(g => g.length > 1).map(g => g.slice().sort(byName));
}

/**
 * Reprocess the given items via the API so Sonarr recomputes rejections
 * (clears the stale "Episodes not selected" danger flag) while keeping our
 * releaseGroup. Batched to avoid one huge slow request. Runs in the background.
 */
async function reprocessItems(store, itemList) {
    const ids = new Set(itemList.map(it => it.id));
    const items = getItems(store).filter(it => ids.has(it.id));
    const toPayload = it => ({
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
    });

    const CHUNK = 6;
    for (let i = 0; i < items.length; i += CHUNK) {
        const batch = items.slice(i, i + CHUNK);
        const resp = await apiReq("POST", "/api/v3/manualimport", batch.map(toPayload));
        if (Array.isArray(resp)) {
            for (const r of resp) {
                const match = batch.find(it => it.path === r.path);
                if (match) updateItems(store, [match.id], { rejections: r.rejections ?? [] });
            }
        }
    }
}

// ── Part B: auto-part in the Set Release Group modal ──────────────────────────

/** Number of files in the import that share an episode with another (0 = none). */
export function multipartFileCount() {
    const store = getImportStore();
    if (!store) return 0;
    return multipartGroups(getItems(store)).reduce((n, g) => n + g.length, 0);
}

/**
 * Give every file that shares an episode a Release Group of `baseRG` with its
 * partN token, numbered by filename order within the episode. The base RG is
 * built by the Set Release Group modal (network/edition/language).
 * @returns {number} files updated, or -1 if the store is unavailable
 */
export function applyAutoPartRelease(baseRG) {
    const store = getImportStore();
    if (!store) { showToast("เข้าถึง Interactive Import ไม่ได้"); return -1; }

    const groups = multipartGroups(getItems(store));
    const touched = [];
    for (const group of groups) {
        group.forEach((item, i) => {
            updateItems(store, [item.id], { releaseGroup: withRGToken(baseRG, `part${i + 1}`) });
            touched.push(item);
        });
    }
    if (!touched.length) { showToast("ไม่พบไฟล์ที่ซ้ำ episode ในหน้านี้"); return 0; }

    showToast(`ใส่ part ให้ ${touched.length} ไฟล์แล้ว — กำลัง refresh สถานะ…`);
    reprocessItems(store, touched)
        .then(() => showToast("พร้อม Import — ตรวจตารางแล้วกด Import ของ Sonarr"))
        .catch(e => {
            console.warn("[RG MultiPart] reprocess failed:", e.message);
            showToast("ใส่ part แล้ว แต่ refresh สถานะไม่ครบ — ถ้ายังมี ⚠ ให้กด episode ซ้ำ 1 ไฟล์");
        });
    return touched.length;
}

// ── Part A: episode-pairing modal ─────────────────────────────────────────────

/**
 * Map consecutive files onto episodes, `parts` files per episode, starting from
 * the episode numbered `startEp`. Episode mapping only — the Release Group is
 * set afterwards from the Set Release Group modal.
 */
async function pairEpisodes(items, parts, startEp) {
    const bySeason = new Map();
    for (const it of items) {
        const k = `${it.seriesId}|${it.seasonNumber}`;
        (bySeason.get(k) ?? bySeason.set(k, []).get(k)).push(it);
    }

    const assignments = [];
    for (const [k, group] of bySeason) {
        const [seriesId, season] = k.split("|").map(Number);
        const eps = await fetchEpisodes(seriesId, season);
        const startIdx = Math.max(0, eps.findIndex(e => e.episodeNumber >= startEp));
        const sortedItems = group.slice().sort(byName);

        for (let i = 0; i < sortedItems.length; i++) {
            const episode = eps[startIdx + Math.floor(i / parts)];
            if (!episode) break;   // ran out of episodes
            assignments.push({ item: sortedItems[i], episode });
        }
    }
    return assignments;
}

function closeModal() { document.getElementById("mpp-overlay")?.remove(); }

/** Entry point — opens the episode-pairing modal. */
export function autoPairMultipart() {
    const store = getImportStore();
    if (!store) { alert("เปิดหน้า Interactive Import (Manual Import) ก่อน แล้วค่อยกดปุ่มนี้"); return; }
    if (!getItems(store).length) { alert("ไม่พบไฟล์ในหน้านี้"); return; }

    closeModal();

    const overlay = document.createElement("div");
    overlay.id = "mpp-overlay";
    overlay.innerHTML = `
        <div id="mpp-modal">
            <div class="mpp-head"><span>🔗 Multi-part pair — จับคู่ตอน</span><span class="mpp-close">✕</span></div>
            <div class="mpp-sub">แมพไฟล์เรียงตามชื่อเข้า episode ทีละ N ไฟล์ (Release Group ตั้งทีหลังด้วยปุ่ม 🏷)</div>
            <div class="mpp-body">
                <div class="mpp-row">
                    <div class="mpp-row-lbl">Parts / ตอน</div>
                    <div class="mpp-row-right" style="display:flex;align-items:center">
                        <input type="number" class="mpp-parts" min="1" value="2">
                        <span class="mpp-parts-hint">เช่น 2 = 2 ไฟล์ต่อ episode</span>
                    </div>
                </div>
                <div class="mpp-row">
                    <div class="mpp-row-lbl">เริ่มที่ตอน</div>
                    <div class="mpp-row-right" style="display:flex;align-items:center">
                        <input type="number" class="mpp-start" min="1" value="1">
                        <span class="mpp-parts-hint">episode แรกที่จะเริ่มจับคู่</span>
                    </div>
                </div>
                <div class="mpp-preview-lbl">Preview</div>
                <div class="mpp-preview" id="mpp-preview"></div>
            </div>
            <div class="mpp-btns">
                <button class="mpp-btn mpp-cancel">Cancel</button>
                <button class="mpp-btn mpp-apply">จับคู่ตอน</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const partsInput = overlay.querySelector(".mpp-parts");
    const startInput = overlay.querySelector(".mpp-start");
    const preview    = overlay.querySelector("#mpp-preview");
    const applyBtn   = overlay.querySelector(".mpp-apply");

    const fileCount = getItems(store).filter(it => it.seriesId != null && it.seasonNumber != null).length;

    function sync() {
        const parts = Math.max(1, parseInt(partsInput.value, 10) || 1);
        const start = Math.max(1, parseInt(startInput.value, 10) || 1);
        const episodes = Math.ceil(fileCount / parts);
        const lines = [];
        for (let e = 0; e < Math.min(episodes, 4); e++) {
            const first = e * parts + 1;
            const last  = Math.min((e + 1) * parts, fileCount);
            lines.push(`ไฟล์ ${first}${last > first ? `–${last}` : ""} → ตอน ${start + e}`);
        }
        if (episodes > 4) lines.push("…");
        preview.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
    }
    partsInput.addEventListener("input", sync);
    startInput.addEventListener("input", sync);
    sync();

    overlay.querySelector(".mpp-close").addEventListener("click", closeModal);
    overlay.querySelector(".mpp-cancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

    applyBtn.addEventListener("click", async () => {
        const parts = parseInt(partsInput.value, 10);
        const start = parseInt(startInput.value, 10);
        if (!(parts >= 1)) { alert("ใส่จำนวน part เป็นเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไป"); return; }
        if (!(start >= 1)) { alert("ใส่เลขตอนเริ่มต้นให้ถูกต้อง"); return; }

        const items = getItems(store).filter(it => it.seriesId != null && it.seasonNumber != null);
        if (!items.length) {
            alert("ไฟล์ยังไม่ได้เลือกเรื่อง/ซีซัน — ในตารางกำหนด Series และ Season ให้ไฟล์ก่อน แล้วลองใหม่");
            return;
        }

        applyBtn.disabled = true;
        applyBtn.textContent = "กำลังจับคู่…";
        let assignments;
        try {
            assignments = await pairEpisodes(items, parts, start);
        } catch (e) {
            applyBtn.disabled = false;
            applyBtn.textContent = "จับคู่ตอน";
            alert("ดึงรายการ episode ไม่สำเร็จ: " + e.message);
            return;
        }
        if (!assignments.length) {
            applyBtn.disabled = false;
            applyBtn.textContent = "จับคู่ตอน";
            alert("จับคู่ไม่ได้ — ไม่พบ episode ตั้งแต่ตอนที่ระบุ");
            return;
        }

        for (const { item, episode } of assignments) {
            updateItems(store, [item.id], { episodes: [episode] });
        }
        closeModal();
        showToast(`จับคู่ ${assignments.length} ไฟล์เข้า episode แล้ว — กำลัง refresh…`);

        reprocessItems(store, assignments.map(a => a.item))
            .then(() => showToast("เสร็จ — ตั้ง Release Group ต่อด้วยปุ่ม 🏷 (จะใส่ partN ให้อัตโนมัติ)"))
            .catch(e => {
                console.warn("[RG MultiPart] reprocess failed:", e.message);
                showToast("จับคู่แล้ว แต่ refresh สถานะไม่ครบ — ถ้ายังมี ⚠ ให้กด episode ซ้ำ 1 ไฟล์");
            });
    });
}
