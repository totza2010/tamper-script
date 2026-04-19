import { apiReq, waitForCommand } from "./api.js";

// ── Rename mismatch notification ──────────────────────────────────────────────

/**
 * Unified rename-mismatch checker.
 * Called from two places:
 *   1. After per-episode RG edit (fileIds = [id] — check only that file)
 *   2. Series page load with no prefix files (fileIds undefined — check all)
 *
 * Sonarr's /rename endpoint returns files whose current filename differs from
 * what Sonarr would generate given the current metadata.
 */
export async function checkRenameMismatch(series, fileIds, afterRenameCb) {
    if (!series) return;
    try {
        const results = await apiReq("GET", `/api/v3/rename?seriesId=${series.id}`);
        const pending = fileIds
            ? results.filter(r => fileIds.includes(r.episodeFileId))
            : results;
        if (pending.length === 0) return;
        showRenameNotif(series, pending, afterRenameCb);
    } catch (e) { console.warn("[RG Rename]", e.message); }
}

export function showRenameNotif(series, items, afterRenameCb) {
    document.getElementById("rg-rename-notif")?.remove();

    const notif = document.createElement("div");
    notif.id    = "rg-rename-notif";

    const fileRows = items.slice(0, 5).map(r => {
        const oldName = r.existingPath.split(/[/\\]/).pop();
        const newName = r.newPath.split(/[/\\]/).pop();
        return `<div class="rn-file">
            <div class="rn-old">${oldName}</div>
            <div class="rn-arrow">↓</div>
            <div class="rn-new">${newName}</div>
        </div>`;
    }).join("");
    const more = items.length > 5
        ? `<div style="color:#567;font-size:11px;padding:3px 0">…and ${items.length - 5} more</div>` : "";

    notif.innerHTML = `
        <div class="rn-head">
            🔄 ${items.length} file${items.length > 1 ? "s" : ""} need renaming
            <span class="rn-head-close">✕</span>
        </div>
        <div class="rn-body">${fileRows}${more}</div>
        <div class="rn-btns">
            <button class="rn-btn rn-cancel">Dismiss</button>
            <button class="rn-btn rn-rename-now" id="rn-do-rename">Rename Now</button>
        </div>`;

    document.body.appendChild(notif);
    // Force reflow so transition plays
    requestAnimationFrame(() => requestAnimationFrame(() => notif.classList.add("open")));

    notif.querySelector(".rn-head-close").addEventListener("click", () => notif.remove());
    notif.querySelector(".rn-cancel").addEventListener("click",     () => notif.remove());

    notif.querySelector("#rn-do-rename").addEventListener("click", async () => {
        const btn = notif.querySelector("#rn-do-rename");
        btn.disabled = true; btn.textContent = "Renaming…";
        try {
            const cmd = await apiReq("POST", "/api/v3/command", {
                name: "RenameFiles",
                seriesId: series.id,
                files: items.map(r => r.episodeFileId),
            });
            // Poll until Sonarr actually finishes — then fire afterRenameCb
            await waitForCommand(cmd.id,
                st => { btn.textContent = `Renaming… (${st})`; });
            btn.textContent = "✓ Done";
            if (afterRenameCb) afterRenameCb();
            setTimeout(() => notif.remove(), 1500);
        } catch (e) {
            btn.textContent = "✗ Error"; btn.disabled = false;
            setTimeout(() => { btn.textContent = "Rename Now"; }, 2500);
        }
    });
}
