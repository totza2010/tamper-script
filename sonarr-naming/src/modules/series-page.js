import { RG_PREFIX_RE } from "./constants.js";
import { getSpData, setSpData } from "./state.js";
import { apiReq } from "./api.js";
import { firstEp, showToast } from "./utils.js";
import { injectEpEditBtns } from "./ep-editor.js";
import { checkRenameMismatch } from "./rename.js";
import { prefixAlreadyInFilename, buildFixUI, recheckPrefixFiles } from "./prefix-fix.js";
import { _buildSuggCandidates, buildRGSuggestionUI, recheckRGSuggestions } from "./suggestion.js";
import { openSettings } from "./settings.js";
import { checkUnmatchedFiles, showUnmatchedPanel } from "./unmatched.js";

// ── Series page orchestration ─────────────────────────────────────────────────

export function initFABs() {
    // Persistent ⚙ settings button
    const settingsBtn = document.createElement("div");
    settingsBtn.id    = "rg-settings-btn";
    settingsBtn.title = "Script Settings";
    settingsBtn.textContent = "⚙";
    settingsBtn.addEventListener("click", openSettings);
    document.body.appendChild(settingsBtn);

    // ↺ Rename-check button
    const checkBtn = document.createElement("div");
    checkBtn.id        = "rg-check-btn";
    checkBtn.className = "rg-fab-side";
    checkBtn.title     = "Check rename mismatches now";
    checkBtn.textContent = "↺";
    checkBtn.addEventListener("click", async () => {
        const _spData = getSpData();
        if (!_spData?.series || checkBtn.classList.contains("spinning")) return;
        checkBtn.classList.add("spinning");
        try {
            document.getElementById("rg-rename-notif")?.remove();
            await checkRenameMismatch(_spData.series);
        } finally {
            checkBtn.classList.remove("spinning");
        }
    });
    document.body.appendChild(checkBtn);

    // ✂ Strip-prefix recheck button
    const stripBtn = document.createElement("div");
    stripBtn.id        = "rg-strip-btn";
    stripBtn.className = "rg-fab-side";
    stripBtn.title     = "Re-check [prefix]- Release Group files";
    stripBtn.textContent = "✂";
    stripBtn.addEventListener("click", async () => {
        const _spData = getSpData();
        if (!_spData?.series || stripBtn.classList.contains("spinning")) return;
        stripBtn.classList.add("spinning");
        try {
            await recheckPrefixFiles();
        } finally {
            stripBtn.classList.remove("spinning");
        }
    });
    document.body.appendChild(stripBtn);

    // 💡 RG Suggestion button
    const suggestBtn = document.createElement("div");
    suggestBtn.id        = "rg-suggest-btn";
    suggestBtn.className = "rg-fab-side";
    suggestBtn.title     = "Suggest Release Group from mediaInfo";
    suggestBtn.textContent = "💡";
    suggestBtn.addEventListener("click", async () => {
        const _spData = getSpData();
        if (!_spData?.series || suggestBtn.classList.contains("spinning")) return;
        // Toggle: if panel is open, just close it
        const existingPanel = document.getElementById("rg-sugg-panel");
        if (existingPanel?.classList.contains("open")) {
            existingPanel.classList.remove("open");
            return;
        }
        suggestBtn.classList.add("spinning");
        try {
            await recheckRGSuggestions();
        } finally {
            suggestBtn.classList.remove("spinning");
        }
    });
    document.body.appendChild(suggestBtn);

    // 📁 Unmatched files button
    const unmatchedBtn = document.createElement("div");
    unmatchedBtn.id        = "rg-unmatched-btn";
    unmatchedBtn.className = "rg-fab-side";
    unmatchedBtn.title     = "Check unmatched files in series folder";
    unmatchedBtn.textContent = "📁";
    unmatchedBtn.addEventListener("click", () => {
        // Toggle: if panel is open, close it
        const existingPanel = document.getElementById("rg-unmatched-panel");
        if (existingPanel?.classList.contains("open")) {
            existingPanel.classList.remove("open");
            return;
        }
        showUnmatchedPanel();
    });
    document.body.appendChild(unmatchedBtn);
}

