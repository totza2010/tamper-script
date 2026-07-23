"use strict";

// ── Wizard orchestration: Suggest → Rename → Strip in one modal ──────────────
// After the Release Group is applied, advance the SAME overlay through the
// remaining steps. Auto-run steps (per Settings) run headlessly; otherwise the
// step is shown for review. The overlay closes when the flow ends.

import { apiReq } from "./api.js";
import { closeOverlay } from "./flow-modal.js";
import { renderRenameStep, runRenameCommand } from "./rename.js";
import { getStripAffected, renderStripStep, executeGroupFix } from "./prefix-fix.js";

/** Rename phase → then strip phase, all inside `overlay`. */
export async function advanceRenameThenStrip(overlay, series) {
    let renames = [];
    try { renames = (await apiReq("GET", `/api/v3/rename?seriesId=${series.id}`)) ?? []; } catch { /* ignore */ }

    const autoRename = GM_getValue("rgsp_rename_now", true);
    if (renames.length && !autoRename) {
        renderRenameStep(overlay, series, renames, { next: () => advanceStrip(overlay, series) });
        return;
    }
    if (renames.length && autoRename) {
        try { await runRenameCommand(series, renames.map(r => r.episodeFileId)); } catch { /* progress showed it */ }
    }
    advanceStrip(overlay, series);
}

/** Strip phase inside `overlay`; closes it when nothing (more) to do. */
async function advanceStrip(overlay, series) {
    let affected = [];
    try { affected = await getStripAffected(series); } catch { /* ignore */ }

    if (!affected.length) { closeOverlay(overlay); return; }

    if (GM_getValue("rfp_strip_now", false)) {
        executeGroupFix(series, affected, () => closeOverlay(overlay));
    } else {
        renderStripStep(overlay, series, affected);
    }
}
