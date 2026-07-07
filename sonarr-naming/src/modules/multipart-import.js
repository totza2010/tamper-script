"use strict";

// ── Multi-part auto-pairing for the Interactive Import modal ──────────────────
//
// Sonarr's Interactive Import maps one file → one episode. For Plex multi-part
// releases (2+ files that together make one episode) the mapping has to be done
// by hand, file by file. This automates it:
//   • pair consecutive files onto the same episode (N parts per episode)
//   • prepend "partN-" to each file's Release Group
//   • reprocess so Sonarr clears the stale "Episodes not selected" rejection
// Afterwards the user reviews the table and clicks Sonarr's own Import button.
//
// Everything lives in Sonarr's Redux store (client-side until Import), so we
// reach the store off a row's React fiber and dispatch its update action. The
// action type + reprocess endpoint were verified against a live Sonarr v3 UI.

import { apiReq } from "./api.js";
import { showToast } from "./utils.js";

const UPDATE_ACTION = "interactiveImport/updateInteractiveImportItems";

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

/** Strip an existing leading "partN-" so we never double-prefix. */
function stripPartPrefix(rg) {
    return (rg ?? "").replace(/^part\d+-/i, "");
}

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

/**
 * Auto-pair the files in the open Interactive Import modal.
 * Set the base Release Group first (🏷 button) — this only adds the partN prefix
 * on top of whatever Release Group each row already has.
 */
export async function autoPairMultipart() {
    const store = getImportStore();
    if (!store) { alert("เปิดหน้า Interactive Import (Manual Import) ก่อน แล้วค่อยกดปุ่มนี้"); return; }

    const items = getItems(store);
    if (!items.length) { alert("ไม่พบไฟล์ในหน้านี้"); return; }

    const partsStr = window.prompt(
        "กี่ part ต่อ 1 ตอน?  (เช่น 2 = part1 + part2 ต่อ episode)\n" +
        "ไฟล์จะถูกจับคู่ตามลำดับชื่อไฟล์", "2");
    if (partsStr == null) return;
    const parts = parseInt(partsStr, 10);
    if (!(parts >= 1)) { alert("ใส่จำนวน part เป็นเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไป"); return; }

    // Group by series + season, then chunk each group by `parts`.
    const bySeason = new Map();
    for (const it of items) {
        const k = `${it.seriesId}|${it.seasonNumber}`;
        (bySeason.get(k) ?? bySeason.set(k, []).get(k)).push(it);
    }

    const assignments = [];   // { item, episode, part }
    const summary = [];
    try {
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
            const mapped = assignments.filter(a => group.includes(a.item)).length;
            summary.push(`S${String(season).padStart(2, "0")}: ${sortedItems.length} ไฟล์ → ${Math.ceil(mapped / parts)} ตอน`);
        }
    } catch (e) {
        alert("ดึงรายการ episode ไม่สำเร็จ: " + e.message);
        return;
    }

    if (!assignments.length) { alert("จับคู่ไม่ได้ — ไม่พบ episode ของซีรีส์นี้"); return; }

    if (!confirm(
        `Multi-part pair (${parts} part/ตอน)\n${summary.join("\n")}\n\n` +
        `แต่ละไฟล์: map episode ตามลำดับ + ใส่ part1…part${parts} นำหน้า Release Group เดิม\n\n` +
        `เคล็ดลับ: ตั้ง Release Group ภาษา (🏷) ให้ครบก่อน จะได้เป็น part1-AudioENSubEN\n\nยืนยัน?`
    )) return;

    // Apply episode + Release Group per file.
    for (const { item, episode, part } of assignments) {
        const base = stripPartPrefix(item.releaseGroup ?? "");
        const rg = base ? `part${part}-${base}` : `part${part}`;
        updateItems(store, [item.id], { episodes: [episode], releaseGroup: rg });
    }

    // Reprocess the affected files so Sonarr recomputes rejections (clears the
    // stale "Episodes not selected" danger flag) while keeping our releaseGroup.
    try {
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
    } catch (e) {
        console.warn("[RG MultiPair] reprocess failed:", e.message);
        showToast("จับคู่แล้ว แต่ refresh สถานะไม่สำเร็จ — ตรวจ rejection ในตารางก่อน Import");
        return;
    }

    showToast(`จับคู่ multi-part ${assignments.length} ไฟล์เสร็จ — ตรวจในตารางแล้วกด Import`);
}