export async function checkSeriesPage() {
    document.getElementById("rg-fix-panel")?.remove();
    document.getElementById("rg-sugg-panel")?.remove();
    document.getElementById("rg-rename-notif")?.remove();
    document.getElementById("rg-unmatched-panel")?.remove();
    setSpData(null);
    document.getElementById("rg-check-btn")?.classList.remove("visible");
    document.getElementById("rg-strip-btn")?.classList.remove("visible");
    document.getElementById("rg-suggest-btn")?.classList.remove("visible", "has-suggestions");
    document.getElementById("rg-unmatched-btn")?.classList.remove("visible", "has-unmatched");

    const m = location.pathname.match(/^\/series\/([^/]+)/);
    if (!m) return;

    try {
        const allSeries = await apiReq("GET", "/api/v3/series");
        const series = allSeries.find(s => s.titleSlug === m[1]);
        if (!series) return;

        const [files, episodes] = await Promise.all([
            apiReq("GET", `/api/v3/episodefile?seriesId=${series.id}`),
            apiReq("GET", `/api/v3/episode?seriesId=${series.id}`),
        ]);

        // Build epMap: fileId → episode[] (sorted by season+ep)
        // Multi-episode files (e.g. S01E117-E119) share the same episodeFileId;
        // using an array keeps all episodes so we can display ranges correctly.
        const epMap = new Map();
        episodes.filter(e => e.episodeFileId).forEach(e => {
            const arr = epMap.get(e.episodeFileId);
            if (arr) arr.push(e);
            else epMap.set(e.episodeFileId, [e]);
        });
        epMap.forEach(arr => arr.sort((a, b) =>
            a.seasonNumber !== b.seasonNumber
                ? a.seasonNumber - b.seasonNumber
                : a.episodeNumber - b.episodeNumber));

        // Cache data for per-episode edit buttons
        setSpData({ series, files, epMap });
        document.getElementById("rg-check-btn")?.classList.add("visible");
        document.getElementById("rg-strip-btn")?.classList.add("visible");
        document.getElementById("rg-suggest-btn")?.classList.add("visible");
        // rg-unmatched-btn is shown by checkUnmatchedFiles() only when files are found
        injectEpEditBtns();
        checkUnmatchedFiles(); // fire-and-forget; shows button + badge when files found

        const affected = files
            .filter(f => prefixAlreadyInFilename(f))
            .map(f => ({
                ...f,
                ep: epMap.get(f.id) ?? [],
                newReleaseGroup: (f.releaseGroup || "").replace(RG_PREFIX_RE, ""),
            }))
            .sort((a, b) => {
                const ae = firstEp(a.ep), be = firstEp(b.ep);
                const ds = (ae?.seasonNumber ?? 0) - (be?.seasonNumber ?? 0);
                return ds !== 0 ? ds : (ae?.episodeNumber ?? 0) - (be?.episodeNumber ?? 0);
            });

        // ── RG Suggestion: compute BEFORE prefix-fix check so we can suppress
        //    the rename notification when the suggestion panel is going to open.
        const suggCandidates = _buildSuggCandidates(files, epMap, series);

        if (affected.length > 0) {
            buildFixUI(series, affected);
        } else if (suggCandidates.length === 0) {
            // No prefix-fix AND no suggestion candidates →
            // show rename notification if anything needs renaming
            checkRenameMismatch(series);
        }
        // When suggestion panel is open, rename notification is suppressed here;
        // it will be shown automatically after the user applies the suggestion.

        if (suggCandidates.length > 0) {
            const suggBtn = document.getElementById("rg-suggest-btn");
            if (suggBtn) {
                suggBtn.classList.add("has-suggestions");
                suggBtn.title = `${suggCandidates.length} file(s) may need Release Group — click to suggest`;
            }
            buildRGSuggestionUI(series, suggCandidates);
        }

    } catch (e) { console.warn("[RG Fix]", e.message); }
}

export function watchNavigation() {
    const check = () => {
        if (/^\/series\/[^/]+/.test(location.pathname)) {
            clearTimeout(watchNavigation._t);
            watchNavigation._t = setTimeout(checkSeriesPage, 600);
        } else {
            document.getElementById("rg-fix-panel")?.remove();
            document.getElementById("rg-sugg-panel")?.remove();
            document.getElementById("rg-unmatched-panel")?.remove();
            document.getElementById("rg-suggest-btn")?.classList.remove("visible", "has-suggestions");
            document.getElementById("rg-unmatched-btn")?.classList.remove("visible", "has-unmatched");
        }
    };
    const orig = history.pushState;
    history.pushState = function (...a) { orig.apply(this, a); check(); };
    window.addEventListener("popstate", check);
    check();
}
