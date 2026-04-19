import { apiReq, waitForCommand } from "./api.js";
import { createProgress } from "./progress-ui.js";

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
    document.getElementById("rg-rename-panel")?.remove();

    const panel = document.createElement("div");
    panel.id = "rg-rename-panel";

    const fileRows = items.map(r => {
        const oldName = r.existingPath.split(/[/\\]/).pop();
        const newName = r.newPath.split(/[/\\]/).pop();
        return `<div class="rn-file">
            <div class="rn-old">${oldName}</div>
            <div class="rn-arrow">↓</div>
            <div class="rn-new">${newName}</div>
        </div>`;
    }).join("");

    panel.innerHTML = `
        <div class="rfp-head">
            🔄 ${items.length} file${items.length > 1 ? "s" : ""} need renaming
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            <p class="rfp-desc">
                Sonarr detected <strong>${items.length}</strong> file${items.length > 1 ? "s" : ""}
                whose filename does not match current metadata. Review below then rename.
            </p>
            <div class="rn-file-list">${fileRows}</div>
        </div>
        <div class="rfp-btns" style="padding:10px 13px 14px;flex-shrink:0">
            <button class="rfp-btn rfp-cancel" id="rn-cancel">Dismiss</button>
            <button class="rfp-btn rfp-confirm" id="rn-do-rename">Rename Now</button>
        </div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#rn-cancel").addEventListener("click",      () => panel.classList.remove("open"));

    panel.querySelector("#rn-do-rename").addEventListener("click", async () => {
        panel.classList.remove("open");

        const prog = createProgress("🔄 Renaming Files", [
            "Sending rename command",
            "Waiting for rename",
        ]);

        try {
            prog.update(0, "active");
            const cmd = await apiReq("POST", "/api/v3/command", {
                name: "RenameFiles",
                seriesId: series.id,
                files: items.map(r => r.episodeFileId),
            });
            prog.update(0, "done");

            prog.update(1, "active", "queued");
            await waitForCommand(cmd.id, st => prog.update(1, "active", st));
            prog.update(1, "done");

            if (afterRenameCb) afterRenameCb();
            prog.finish(`✓ ${items.length} file${items.length > 1 ? "s" : ""} renamed.`, 1500);
        } catch (e) {
            prog.fail(`✗ ${e.message}`);
        }
    });
}
