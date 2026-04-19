import { NETWORKS, EDITIONS, APIKEY_KEY, LANG_PINNED, LANG_STATS_KEY, LANGS } from "./constants.js";
import { loadLangStats } from "./lang.js";

// ── Settings dashboard ────────────────────────────────────────────────────────

const SETTINGS_KEY = `rg_settings_${location.hostname}`;

export function loadSettings() {
    try { return JSON.parse(GM_getValue(SETTINGS_KEY, "{}")); } catch { return {}; }
}

export function saveSettings(obj) { GM_setValue(SETTINGS_KEY, JSON.stringify(obj)); }

// Apply saved custom networks on startup (runs after NETWORKS const is set)
export function applySavedNetworks() {
    (loadSettings().customNetworks ?? []).forEach(n => {
        if (!NETWORKS.find(x => x.value === n)) NETWORKS.push({ label: n, value: n });
    });
}

// The QUALITIES list is used inside the settings panel (Quality tab)
const QUALITIES = [
    { label: "WEBDL-1080p", name: "WEBDL-1080p" },
    { label: "WEBDL-720p", name: "WEBDL-720p" },
    { label: "WEBDL-2160p", name: "WEBDL-2160p" },
    { label: "WEBRip-1080p", name: "WEBRip-1080p" },
    { label: "WEBRip-720p", name: "WEBRip-720p" },
    { label: "Bluray-1080p", name: "Bluray-1080p" },
    { label: "Bluray-720p", name: "Bluray-720p" },
    { label: "Bluray-2160p", name: "Bluray-2160p" },
    { label: "HDTV-1080p", name: "HDTV-1080p" },
    { label: "HDTV-720p", name: "HDTV-720p" },
    { label: "SDTV", name: "SDTV" },
];

