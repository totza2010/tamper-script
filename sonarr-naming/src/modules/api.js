import { APIKEY_KEY } from "./constants.js";

// ── Sonarr API (used by series-page fix feature) ──────────────────────────────

export async function apiReq(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const key = GM_getValue(APIKEY_KEY, "");
    if (key) headers["X-Api-Key"] = key;
    const opts = { method, credentials: "include", headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res = await fetch(path, opts);
    if (res.status === 401) {
        const newKey = window.prompt("Sonarr API Key (Settings → General → API Key):");
        if (!newKey) throw new Error("API key required");
        GM_setValue(APIKEY_KEY, newKey);
        headers["X-Api-Key"] = newKey;
        res = await fetch(path, { ...opts, headers });
    }
    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
    }
    return method === "DELETE" ? null : res.json();
}

/**
 * Poll GET /api/v3/command/{id} until the command reaches a terminal state.
 *
 * @param {number}   cmdId      - command ID returned by the POST /api/v3/command response
 * @param {function} [onStatus] - optional callback(statusText) called on each poll tick
 * @param {number}   [maxMs]    - give up after this many ms (default 5 minutes)
 * @returns {Promise<object>}   - the final command object
 * @throws  if the command failed/aborted or timed out
 */
export async function waitForCommand(cmdId, onStatus, maxMs = 300_000) {
    const INTERVAL  = 2000;
    const deadline  = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const cmd = await apiReq("GET", `/api/v3/command/${cmdId}`);
        if (onStatus) onStatus(cmd.status);
        if (cmd.status === "completed") return cmd;
        if (cmd.status === "failed" || cmd.status === "aborted") {
            throw new Error(`Rename command ${cmd.status}: ${cmd.message || ""}`);
        }
        await new Promise(r => setTimeout(r, INTERVAL));
    }
    throw new Error("Rename command timed out");
}

/**
 * Poll GET /api/v3/episodefile/{id} until its releaseGroup matches expectedRG.
 * Used to confirm Sonarr has committed the DB write before issuing a rename.
 *
 * @param {number} fileId      - episode file ID
 * @param {string} expectedRG  - the Release Group string we just PUT
 * @param {number} [maxMs]     - give up after this many ms (default 10 s)
 * @returns {Promise<void>}    - resolves when matched (or silently times out)
 */
export async function waitForFileUpdate(fileId, expectedRG, maxMs = 10_000) {
    const INTERVAL = 800;
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        try {
            const f = await apiReq("GET", `/api/v3/episodefile/${fileId}`);
            if (f.releaseGroup === expectedRG) return;
        } catch (_) { /* ignore transient errors */ }
        await new Promise(r => setTimeout(r, INTERVAL));
    }
    // Timed out — continue anyway; the rename will still work in most cases
}
