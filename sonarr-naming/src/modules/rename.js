import { apiReq, waitForCommand } from "./api.js";
import { createProgress } from "./progress-ui.js";
import { getFlowOverlay, renderStep, closeOverlay } from "./flow-modal.js";

// ── Rename mismatch step (shared workflow modal) ──────────────────────────────

/**
 * Unified rename-mismatch checker.
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
        renderRenameStep(getFlowOverlay(), series, pending, { afterRenameCb });
    } catch (e) { console.warn("[RG Rename]", e.message); }
}

/** Headless rename — fire the command and wait, showing only the progress UI. */
export async function runRenameCommand(series, fileIds) {
    const n = fileIds.length;
    const prog = createProgress("🔄 Renaming Files", ["Sending rename command", "Waiting for rename"]);
    try {
        prog.update(0, "active");
        const cmd = await apiReq("POST", "/api/v3/command", { name: "RenameFiles", seriesId: series.id, files: fileIds });
        prog.update(0, "done");
        prog.update(1, "active", "queued");
        await waitForCommand(cmd.id, st => prog.update(1, "active", st));
        prog.update(1, "done");
        prog.finish(`✓ ${n} file${n > 1 ? "s" : ""} renamed.`, 1200);
    } catch (e) { prog.fail(`✗ ${e.message}`); throw e; }
}

/**
 * Render the Rename step into `overlay`. Used both standalone and as a step that
 * continues the Suggest → Rename → Strip flow (pass `next` to advance).
 *
 * @param {Element}  overlay
 * @param {object}   series
 * @param {Array}    items        — /rename results
 * @param {object}   [opts]
 * @param {Function} [opts.afterRenameCb] — run after a successful rename
 * @param {Function} [opts.next]          — called with (overlay) after rename to
 *                                          advance the flow; if absent, closes.
 */
export function renderRenameStep(overlay, series, items, { afterRenameCb, next } = {}) {
    const n = items.length;
    const fileRows = items.map(r => {
        const oldName = r.existingPath.split(/[/\\]/).pop();
        const newName = r.newPath.split(/[/\\]/).pop();
        return `<div class="rn-file">
            <div class="rn-old">${oldName}</div>
            <div class="rn-arrow">↓</div>
            <div class="rn-new">${newName}</div>
        </div>`;
    }).join("");

    const modal = renderStep(overlay, {
        title: `🔄 ${n} file${n > 1 ? "s" : ""} need renaming`,
        body: `<div class="rgm-body">
            <p class="rgm-desc">Sonarr detected <strong>${n}</strong> file${n > 1 ? "s" : ""}
                whose filename does not match current metadata. Review below then rename.</p>
            <div class="rn-file-list">${fileRows}</div>
        </div>`,
        footer: `<div class="rgm-footer">
            <button class="rgm-btn rgm-btn--ghost" id="rn-cancel">${next ? "Skip" : "Dismiss"}</button>
            <button class="rgm-btn rgm-btn--primary" id="rn-do-rename">Rename Now</button>
        </div>`,
    });

    modal.querySelector("#rn-cancel").addEventListener("click", () => {
        if (next) next(overlay); else closeOverlay(overlay);
    });

    modal.querySelector("#rn-do-rename").addEventListener("click", async () => {
        const prog = createProgress("🔄 Renaming Files", ["Sending rename command", "Waiting for rename"]);
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
            prog.finish(`✓ ${n} file${n > 1 ? "s" : ""} renamed.`, 1500);
            if (next) next(overlay); else closeOverlay(overlay);
        } catch (e) {
            prog.fail(`✗ ${e.message}`);
        }
    });
}