export function buildSettingsPanel() {
    document.getElementById("rg-settings-panel")?.remove();
    const panel    = document.createElement("div");
    panel.id       = "rg-settings-panel";
    const settings = loadSettings();
    const customNets = settings.customNetworks   ?? [];
    const disabledQ  = settings.disabledQualities ?? [];

    panel.innerHTML = `
        <div class="rgs-head">⚙ Script Settings <span class="rgs-close">✕</span></div>
        <div class="rgs-tabs">
            <div class="rgs-tab active" data-tab="networks">Networks</div>
            <div class="rgs-tab" data-tab="quality">Quality</div>
            <div class="rgs-tab" data-tab="api">API Key</div>
        </div>
        <div class="rgs-body" id="rgs-body"></div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));
    panel.querySelector(".rgs-close").addEventListener("click", () => panel.classList.remove("open"));

    const tabs = [...panel.querySelectorAll(".rgs-tab")];
    tabs.forEach(t => t.addEventListener("click", () => {
        tabs.forEach(x => x.classList.toggle("active", x === t));
        renderTab(t.dataset.tab);
    }));

    function renderTab(name) {
        const body = panel.querySelector("#rgs-body");
        body.innerHTML = "";

        if (name === "networks") {
            // Default networks (read-only display)
            const defSec = document.createElement("div");
            defSec.className = "rgs-section";
            defSec.innerHTML = `<div class="rgs-section-label">Default Networks</div>
                <div class="rgs-pills-wrap">${
                    NETWORKS.filter(n => !customNets.includes(n.value))
                        .map(n => `<span class="rgs-pill active" style="cursor:default">${n.label}</span>`).join("")
                }</div>`;
            body.appendChild(defSec);

            // Custom networks (editable)
            const custSec = document.createElement("div");
            custSec.className = "rgs-section";

            function renderCustom() {
                custSec.innerHTML = `<div class="rgs-section-label">Custom Networks</div>
                    <div class="rgs-desc">Added networks appear in the Release Group picker.</div>`;
                const wrap = document.createElement("div"); wrap.className = "rgs-pills-wrap";
                customNets.forEach((n, i) => {
                    const pill = document.createElement("span"); pill.className = "rgs-pill active";
                    pill.innerHTML = `${n} <span class="rgs-x">×</span>`;
                    pill.querySelector(".rgs-x").addEventListener("click", () => {
                        customNets.splice(i, 1);
                        settings.customNetworks = customNets;
                        saveSettings(settings);
                        const ni = NETWORKS.findIndex(x => x.value === n);
                        if (ni !== -1) NETWORKS.splice(ni, 1);
                        renderCustom();
                    });
                    wrap.appendChild(pill);
                });
                custSec.appendChild(wrap);
                const addRow = document.createElement("div"); addRow.className = "rgs-add-row";
                addRow.innerHTML = `<input class="rgs-input" id="rgs-net-in" placeholder="e.g. Peacock">
                                    <button class="rgs-add-btn">Add</button>`;
                addRow.querySelector(".rgs-add-btn").addEventListener("click", () => {
                    const inp = addRow.querySelector("#rgs-net-in");
                    const val = inp.value.trim();
                    if (!val || NETWORKS.find(x => x.label === val || x.value === val)) return;
                    customNets.push(val);
                    settings.customNetworks = customNets;
                    saveSettings(settings);
                    NETWORKS.push({ label: val, value: val });
                    inp.value = "";
                    renderCustom();
                });
                custSec.appendChild(addRow);
            }
            renderCustom();
            body.appendChild(custSec);
        }

        if (name === "quality") {
            const sec = document.createElement("div"); sec.className = "rgs-section";
            sec.innerHTML = `<div class="rgs-section-label">Quality Shortcut Pills</div>
                <div class="rgs-desc">Toggle which qualities appear as quick-select pills in the Quality modal.</div>`;
            const wrap = document.createElement("div"); wrap.className = "rgs-pills-wrap";
            QUALITIES.forEach(q => {
                const on   = !disabledQ.includes(q.name);
                const pill = document.createElement("span");
                pill.className = `rgs-pill${on ? " active" : ""}`;
                pill.textContent = q.label;
                pill.addEventListener("click", () => {
                    const i = disabledQ.indexOf(q.name);
                    if (i === -1) { disabledQ.push(q.name); pill.classList.remove("active"); }
                    else          { disabledQ.splice(i, 1); pill.classList.add("active"); }
                    settings.disabledQualities = disabledQ;
                    saveSettings(settings);
                });
                wrap.appendChild(pill);
            });
            sec.appendChild(wrap);
            body.appendChild(sec);
        }

        if (name === "api") {
            // API Key section
            const sec = document.createElement("div"); sec.className = "rgs-section";
            const key = GM_getValue(APIKEY_KEY, "");
            sec.innerHTML = `<div class="rgs-section-label">API Key — ${location.hostname}</div>
                <div class="rgs-desc">Auto-prompted when missing. Required for series-page features.</div>
                <div class="rgs-key-box">${key ? key.slice(0, 8) + "••••••••••••••••••••••••" : "(not set)"}</div>
                <button class="rgs-small-btn" id="rgs-reset-key">Clear &amp; Reset</button>`;
            sec.querySelector("#rgs-reset-key").addEventListener("click", () => {
                GM_setValue(APIKEY_KEY, "");
                sec.querySelector(".rgs-key-box").textContent = "(cleared — will prompt on next use)";
            });
            body.appendChild(sec);

            // Language usage stats section
            const statSec = document.createElement("div"); statSec.className = "rgs-section";
            function renderLangStats() {
                const s = loadLangStats();
                const sorted = Object.entries(s)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12); // show top 12
                const rows = sorted.length
                    ? sorted.map(([code, count]) => {
                        const label = LANGS.find(l => l.value === code)?.label ?? code;
                        const pinned = LANG_PINNED.includes(code) ? " 📌" : "";
                        return `<span class="rgs-pill active" style="cursor:default">
                                    ${label} (${code})${pinned}
                                    <span style="color:#89b;font-size:10px;margin-left:3px">×${count}</span>
                                </span>`;
                    }).join("")
                    : `<span style="color:#456;font-size:11px">No usage data yet.</span>`;
                statSec.innerHTML = `
                    <div class="rgs-section-label">Language Usage Stats</div>
                    <div class="rgs-desc">Languages are sorted by usage in the picker. TH &amp; EN always appear first.</div>
                    <div class="rgs-pills-wrap" style="margin-bottom:8px">${rows}</div>
                    <button class="rgs-small-btn" id="rgs-reset-stats">Reset Stats</button>`;
                statSec.querySelector("#rgs-reset-stats")?.addEventListener("click", () => {
                    GM_setValue(LANG_STATS_KEY, "{}");
                    renderLangStats();
                });
            }
            renderLangStats();
            body.appendChild(statSec);
        }
    }

    renderTab("networks");
}

export function openSettings() {
    const p = document.getElementById("rg-settings-panel");
    if (p?.classList.contains("open")) p.classList.remove("open");
    else buildSettingsPanel();
}
