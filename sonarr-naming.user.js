// ==UserScript==
// @name         Sonarr Release Group
// @namespace    http://tampermonkey.net/
// @version      8.8
// @description  Release Group picker + Series page auto-fix [network]- prefix
// @match        https://sonarr-hd.privox.top/*
// @match        https://sonarr-uhd.privox.top/*
// @match        https://sonarr-ai.privox.top/*
// @match        https://sonarr-edition.privox.top/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

/**
 * Naming format:
 *   S{season:00}E{episode:00}{ - Episode CleanTitle:90} - {[Quality Full]}{[Custom Formats]}{-Release Group}
 *
 * IMPORT mode  → [TrueID]-AudioTHZHSubTHENZH
 *   Sonarr CF matches "TrueID" in Release Group
 *
 * RENAME mode  → AudioTHZHSubTHENZH   (deselect network)
 *   {[Custom Formats]} = [TrueID]  (recorded)
 *   {-Release Group}  = -AudioTHZHSubTHENZH
 */

(function () {
    "use strict";

    // Series page data cache (populated by checkSeriesPage, used by injectEpEditBtns)
    let _spData = null;

    // ══════════════════════════════════════════════════════════════════════════
    //  DATA
    // ══════════════════════════════════════════════════════════════════════════

    const NETWORKS = [
        { label: "Netflix", value: "Netflix" },
        { label: "HBO", value: "HBO" },
        { label: "iQIYI", value: "iQIYI" },
        { label: "TrueID", value: "TrueID" },
        { label: "Viu", value: "Viu" },
        { label: "WeTV", value: "WeTV" },
        { label: "NANA", value: "NANA" },
        { label: "Disney+", value: "Disney" },
        { label: "Amazon", value: "Amazon" },
        { label: "Apple TV+", value: "AppleTV" },
        { label: "Crunchyroll", value: "Crunchyroll" },
        { label: "Bilibili", value: "Bilibili" },
        { label: "Paramount+", value: "Paramount" },
    ];

    const EDITIONS = [
        { label: "Uncensored", value: "Uncensored" },
        { label: "Uncut", value: "Uncut" },
        { label: "Unrated", value: "Unrated" },
        { label: "Extended", value: "Extended" },
        { label: "Director's Cut", value: "DirectorsCut" },
        { label: "Theatrical", value: "Theatrical" },
        { label: "Remastered", value: "Remastered" },
        { label: "Collector's", value: "Collectors" },
    ];

    const LANGS = [
        { label: "Thai", value: "TH" },
        { label: "English", value: "EN" },
        { label: "Chinese", value: "ZH" },
        { label: "Japanese", value: "JA" },
        { label: "Korean", value: "KO" },
        { label: "Spanish", value: "ES" },
        { label: "Arabic", value: "AR" },
        { label: "Bulgarian", value: "BG" },
        { label: "Catalan", value: "CA" },
        { label: "Czech", value: "CS" },
        { label: "Danish", value: "DA" },
        { label: "German", value: "DE" },
        { label: "Greek", value: "EL" },
        { label: "Estonian", value: "ET" },
        { label: "Finnish", value: "FI" },
        { label: "French", value: "FR" },
        { label: "Hebrew", value: "HE" },
        { label: "Hindi", value: "HI" },
        { label: "Croatian", value: "HR" },
        { label: "Hungarian", value: "HU" },
        { label: "Indonesian", value: "ID" },
        { label: "Italian", value: "IT" },
        { label: "Lithuanian", value: "LT" },
        { label: "Latvian", value: "LV" },
        { label: "Dutch", value: "NL" },
        { label: "Norwegian", value: "NO" },
        { label: "Polish", value: "PL" },
        { label: "Portuguese", value: "PT" },
        { label: "Romanian", value: "RO" },
        { label: "Russian", value: "RU" },
        { label: "Slovak", value: "SK" },
        { label: "Slovenian", value: "SL" },
        { label: "Serbian", value: "SR" },
        { label: "Swedish", value: "SV" },
        { label: "Turkish", value: "TR" },
        { label: "Ukrainian", value: "UK" },
        { label: "Vietnamese", value: "VI" },
    ];

    const MAX_LANG = 4;

    // ══════════════════════════════════════════════════════════════════════════
    //  STYLES
    // ══════════════════════════════════════════════════════════════════════════

    document.head.insertAdjacentHTML("beforeend", `<style>
/* ── Layout ──────────────────────────────────────────────────────────────── */
#rg-container .rg-row {
    display: flex;
    align-items: flex-start;
    margin-bottom: 13px;
}
#rg-container .rg-label {
    flex: 0 0 250px;
    display: flex;
    justify-content: flex-end;
    margin-right: 20px;
    padding-top: 7px;
    font-weight: bold;
    text-align: end;
}
#rg-container .rg-right {
    flex: 1;
    min-width: 0;
}
#rg-container .rg-dual {
    display: flex;
    gap: 10px;
}
#rg-container .rg-dual > * { flex: 1; min-width: 0; }

/* ── Pill base ────────────────────────────────────────────────────────────── */
.rg-pills { display: flex; flex-wrap: wrap; gap: 5px; }

.rg-pill {
    padding: 4px 12px;
    border-radius: 14px;
    border: 1px solid #3a3a55;
    background: transparent;
    color: #888;
    cursor: pointer;
    font-size: 12px;
    user-select: none;
    transition: background .14s, border-color .14s, color .14s;
    white-space: nowrap;
}
.rg-pill:hover { border-color: #666; color: #bbb; }

/* Network — green */
.rg-pill.net.active  { background:#1a3a10; border-color:#5c5; color:#7e7; font-weight:bold; }

/* Edition — amber */
.rg-pill.edt.active  { background:#2a2000; border-color:#b80; color:#eb0; font-weight:bold; }

/* ── Language picker ──────────────────────────────────────────────────────── */
.rg-lang-col-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #567;
    margin-bottom: 5px;
}

/* Selected chips row */
.rg-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
    min-height: 30px;
}
.rg-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px 3px 12px;
    border-radius: 14px;
    background: #0d3d58;
    border: 1px solid #4cc;
    color: #4ef;
    font-size: 12px;
    font-weight: bold;
}
.rg-chip-x {
    cursor: pointer;
    color: #789;
    font-size: 13px;
    line-height: 1;
    padding: 0 1px;
    transition: color .12s;
}
.rg-chip-x:hover { color: #f88; }

.rg-add-btn {
    padding: 3px 11px;
    border-radius: 14px;
    border: 1px dashed #4a4a66;
    color: #667;
    cursor: pointer;
    font-size: 12px;
    user-select: none;
    transition: all .14s;
}
.rg-add-btn:hover { border-color: #4cc; color: #9bb; }

/* Expandable search panel */
.rg-lang-panel {
    margin-top: 7px;
    padding: 8px;
    background: #12121e;
    border: 1px solid #2a2a40;
    border-radius: 8px;
    display: none;
}
.rg-lang-panel.open { display: block; }

.rg-lang-search {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 9px;
    background: #1a1a2e;
    border: 1px solid #3a3a55;
    border-radius: 6px;
    color: #ddd;
    font-size: 12px;
    margin-bottom: 7px;
    outline: none;
}
.rg-lang-search:focus { border-color: #4cc; }

.rg-lang-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 130px;
    overflow-y: auto;
}
.rg-lang-option {
    padding: 3px 10px;
    border-radius: 12px;
    border: 1px solid #3a3a55;
    background: transparent;
    color: #889;
    cursor: pointer;
    font-size: 12px;
    user-select: none;
    transition: all .12s;
}
.rg-lang-option:hover   { border-color: #4cc; color: #cce; }
.rg-lang-option.chosen  { display: none; }
.rg-lang-option.hidden  { display: none; }

/* ── Preview ──────────────────────────────────────────────────────────────── */
#rg-preview {
    padding: 6px 11px;
    border-radius: 6px;
    background: #111;
    border: 1px solid #222;
    font-size: 12px;
    font-family: monospace;
    color: #6b6;
    word-break: break-all;
    min-height: 28px;
}
#rg-preview.has-network { color: #fa0; }
#rg-preview.empty       { color: #444; font-style: italic; }
</style>`);

    // ══════════════════════════════════════════════════════════════════════════
    //  REACT SETTER
    // ══════════════════════════════════════════════════════════════════════════

    function setReactValue(input, value) {
        const nativeSet = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
        ).set;
        nativeSet.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SINGLE-SELECT PILLS  (Network / Edition)
    // ══════════════════════════════════════════════════════════════════════════

    function makeSinglePills(items, extraClass, activeValue, onChange) {
        const wrap = document.createElement("div");
        wrap.className = "rg-pills";

        items.forEach(item => {
            const p = document.createElement("div");
            p.className = `rg-pill ${extraClass}`;
            p.textContent = item.label;
            p.dataset.value = item.value;
            if (item.value === activeValue) p.classList.add("active");
            p.addEventListener("click", () => {
                const was = p.classList.contains("active");
                wrap.querySelectorAll(".rg-pill").forEach(x => x.classList.remove("active"));
                if (!was) p.classList.add("active");
                onChange();
            });
            wrap.appendChild(p);
        });

        const get = () => wrap.querySelector(".rg-pill.active")?.dataset.value ?? null;
        return { el: wrap, get };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  LANGUAGE PICKER  (searchable inline, no dropdown)
    // ══════════════════════════════════════════════════════════════════════════

    function makeLangPicker(colLabel, initCodes, onChange) {
        const selected = [...initCodes]; // ordered array of selected codes

        const root = document.createElement("div");

        // Column label
        const lbl = document.createElement("div");
        lbl.className = "rg-lang-col-label";
        lbl.textContent = colLabel;
        root.appendChild(lbl);

        // Chips row
        const chipsRow = document.createElement("div");
        chipsRow.className = "rg-chips";

        const addBtn = document.createElement("div");
        addBtn.className = "rg-add-btn";
        addBtn.textContent = "+ Add";
        chipsRow.appendChild(addBtn);
        root.appendChild(chipsRow);

        // Search panel
        const panel = document.createElement("div");
        panel.className = "rg-lang-panel";

        const searchInput = document.createElement("input");
        searchInput.className = "rg-lang-search";
        searchInput.type = "text";
        searchInput.placeholder = "Search language…";
        panel.appendChild(searchInput);

        const grid = document.createElement("div");
        grid.className = "rg-lang-grid";
        LANGS.forEach(lang => {
            const opt = document.createElement("div");
            opt.className = "rg-lang-option";
            opt.textContent = `${lang.label} (${lang.value})`;
            opt.dataset.value = lang.value;
            opt.dataset.label = lang.label.toLowerCase();
            if (selected.includes(lang.value)) opt.classList.add("chosen");
            opt.addEventListener("click", () => {
                if (selected.length >= MAX_LANG) return;
                if (selected.includes(lang.value)) return;
                selected.push(lang.value);
                opt.classList.add("chosen");
                renderChips();
                onChange();
                if (selected.length >= MAX_LANG) closePanel();
            });
            grid.appendChild(opt);
        });
        panel.appendChild(grid);
        root.appendChild(panel);

        // Search filter
        searchInput.addEventListener("input", () => {
            const q = searchInput.value.toLowerCase();
            grid.querySelectorAll(".rg-lang-option").forEach(opt => {
                const match = opt.dataset.label.includes(q) ||
                    opt.dataset.value.toLowerCase().includes(q);
                opt.classList.toggle("hidden", !match);
            });
        });

        // Toggle panel
        let panelOpen = false;
        function openPanel() { panelOpen = true; panel.classList.add("open"); searchInput.value = ""; filterAll(); searchInput.focus(); }
        function closePanel() { panelOpen = false; panel.classList.remove("open"); }
        function filterAll() { grid.querySelectorAll(".rg-lang-option").forEach(o => o.classList.remove("hidden")); }

        addBtn.addEventListener("click", () => panelOpen ? closePanel() : openPanel());

        // Close panel on outside click
        document.addEventListener("click", e => {
            if (panelOpen && !root.contains(e.target)) closePanel();
        }, true);

        // Render chips
        function renderChips() {
            // Remove all chips (keep addBtn)
            [...chipsRow.children].forEach(c => { if (c !== addBtn) c.remove(); });

            selected.forEach(code => {
                const lang = LANGS.find(l => l.value === code);
                if (!lang) return;

                const chip = document.createElement("div");
                chip.className = "rg-chip";
                chip.innerHTML = `${lang.label} <span class="rg-chip-x" data-code="${code}">×</span>`;
                chip.querySelector(".rg-chip-x").addEventListener("click", () => {
                    const idx = selected.indexOf(code);
                    if (idx !== -1) selected.splice(idx, 1);
                    // Un-mark in grid
                    grid.querySelector(`[data-value="${code}"]`)?.classList.remove("chosen");
                    renderChips();
                    onChange();
                });
                chipsRow.insertBefore(chip, addBtn);
            });

            // Hide add btn when at max
            addBtn.style.display = selected.length >= MAX_LANG ? "none" : "";
        }

        renderChips();

        const get = () => [...selected];
        return { el: root, get };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PARSE existing Release Group
    // ══════════════════════════════════════════════════════════════════════════

    function parseRG(raw) {
        // e.g. "[TrueID]-AudioTHZHSubTHENZH"  or  "[TrueID][Extended]-AudioTH..."
        const netMatch = raw.match(/^\[([^\]]+)\]/);
        const edtMatch = raw.match(/\]\[([^\]]+)\]-/) || raw.match(/^\[([^\]]+)\]-/);
        // More robust parse:
        const brackets = [...raw.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
        const dashIdx = raw.indexOf("]-");
        const body = dashIdx !== -1 ? raw.slice(dashIdx + 2) : raw;

        const audioM = body.match(/Audio([A-Z]{2}(?:[A-Z]{2})*)/);
        const subM = body.match(/Sub([A-Z]{2}(?:[A-Z]{2})*)/);

        // Identify which bracket is network vs edition
        let network = null, edition = null;
        brackets.forEach(b => {
            if (NETWORKS.find(n => n.value === b || n.label === b)) network = b;
            else if (EDITIONS.find(e => e.value === b || e.label === b)) edition = b;
        });

        return {
            network,
            edition,
            audioCodes: audioM ? (audioM[1].match(/.{2}/g) ?? []) : [],
            subCodes: subM ? (subM[1].match(/.{2}/g) ?? []) : [],
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  BUILD OUTPUT STRING
    // ══════════════════════════════════════════════════════════════════════════

    function buildValue(network, edition, audioCodes, subCodes) {
        const prefix = [network, edition].filter(Boolean).map(v => `[${v}]`).join("");
        const parts = [];
        if (audioCodes.length) parts.push(`Audio${audioCodes.join("")}`);
        if (subCodes.length) parts.push(`Sub${subCodes.join("")}`);
        const lang = parts.join("");
        if (!prefix && !lang) return "";
        if (!prefix) return lang;
        return `${prefix}-${lang}`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  INJECT
    // ══════════════════════════════════════════════════════════════════════════

    function makeRow(labelText, rightEl) {
        const row = document.createElement("div");
        row.className = "rg-row";
        const lbl = document.createElement("div");
        lbl.className = "rg-label"; lbl.textContent = labelText;
        const right = document.createElement("div");
        right.className = "rg-right"; right.appendChild(rightEl);
        row.append(lbl, right);
        return row;
    }

    function inject(target) {
        if (target.dataset.rgInjected) return;
        target.dataset.rgInjected = "true";

        const releaseInput = document.querySelector("input[name='releaseGroup']");
        if (!releaseInput) return;

        const parsed = parseRG(releaseInput.value);
        const container = document.createElement("div");
        container.id = "rg-container";

        // Network
        const netComp = makeSinglePills(NETWORKS, "net", parsed.network, sync);
        container.appendChild(makeRow("Network", netComp.el));

        // Edition
        const edtComp = makeSinglePills(EDITIONS, "edt", parsed.edition, sync);
        container.appendChild(makeRow("Edition", edtComp.el));

        // Language (Audio + Sub)
        const audioComp = makeLangPicker("Audio", parsed.audioCodes, sync);
        const subComp = makeLangPicker("Subtitle", parsed.subCodes, sync);
        const dual = document.createElement("div");
        dual.className = "rg-dual";
        dual.append(audioComp.el, subComp.el);
        container.appendChild(makeRow("Language", dual));

        // Preview
        const preview = document.createElement("div");
        preview.id = "rg-preview";
        container.appendChild(makeRow("Preview", preview));

        target.prepend(container);

        // Sync
        function sync() {
            const net = netComp.get();
            const edt = edtComp.get();
            const audio = audioComp.get();
            const sub = subComp.get();
            const value = buildValue(net, edt, audio, sub);

            preview.textContent = value || "—";
            preview.className = !value ? "empty" : net || edt ? "has-network" : "";

            setReactValue(releaseInput, value);
        }

        sync();
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  IMPORT MODAL SHORTCUTS
    //  Adds quick-action buttons to the Interactive Import footer so the user
    //  doesn't have to open the "Select..." dropdown every time.
    // ══════════════════════════════════════════════════════════════════════════

    document.head.insertAdjacentHTML("beforeend", `<style>
/* Quick-action toolbar */
#ii-shortcuts {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
}
.ii-btn {
    padding: 6px 13px;
    border-radius: 14px;
    border: 1px solid #3a3a55;
    background: #1a1a2e;
    color: #99a;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    transition: all .14s;
    white-space: nowrap;
}
.ii-btn:hover        { border-color: #4cc; color: #cce; background: #12122a; }
.ii-btn.ii-rg        { border-color: #4a6; color: #7c7; }
.ii-btn.ii-rg:hover  { border-color: #6d6; color: #9e9; background: #101a10; }
.ii-btn.ii-q         { border-color: #66a; color: #99c; }
.ii-btn.ii-q:hover   { border-color: #99d; color: #bbd; background: #12121e; }
.ii-btn.ii-lang      { border-color: #a66; color: #c99; }
.ii-btn.ii-lang:hover{ border-color: #d88; color: #daa; background: #1e1010; }
.ii-divider {
    width: 1px; height: 20px;
    background: #2a2a40;
    margin: 0 2px;
}
</style>`);

    function triggerBulkSelect(value) {
        const sel = document.querySelector("select[name='select']");
        if (!sel) return;
        // Use React's native setter so React state picks up the change
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, "value"
        ).set;
        nativeSetter.call(sel, value);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function injectImportShortcuts(footer) {
        if (footer.dataset.iiAdded) return;
        footer.dataset.iiAdded = "true";

        const leftArea = footer.querySelector("[class*='leftButtons']");
        if (!leftArea) return;

        const bar = document.createElement("div");
        bar.id = "ii-shortcuts";

        const buttons = [
            { label: "🏷 Release Group", cls: "ii-rg", action: "releaseGroup" },
            { label: "🎬 Quality", cls: "ii-q", action: "quality" },
            { label: "🌐 Language", cls: "ii-lang", action: "language" },
        ];

        buttons.forEach((def, i) => {
            if (i > 0) {
                const div = document.createElement("div");
                div.className = "ii-divider";
                bar.appendChild(div);
            }
            const btn = document.createElement("div");
            btn.className = `ii-btn ${def.cls}`;
            btn.textContent = def.label;
            btn.addEventListener("click", () => triggerBulkSelect(def.action));
            bar.appendChild(btn);
        });

        // Insert before the existing select dropdown
        const existingSelect = leftArea.querySelector("select");
        leftArea.insertBefore(bar, existingSelect);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SELECT QUALITY MODAL — pill shortcuts
    // ══════════════════════════════════════════════════════════════════════════

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

    document.head.insertAdjacentHTML("beforeend", `<style>
#sq-pills-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid #e0e0e0;
}
.sq-pill {
    padding: 5px 13px;
    border-radius: 14px;
    border: 1px solid #ccc;
    background: #f4f4f4;
    color: #444;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    transition: all .14s;
    white-space: nowrap;
}
.sq-pill:hover  { border-color: #4a8; background: #eaf4ee; color: #2a6; }
.sq-pill.active { border-color: #4a8; background: #d4edda; color: #195; font-weight: bold; }
</style>`);

    /** Click Sonarr's EnhancedSelectInput and pick the option matching `qualityName` */
    function pickQuality(qualityName) {
        const btn = document.querySelector("[class*='EnhancedSelectInput-enhancedSelect']");
        if (!btn) return;

        return new Promise(resolve => {
            // Watch for dropdown items to appear in DOM, then click the matching one
            const obs = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;

                        // Search all leaf text nodes inside the added subtree
                        const candidates = [node, ...node.querySelectorAll("*")];
                        for (const el of candidates) {
                            if (el.textContent.trim() === qualityName &&
                                el.children.length === 0) {
                                // Click the clickable ancestor (Sonarr wraps text in a container)
                                const target = el.closest("[class*='Option']") ||
                                    el.closest("[class*='Item']") ||
                                    el.parentElement;
                                target?.click();
                                obs.disconnect();
                                resolve();
                                return;
                            }
                        }
                    }
                }
            });

            obs.observe(document.body, { childList: true, subtree: true });

            // Timeout safety: close dropdown if nothing matched within 2 s
            setTimeout(() => { obs.disconnect(); resolve(); }, 2000);

            btn.click(); // open the dropdown
        });
    }

    function injectQualityPills(modalBody) {
        if (modalBody.dataset.sqAdded) return;

        // Wait until the Quality FormGroup is actually rendered before proceeding
        const qualityGroup = [...modalBody.querySelectorAll("[class*='FormGroup-group']")]
            .find(g => g.querySelector("label")?.textContent.trim() === "Quality");
        if (!qualityGroup) return; // not ready yet — don't set flag, retry on next mutation

        modalBody.dataset.sqAdded = "true"; // set only after content confirmed present

        // Determine currently selected quality from the button text
        const getSelected = () =>
            modalBody.querySelector("[class*='HintedSelectInputSelectedValue-valueText']")
                ?.textContent.trim() ?? "";

        const wrap = document.createElement("div");
        wrap.id = "sq-pills-wrap";

        QUALITIES.forEach(q => {
            const pill = document.createElement("div");
            pill.className = "sq-pill";
            pill.textContent = q.label;
            if (q.name === getSelected()) pill.classList.add("active");

            pill.addEventListener("click", async () => {
                wrap.querySelectorAll(".sq-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                await pickQuality(q.name);
            });
            wrap.appendChild(pill);
        });

        // Insert pills above the Quality FormGroup
        qualityGroup.parentNode.insertBefore(wrap, qualityGroup);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SONARR API  (used by series-page fix feature)
    // ══════════════════════════════════════════════════════════════════════════

    const APIKEY_KEY = `sonarr_apikey_${location.hostname}`;

    async function apiReq(method, path, body) {
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

    // ══════════════════════════════════════════════════════════════════════════
    //  STYLES — per-episode editor · rename notification · settings panel
    // ══════════════════════════════════════════════════════════════════════════

    document.head.insertAdjacentHTML("beforeend", `<style>
/* ── Per-episode edit button ─────────────────────────────────────────────── */
.ep-rg-edit-btn {
    margin-left: 5px; padding: 0 5px; border-radius: 4px;
    border: 1px solid #3a3a55; background: transparent; color: #567;
    cursor: pointer; font-size: 11px; vertical-align: middle;
    transition: all .14s; line-height: 1.6; display: inline-block;
}
.ep-rg-edit-btn:hover { border-color: #4cc; color: #4cc; background: #0d1a2a; }

/* ── Per-episode RG popup ────────────────────────────────────────────────── */
#ep-rg-popup {
    position: fixed; z-index: 10002;
    background: #1a1a2e; border: 1px solid #3a3a55; border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,.75);
    padding: 14px; width: 420px; max-height: 82vh; overflow-y: auto;
    font-family: sans-serif; font-size: 13px; color: #e0e0e0;
}
.ep-pop-head {
    font-weight: bold; color: #4cc; margin-bottom: 10px;
    display: flex; justify-content: space-between; align-items: center;
}
.ep-pop-close { cursor: pointer; color: #789; font-size: 16px; }
.ep-pop-row { margin-bottom: 10px; }
.ep-pop-lbl {
    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    color: #567; margin-bottom: 5px;
}
.ep-pop-preview {
    padding: 5px 10px; border-radius: 5px;
    background: #111; border: 1px solid #222;
    font-family: monospace; font-size: 11px; color: #6b6;
    word-break: break-all; min-height: 22px;
}
.ep-pop-preview.has-network { color: #fa0; }
.ep-pop-preview.empty { color: #444; font-style: italic; }
.ep-pop-btns { display: flex; gap: 8px; margin-top: 12px; }
.ep-pop-btn {
    flex: 1; padding: 7px 0; border: none; border-radius: 6px;
    font-size: 12px; font-weight: bold; cursor: pointer;
}
.ep-pop-cancel { background: #2a2a3a; color: #889; }
.ep-pop-cancel:hover { background: #3a3a4a; }
.ep-pop-save { background: #1a5c2a; color: #cfc; }
.ep-pop-save:hover { background: #247a38; }
.ep-pop-save:disabled { opacity: .4; cursor: default; }

/* ── Episode info box (inside popup) ─────────────────────────────────────── */
.ep-pop-epinfo {
    margin-bottom: 10px; padding: 8px 10px;
    background: #0d0d1e; border: 1px solid #2a2a40; border-radius: 6px;
    font-size: 11px; color: #aab;
}
.ep-pop-epinfo-label { font-weight: bold; color: #7dd; margin-bottom: 3px; font-size: 12px; }
.ep-pop-epinfo-path {
    color: #567; font-family: monospace; font-size: 10px;
    word-break: break-all; margin-bottom: 3px;
}
.ep-pop-epinfo-rg { color: #fa0; font-size: 10px; }
.ep-pop-epinfo-rg code {
    background: #1a1000; border-radius: 3px;
    padding: 1px 5px; font-family: monospace;
}

/* ── Rename mismatch notification ────────────────────────────────────────── */
#rg-rename-notif {
    position: fixed; bottom: 24px; right: 24px; z-index: 9997;
    width: 360px; background: #1a1a2e; border: 1px solid #4a6;
    border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.65);
    font-family: sans-serif; font-size: 12px; color: #e0e0e0;
    display: none; flex-direction: column;
    transform: translateY(16px); opacity: 0;
    transition: transform .2s ease, opacity .2s ease;
}
#rg-rename-notif.open { display: flex; transform: translateY(0); opacity: 1; }
.rn-head {
    background: #0d2a18; padding: 9px 13px; font-weight: bold; color: #4d9;
    border-bottom: 1px solid #2a4a36; border-radius: 10px 10px 0 0;
    display: flex; justify-content: space-between; align-items: center;
}
.rn-head-close { cursor: pointer; color: #789; font-size: 14px; }
.rn-body {
    padding: 10px 13px; display: flex; flex-direction: column;
    gap: 6px; max-height: 200px; overflow-y: auto;
}
.rn-file { background: #111120; border-radius: 5px; padding: 6px 9px; font-family: monospace; font-size: 10px; }
.rn-old  { color: #fa0; word-break: break-all; }
.rn-arrow { color: #456; margin: 2px 0; }
.rn-new  { color: #6d6; word-break: break-all; }
.rn-btns { display: flex; gap: 8px; padding: 8px 13px 12px; }
.rn-btn  { flex: 1; padding: 7px 0; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; }
.rn-cancel { background: #2a2a3a; color: #889; }
.rn-cancel:hover { background: #3a3a4a; }
.rn-rename-now { background: #1a5c2a; color: #cfc; }
.rn-rename-now:hover { background: #247a38; }
.rn-rename-now:disabled { opacity: .4; cursor: default; }

/* ── Settings slide-in panel ─────────────────────────────────────────────── */
#rg-settings-btn {
    position: fixed; bottom: 24px; left: 24px; z-index: 9999;
    width: 34px; height: 34px; border-radius: 17px;
    background: #1a1a2e; border: 1px solid #2a2a45;
    color: #567; font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,.4); transition: all .18s; user-select: none;
}
#rg-settings-btn:hover { border-color: #4cc; color: #4cc; }
#rg-settings-panel {
    position: fixed; top: 0; right: -440px;
    width: 420px; height: 100vh;
    background: #12121e; border-left: 1px solid #2a2a40; z-index: 10001;
    display: flex; flex-direction: column;
    box-shadow: -8px 0 32px rgba(0,0,0,.65);
    font-family: sans-serif; font-size: 13px; color: #e0e0e0;
    transition: right .25s ease; overflow: hidden;
}
#rg-settings-panel.open { right: 0; }
.rgs-head {
    background: #0d0d1e; padding: 14px 16px;
    font-size: 14px; font-weight: bold; color: #4cc;
    border-bottom: 1px solid #2a2a40;
    display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
}
.rgs-close { cursor: pointer; color: #789; font-size: 18px; }
.rgs-tabs { display: flex; border-bottom: 1px solid #2a2a40; flex-shrink: 0; }
.rgs-tab {
    flex: 1; padding: 9px 4px; text-align: center; font-size: 11px;
    color: #567; cursor: pointer; border-bottom: 2px solid transparent;
    user-select: none; transition: all .14s;
}
.rgs-tab:hover { color: #99b; }
.rgs-tab.active { color: #4cc; border-bottom-color: #4cc; }
.rgs-body { flex: 1; overflow-y: auto; padding: 14px; }
.rgs-section { margin-bottom: 18px; }
.rgs-section-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    color: #456; margin-bottom: 7px;
}
.rgs-desc { font-size: 11px; color: #567; margin-bottom: 8px; line-height: 1.5; }
.rgs-pills-wrap { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.rgs-pill {
    padding: 4px 10px; border-radius: 12px; border: 1px solid #3a3a55;
    background: transparent; color: #889; font-size: 11px;
    cursor: pointer; user-select: none; transition: all .13s;
    display: flex; align-items: center; gap: 4px;
}
.rgs-pill:hover { border-color: #777; color: #bbb; }
.rgs-pill.active { border-color: #4cc; background: #0d2a33; color: #4ef; }
.rgs-pill .rgs-x { color: #567; font-size: 12px; transition: color .12s; }
.rgs-pill:hover .rgs-x { color: #f88; }
.rgs-add-row { display: flex; gap: 7px; margin-top: 7px; }
.rgs-input {
    flex: 1; padding: 5px 9px; background: #1a1a2e;
    border: 1px solid #3a3a55; border-radius: 6px; color: #ddd; font-size: 12px; outline: none;
}
.rgs-input:focus { border-color: #4cc; }
.rgs-add-btn {
    padding: 5px 12px; border-radius: 6px; border: 1px solid #4cc;
    background: transparent; color: #4cc; font-size: 12px; cursor: pointer; transition: all .13s;
}
.rgs-add-btn:hover { background: #0d2a33; }
.rgs-key-box {
    background: #0d0d1e; border: 1px solid #2a2a40; border-radius: 6px;
    padding: 8px 11px; font-family: monospace; font-size: 11px; color: #6b9;
    word-break: break-all; margin-bottom: 6px;
}
.rgs-small-btn {
    padding: 5px 11px; border-radius: 5px; border: 1px solid #3a3a55;
    background: transparent; color: #889; font-size: 11px; cursor: pointer; transition: all .13s;
}
.rgs-small-btn:hover { border-color: #f88; color: #f88; }
</style>`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PER-EPISODE RELEASE GROUP EDITOR
    // ══════════════════════════════════════════════════════════════════════════

    /** Open floating Release Group editor anchored to `anchorEl`, editing `file`.
     *  @param {Element}  anchorEl  – the ✎ button element
     *  @param {Object}   file      – episode file object from _spData.files
     *  @param {Object}   [ep]      – episode metadata from _spData.epMap (optional)
     */
    function openEpRGEditor(anchorEl, file, ep = null) {
        document.getElementById("ep-rg-popup")?.remove();

        const parsed = parseRG(file.releaseGroup || "");
        const popup  = document.createElement("div");
        popup.id     = "ep-rg-popup";

        // Position — prefer below the button; flip above if insufficient room.
        // max-height is set dynamically so overflow-y: auto always has a constrained box to scroll within.
        const rect   = anchorEl.getBoundingClientRect();
        const MARGIN = 10;
        const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
        const spaceAbove = rect.top - MARGIN;
        let topPx, maxH;
        if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
            // Open downward
            topPx = rect.bottom + 6;
            maxH  = spaceBelow - 6;
        } else {
            // Open upward — estimate height then anchor bottom to button top
            const estimatedH = Math.min(560, spaceAbove);
            topPx = Math.max(MARGIN, rect.top - estimatedH - 6);
            maxH  = spaceAbove - 6;
        }
        popup.style.top       = `${Math.max(MARGIN, topPx)}px`;
        popup.style.maxHeight = `${Math.max(180, maxH)}px`;
        popup.style.left      = `${Math.max(4, Math.min(rect.left, window.innerWidth - 434))}px`;

        // Header
        const head = document.createElement("div");
        head.className = "ep-pop-head";
        head.innerHTML = `✎ Edit Release Group <span class="ep-pop-close">✕</span>`;
        popup.appendChild(head);

        // Episode info box (for re-verification)
        const epLabel = ep ? fmtEp(ep) : "";
        const epTitle = ep?.title ?? "";
        const fname   = file.relativePath?.split(/[/\\]/).pop() ?? "";
        if (epLabel || fname) {
            const info = document.createElement("div");
            info.className = "ep-pop-epinfo";
            info.innerHTML = `
                ${epLabel ? `<div class="ep-pop-epinfo-label">${epLabel}${epTitle ? ` — ${epTitle}` : ""}</div>` : ""}
                ${fname   ? `<div class="ep-pop-epinfo-path">${fname}</div>` : ""}
                <div class="ep-pop-epinfo-rg">Current RG: <code>${file.releaseGroup || "(none)"}</code></div>`;
            popup.appendChild(info);
        }

        // Network
        const netRow = makeEpPopRow("Network");
        const netComp = makeSinglePills(NETWORKS, "net", parsed.network, sync);
        netRow.appendChild(netComp.el);

        // Edition
        const edtRow = makeEpPopRow("Edition");
        const edtComp = makeSinglePills(EDITIONS, "edt", parsed.edition, sync);
        edtRow.appendChild(edtComp.el);

        // Language (dual)
        const langRow = makeEpPopRow("Language");
        const dual = document.createElement("div"); dual.className = "rg-dual";
        const audioComp = makeLangPicker("Audio",    parsed.audioCodes, sync);
        const subComp   = makeLangPicker("Subtitle", parsed.subCodes,   sync);
        dual.append(audioComp.el, subComp.el);
        langRow.appendChild(dual);

        // Preview
        const prevRow = makeEpPopRow("Preview");
        const preview = document.createElement("div");
        preview.className = "ep-pop-preview empty";
        preview.textContent = "—";
        prevRow.appendChild(preview);

        // Buttons
        const btns      = document.createElement("div"); btns.className = "ep-pop-btns";
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "ep-pop-btn ep-pop-cancel"; cancelBtn.textContent = "Cancel";
        const saveBtn   = document.createElement("button");
        saveBtn.className   = "ep-pop-btn ep-pop-save";   saveBtn.textContent   = "Save";
        btns.append(cancelBtn, saveBtn);

        popup.append(netRow, edtRow, langRow, prevRow, btns);
        document.body.appendChild(popup);

        function makeEpPopRow(label) {
            const row = document.createElement("div"); row.className = "ep-pop-row";
            const lbl = document.createElement("div"); lbl.className = "ep-pop-lbl"; lbl.textContent = label;
            row.appendChild(lbl);
            return row;
        }

        function sync() {
            const val = buildValue(netComp.get(), edtComp.get(), audioComp.get(), subComp.get());
            preview.textContent = val || "—";
            preview.className   = "ep-pop-preview" +
                (!val ? " empty" : netComp.get() || edtComp.get() ? " has-network" : "");
        }
        sync();

        const close = () => popup.remove();
        head.querySelector(".ep-pop-close").addEventListener("click", close);
        cancelBtn.addEventListener("click", close);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener("mousedown", function outside(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener("mousedown", outside, true);
                }
            }, true);
        }, 0);

        // Save — PUT → verify → unified rename check
        saveBtn.addEventListener("click", async () => {
            const value = buildValue(netComp.get(), edtComp.get(), audioComp.get(), subComp.get());
            saveBtn.disabled = true;

            try {
                // 1. PUT
                saveBtn.textContent = "Saving…";
                await apiReq("PUT", `/api/v3/episodefile/${file.id}`, {
                    ...file, releaseGroup: value,
                });

                // 2. Wait for Sonarr DB commit
                saveBtn.textContent = "Verifying…";
                await new Promise(r => setTimeout(r, 500));

                // 3. Re-fetch to confirm the change actually applied
                const fresh = await apiReq("GET", `/api/v3/episodefile/${file.id}`);
                if (fresh.releaseGroup !== value) {
                    throw new Error(`Not saved — got: "${fresh.releaseGroup}"`);
                }

                // 4. Update local cache with fresh data
                if (_spData) {
                    const idx = _spData.files.findIndex(f => f.id === file.id);
                    if (idx !== -1) _spData.files[idx] = fresh;
                }

                popup.remove();

                // 5a. Immediately update the Release Group cell text in the DOM.
                //     React may not re-render until Sonarr gets a SignalR push, so we patch
                //     the text node directly so the user sees the new value right away.
                try {
                    const rgCell = anchorEl.parentElement; // anchorEl = ✎ btn inside <td>
                    if (rgCell && rgCell.matches("td[class*='releaseGroup']")) {
                        // React renders the RG value as a plain text node before our button
                        const textNode = [...rgCell.childNodes]
                            .find(n => n.nodeType === Node.TEXT_NODE);
                        if (textNode) {
                            textNode.textContent = value;
                        } else {
                            rgCell.insertBefore(document.createTextNode(value), anchorEl);
                        }
                        // Refresh button tooltip with new value
                        const latestEp = _spData?.epMap.get(file.id);
                        anchorEl.title = latestEp
                            ? `Edit RG — ${fmtEp(latestEp)} ${latestEp.title ?? ""} (${value || "—"})`
                            : `Edit Release Group (${value || "—"})`;
                        // NOTE: intentionally do NOT delete epEditAdded —
                        // deleting it causes MutationObserver to inject a duplicate button.
                        // The click handler always reads _spData.files (updated in step 4)
                        // so the existing button stays up-to-date without re-injection.
                    }
                } catch (_) { /* DOM update is best-effort; ignore errors */ }

                // 5b. Unified rename mismatch check (same as series-page load)
                if (_spData?.series) checkRenameMismatch(_spData.series, [file.id]);

                // 5c. If the new RG value itself carries a [prefix]- pattern,
                //     trigger the Strip panel so the user can remove it immediately.
                if (RG_PREFIX_RE.test(value)) recheckPrefixFiles();

            } catch (err) {
                const msg = err.message.startsWith("Not saved") ? `✗ ${err.message}` : "✗ Save failed";
                saveBtn.textContent = msg.slice(0, 34);
                saveBtn.style.background = "#5c1a1a";
                setTimeout(() => {
                    saveBtn.disabled  = false;
                    saveBtn.textContent = "Retry";
                    saveBtn.style.background = "";
                }, 3000);
            }
        });
    }

    /** Inject ✎ edit buttons next to Release Group cells on the series page.
     *
     *  Matching strategy (based on actual Sonarr HTML):
     *  - Target <td class*='releaseGroup'> (data cells, not the <th> header)
     *  - Climb to the parent <tr> (standard HTML table row)
     *  - Find "Relative Path" column index from <th label="Relative Path"> in the header
     *  - Read tr.cells[pathColIdx] to get the path text for THIS row
     *  - Fallback: scan all <td> siblings for a cell that looks like a file path
     */
    function injectEpEditBtns() {
        if (!_spData) return;
        if (!/^\/series\/[^/]+/.test(location.pathname)) return;

        // Determine "Relative Path" column index once from the <thead>
        // Sonarr marks column headers with a `label` attribute
        const headerThs = [...document.querySelectorAll("table thead th, thead th")];
        const pathColIdx = headerThs.findIndex(th =>
            th.getAttribute("label") === "Relative Path" ||
            th.textContent.trim() === "Relative Path"
        );

        // Remove any stale duplicate buttons (can happen after page re-renders)
        document.querySelectorAll("td[class*='releaseGroup']").forEach(cell => {
            const btns = [...cell.querySelectorAll(".ep-rg-edit-btn")];
            if (btns.length > 1) btns.slice(1).forEach(b => b.remove());
        });

        // Use td selector to skip the <th> header cell (which also contains "releaseGroup" text)
        document.querySelectorAll("td[class*='releaseGroup']").forEach(cell => {
            if (cell.dataset.epEditAdded) return;
            cell.dataset.epEditAdded = "true";

            const tr = cell.closest("tr");
            if (!tr) return;

            // Method 1: use column index from header label
            let pathTxt = pathColIdx >= 0
                ? (tr.cells[pathColIdx]?.textContent.trim() ?? "")
                : "";

            // Method 2: scan sibling <td> cells for path-like content (fallback)
            if (!pathTxt) {
                for (const td of tr.cells) {
                    if (td === cell) continue;
                    const t = td.textContent.trim();
                    if (t.length > 8 && t.includes("/") && /\.\w{2,5}$/.test(t)) {
                        pathTxt = t;
                        break;
                    }
                }
            }

            let file = null;
            if (pathTxt) {
                // Exact relativePath match
                file = _spData.files.find(f => f.relativePath === pathTxt);
                // Filename-only match (strips leading season directory)
                if (!file) {
                    const fname = pathTxt.split(/[/\\]/).pop().trim();
                    if (fname) file = _spData.files.find(f =>
                        f.relativePath?.split(/[/\\]/).pop() === fname
                    );
                }
            }

            // Last resort: unique release-group text (only safe if exactly 1 file has that RG)
            if (!file) {
                const rgText = cell.textContent.replace("✎", "").trim();
                if (rgText) {
                    const hits = _spData.files.filter(f => (f.releaseGroup || "") === rgText);
                    if (hits.length === 1) file = hits[0];
                }
            }

            if (!file) return;

            const ep = _spData.epMap.get(file.id);

            const btn = document.createElement("span");
            btn.className    = "ep-rg-edit-btn";
            btn.title        = ep
                ? `Edit RG — ${fmtEp(ep)} ${ep.title ?? ""} (${file.releaseGroup || "—"})`
                : `Edit Release Group (${file.releaseGroup || "—"})`;
            btn.textContent  = "✎";
            btn.dataset.fileId = String(file.id); // visible in DevTools for debugging

            btn.addEventListener("click", e => {
                e.stopPropagation();
                const latest   = _spData?.files.find(f => f.id === file.id) ?? file;
                const latestEp = _spData?.epMap.get(latest.id);
                openEpRGEditor(btn, latest, latestEp);
            });
            cell.appendChild(btn);
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  RENAME MISMATCH NOTIFICATION
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Unified rename-mismatch checker.
     * Called from two places:
     *   1. After per-episode RG edit (fileIds = [id] — check only that file)
     *   2. Series page load with no prefix files (fileIds undefined — check all)
     *
     * Sonarr's /rename endpoint returns files whose current filename differs from
     * what Sonarr would generate given the current metadata.
     */
    async function checkRenameMismatch(series, fileIds) {
        if (!series) return;
        try {
            const results = await apiReq("GET", `/api/v3/rename?seriesId=${series.id}`);
            const pending = fileIds
                ? results.filter(r => fileIds.includes(r.episodeFileId))
                : results;
            if (pending.length === 0) return;
            showRenameNotif(series, pending);
        } catch (e) { console.warn("[RG Rename]", e.message); }
    }

    function showRenameNotif(series, items) {
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
                await apiReq("POST", "/api/v3/command", {
                    name: "RenameFiles",
                    seriesId: series.id,
                    files: items.map(r => r.episodeFileId),
                });
                btn.textContent = "✓ Done";
                setTimeout(() => notif.remove(), 2000);
            } catch (e) {
                btn.textContent = "✗ Error"; btn.disabled = false;
                setTimeout(() => { btn.textContent = "Rename Now"; }, 2500);
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SETTINGS DASHBOARD
    // ══════════════════════════════════════════════════════════════════════════

    const SETTINGS_KEY = `rg_settings_${location.hostname}`;
    function loadSettings() {
        try { return JSON.parse(GM_getValue(SETTINGS_KEY, "{}")); } catch { return {}; }
    }
    function saveSettings(obj) { GM_setValue(SETTINGS_KEY, JSON.stringify(obj)); }

    // Apply saved custom networks on startup (runs after NETWORKS const is set)
    ;(function applySavedNetworks() {
        (loadSettings().customNetworks ?? []).forEach(n => {
            if (!NETWORKS.find(x => x.value === n)) NETWORKS.push({ label: n, value: n });
        });
    })();

    function buildSettingsPanel() {
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
            }
        }

        renderTab("networks");
    }

    // Persistent ⚙ settings button
    ;(function initSettingsBtn() {
        const btn = document.createElement("div");
        btn.id    = "rg-settings-btn";
        btn.title = "Script Settings";
        btn.textContent = "⚙";
        btn.addEventListener("click", () => {
            const p = document.getElementById("rg-settings-panel");
            if (p?.classList.contains("open")) p.classList.remove("open");
            else buildSettingsPanel();
        });
        document.body.appendChild(btn);
    })();

    // Persistent floating buttons — series page only (↺ rename-check · ✂ strip-prefix)
    document.head.insertAdjacentHTML("beforeend", `<style>
/* shared style for both series-page FABs */
.rg-fab-side {
    position: fixed; left: 24px; z-index: 9999;
    width: 34px; height: 34px; border-radius: 17px;
    background: #1a1a2e; border: 1px solid #2a2a45;
    color: #567; font-size: 15px; cursor: pointer;
    display: none; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,.4); transition: all .18s; user-select: none;
}
.rg-fab-side.visible { display: flex; }
#rg-check-btn { bottom: 66px; }
#rg-check-btn:hover   { border-color: #4ad; color: #4ad; }
#rg-check-btn.spinning { color: #fa0; border-color: #fa0; animation: rg-spin .8s linear infinite; }
#rg-strip-btn { bottom: 108px; }
#rg-strip-btn:hover   { border-color: #6d6; color: #6d6; }
#rg-strip-btn.spinning { color: #fa0; border-color: #fa0; animation: rg-spin .8s linear infinite; }
@keyframes rg-spin { to { transform: rotate(360deg); } }
/* brief toast */
#rg-toast {
    position: fixed; bottom: 70px; left: 70px; z-index: 10003;
    background: #0d200d; border: 1px solid #4a6; color: #6d6;
    padding: 7px 14px; border-radius: 8px;
    font-size: 12px; font-family: sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,.5);
    pointer-events: none;
    animation: rg-fadein .15s ease;
}
@keyframes rg-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; } }
</style>`);

    function showToast(msg, ms = 3000) {
        document.getElementById("rg-toast")?.remove();
        const t = document.createElement("div");
        t.id = "rg-toast";
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), ms);
    }

    // ↺ Rename-check button
    ;(function initRenameCheckBtn() {
        const btn = document.createElement("div");
        btn.id        = "rg-check-btn";
        btn.className = "rg-fab-side";
        btn.title     = "Check rename mismatches now";
        btn.textContent = "↺";
        btn.addEventListener("click", async () => {
            if (!_spData?.series || btn.classList.contains("spinning")) return;
            btn.classList.add("spinning");
            try {
                document.getElementById("rg-rename-notif")?.remove();
                await checkRenameMismatch(_spData.series);
            } finally {
                btn.classList.remove("spinning");
            }
        });
        document.body.appendChild(btn);
    })();

    // ✂ Strip-prefix recheck button
    ;(function initStripCheckBtn() {
        const btn = document.createElement("div");
        btn.id        = "rg-strip-btn";
        btn.className = "rg-fab-side";
        btn.title     = "Re-check [prefix]- Release Group files";
        btn.textContent = "✂";
        btn.addEventListener("click", async () => {
            if (!_spData?.series || btn.classList.contains("spinning")) return;
            btn.classList.add("spinning");
            try {
                await recheckPrefixFiles();
            } finally {
                btn.classList.remove("spinning");
            }
        });
        document.body.appendChild(btn);
    })();

    /** Re-fetch episode files and rebuild the Strip-prefix UI without page reload. */
    async function recheckPrefixFiles() {
        if (!_spData?.series) return;
        // Remove old fix UI so it refreshes cleanly
        document.getElementById("rg-fix-fab")?.remove();
        document.getElementById("rg-fix-panel")?.remove();
        try {
            const files = await apiReq("GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`);
            _spData.files = files;

            const affected = files
                .filter(f => prefixAlreadyInFilename(f))
                .map(f => ({
                    ...f,
                    ep: _spData.epMap.get(f.id) ?? null,
                    newReleaseGroup: (f.releaseGroup || "").replace(RG_PREFIX_RE, ""),
                }))
                .sort((a, b) => {
                    const ds = (a.ep?.seasonNumber ?? 0) - (b.ep?.seasonNumber ?? 0);
                    return ds !== 0 ? ds : (a.ep?.episodeNumber ?? 0) - (b.ep?.episodeNumber ?? 0);
                });

            if (affected.length > 0) {
                buildFixUI(_spData.series, affected);
            } else {
                showToast("✓ No [prefix]- files found");
            }
        } catch (e) {
            showToast("✗ " + e.message.slice(0, 60));
            console.warn("[RG Strip recheck]", e.message);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SERIES PAGE — Auto-detect [network]- prefix in Release Group
    // ══════════════════════════════════════════════════════════════════════════

    document.head.insertAdjacentHTML("beforeend", `<style>
#rg-fix-fab {
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:#1a5c2a; color:#fff; border:none; border-radius:22px;
    padding:10px 18px; font-size:13px; font-weight:bold; cursor:pointer;
    box-shadow:0 3px 14px rgba(0,0,0,.5);
    display:flex; align-items:center; gap:8px;
    transition:background .2s; user-select:none;
}
#rg-fix-fab:hover { background:#247a38; }
#rg-fix-fab .rfab-count {
    background:#fff; color:#1a5c2a; border-radius:10px;
    padding:1px 7px; font-size:11px; font-weight:bold;
}
#rg-fix-panel {
    position:fixed; bottom:72px; right:24px; z-index:9998;
    width:460px; background:#1a1a2e; color:#e0e0e0;
    border-radius:12px; box-shadow:0 6px 28px rgba(0,0,0,.6);
    font-family:sans-serif; font-size:13px;
    display:none; flex-direction:column; overflow:hidden;
    max-height:90vh;
}
#rg-fix-panel.open { display:flex; }
.rfp-head {
    background:#13132a; padding:11px 14px; font-weight:bold;
    color:#6d6; font-size:13px; border-bottom:1px solid #2a2a45;
    display:flex; justify-content:space-between; align-items:center;
    flex-shrink:0;
}
.rfp-head-close { cursor:pointer; color:#789; font-size:16px; }
.rfp-body { padding:13px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
.rfp-desc {
    font-size:12px; color:#aab; margin:0; padding:8px 10px;
    background:#12122a; border-radius:6px; border:1px solid #2a2a45;
}
.rfp-desc code {
    background:#0d3d20; color:#6d6; padding:1px 5px;
    border-radius:4px; font-size:11px; font-family:monospace;
}

/* Tree */
.rfp-tree { border:1px solid #2a2a45; border-radius:6px; overflow:hidden; }

.rfp-season-head {
    display:flex; align-items:center; gap:8px;
    padding:8px 10px; background:#13132a; cursor:pointer;
    border-bottom:1px solid #2a2a45; user-select:none;
}
.rfp-season-head:last-child { border-bottom:none; }
.rfp-season-head:hover { background:#1a1a38; }
.rfp-season-label { flex:1; font-weight:bold; font-size:12px; color:#ccd; }
.rfp-season-label em { color:#567; font-style:normal; font-size:11px; }
.rfp-toggle { color:#567; font-size:11px; padding:0 4px; }

.rfp-ep-list { background:#111120; }
.rfp-ep-row {
    display:flex; align-items:flex-start; gap:8px;
    padding:6px 10px 6px 28px; border-bottom:1px solid #1a1a30;
    font-size:11px;
}
.rfp-ep-row:last-child { border-bottom:none; }
.rfp-ep-info { display:flex; flex-wrap:wrap; align-items:center; gap:5px; }
.rfp-ep-label { color:#4cc; font-weight:bold; min-width:52px; }
.rfp-old   { color:#fa0; font-family:monospace; }
.rfp-arrow { color:#456; }
.rfp-new   { color:#6d6; font-family:monospace; font-weight:bold; }

/* checkbox style */
.rfp-chk { accent-color:#4cc; width:14px; height:14px; flex-shrink:0; cursor:pointer; }

.rfp-status {
    font-size:11px; text-align:center;
    padding:6px 8px; border-radius:4px; display:none;
}
.rfp-status.ok      { display:block; background:#0d200d; color:#4d4; }
.rfp-status.err     { display:block; background:#200d0d; color:#d44; }
.rfp-status.loading { display:block; background:#0d1e2a; color:#4ad; }
.rfp-btns { display:flex; gap:8px; flex-shrink:0; }
.rfp-btn {
    flex:1; padding:8px 0; border:none; border-radius:6px;
    font-size:12px; font-weight:bold; cursor:pointer;
}
.rfp-cancel         { background:#2a2a3a; color:#889; }
.rfp-cancel:hover   { background:#3a3a4a; }
.rfp-confirm        { background:#1a5c2a; color:#cfc; }
.rfp-confirm:hover  { background:#247a38; }
.rfp-btn:disabled   { opacity:.4; cursor:default; }
</style>`);

    const RG_PREFIX_RE = /^\[[^\]]+\]-/;

    /**
     * Strip condition gate — returns true only when:
     *   1. releaseGroup starts with [prefix]-
     *   2. The ACTUAL filename on disk (relativePath basename) already contains that prefix.
     *
     * Condition 2 ensures we don't show the strip panel for files where the prefix
     * was just set in the DB but Sonarr hasn't renamed the file yet.
     * e.g. RG="[TrueID]-AudioTH" but file is still "…-AudioTH.mkv" → returns false.
     *      RG="[TrueID]-AudioTH" and file is "…[TrueID]-AudioTH.mkv" → returns true.
     */
    function prefixAlreadyInFilename(f) {
        const rg = f.releaseGroup || "";
        if (!RG_PREFIX_RE.test(rg)) return false;
        const prefix = rg.match(RG_PREFIX_RE)?.[0] ?? ""; // e.g. "[TrueID]-"
        if (!prefix) return false;
        const basename = (f.relativePath || "").split(/[/\\]/).pop();
        return basename.includes(prefix);
    }

    function fmtEp(ep) {
        if (!ep) return "?";
        const s = String(ep.seasonNumber).padStart(2, "0");
        const e = String(ep.episodeNumber).padStart(2, "0");
        return `S${s}E${e}`;
    }

    async function checkSeriesPage() {
        document.getElementById("rg-fix-fab")?.remove();
        document.getElementById("rg-fix-panel")?.remove();
        document.getElementById("rg-rename-notif")?.remove();
        _spData = null;
        document.getElementById("rg-check-btn")?.classList.remove("visible");
        document.getElementById("rg-strip-btn")?.classList.remove("visible");

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

            const epMap = new Map(
                episodes.filter(e => e.episodeFileId).map(e => [e.episodeFileId, e])
            );

            // Cache data for per-episode edit buttons
            _spData = { series, files, epMap };
            document.getElementById("rg-check-btn")?.classList.add("visible");
            document.getElementById("rg-strip-btn")?.classList.add("visible");
            injectEpEditBtns();

            const affected = files
                .filter(f => prefixAlreadyInFilename(f))
                .map(f => ({
                    ...f,
                    ep: epMap.get(f.id) ?? null,
                    newReleaseGroup: (f.releaseGroup || "").replace(RG_PREFIX_RE, ""),
                }))
                .sort((a, b) => {
                    const ds = (a.ep?.seasonNumber ?? 0) - (b.ep?.seasonNumber ?? 0);
                    return ds !== 0 ? ds : (a.ep?.episodeNumber ?? 0) - (b.ep?.episodeNumber ?? 0);
                });

            if (affected.length > 0) {
                buildFixUI(series, affected);
            } else {
                // No prefix-fix files — show general rename notification if any files mismatch
                checkRenameMismatch(series);
            }

        } catch (e) { console.warn("[RG Fix]", e.message); }
    }

    // ── Build the confirmation panel with season/episode tree ──────────────

    function buildFixUI(series, affected) {
        const prefixes = [...new Set(affected.map(f => (f.releaseGroup.match(RG_PREFIX_RE) || [""])[0]))];
        const prefixLabel = prefixes.join(", ");

        // Group by season
        const bySeason = new Map();
        for (const f of affected) {
            const sn = f.ep?.seasonNumber ?? 0;
            if (!bySeason.has(sn)) bySeason.set(sn, []);
            bySeason.get(sn).push(f);
        }
        const seasons = [...bySeason.keys()].sort((a, b) => a - b);

        // Selection state
        const checked = new Set(affected.map(f => f.id));

        // FAB
        const fab = document.createElement("div");
        fab.id = "rg-fix-fab";
        document.body.appendChild(fab);

        // Panel
        const panel = document.createElement("div");
        panel.id = "rg-fix-panel";
        document.body.appendChild(panel);

        function renderFab() {
            fab.innerHTML = `✂ Fix Release Group <span class="rfab-count">${checked.size}</span>`;
        }

        function updateConfirmBtn() {
            const btn = panel.querySelector("#rfp-confirm");
            if (btn) {
                btn.textContent = `✂ Strip & Rename (${checked.size})`;
                btn.disabled = checked.size === 0;
            }
            renderFab();
        }

        function setSeasonCheckState(sn) {
            const files = bySeason.get(sn);
            const allC = files.every(f => checked.has(f.id));
            const someC = files.some(f => checked.has(f.id));
            const chk = panel.querySelector(`.rfp-season-chk[data-sn="${sn}"]`);
            if (!chk) return;
            chk.checked = allC;
            chk.indeterminate = someC && !allC;
        }

        function renderTree() {
            const tree = panel.querySelector("#rfp-tree");
            tree.innerHTML = "";

            for (const sn of seasons) {
                const files = bySeason.get(sn);
                const allChecked = files.every(f => checked.has(f.id));
                const someChecked = files.some(f => checked.has(f.id));
                // Auto-expand if season is partially selected
                let expanded = !allChecked;

                const block = document.createElement("div");
                block.className = "rfp-season-block";

                // Season header
                const head = document.createElement("div");
                head.className = "rfp-season-head";
                head.innerHTML = `
                    <input type="checkbox" class="rfp-chk rfp-season-chk" data-sn="${sn}">
                    <span class="rfp-season-label">
                        Season ${sn} <em>(${files.length} file${files.length > 1 ? "s" : ""})</em>
                    </span>
                    <span class="rfp-toggle">${expanded ? "▲" : "▼"}</span>
                `;
                block.appendChild(head);

                // Set initial checkbox state
                const chk = head.querySelector(".rfp-season-chk");
                chk.checked = allChecked;
                chk.indeterminate = someChecked && !allChecked;

                // Episode list
                const epList = document.createElement("div");
                epList.className = "rfp-ep-list";
                epList.style.display = expanded ? "block" : "none";

                for (const f of files) {
                    const row = document.createElement("div");
                    row.className = "rfp-ep-row";
                    row.innerHTML = `
                        <input type="checkbox" class="rfp-chk rfp-ep-chk" data-id="${f.id}"
                            ${checked.has(f.id) ? "checked" : ""}>
                        <div class="rfp-ep-info">
                            <span class="rfp-ep-label">${fmtEp(f.ep)}</span>
                            <span class="rfp-old">${f.releaseGroup}</span>
                            <span class="rfp-arrow">→</span>
                            <span class="rfp-new">${f.newReleaseGroup}</span>
                        </div>
                    `;
                    epList.appendChild(row);
                }
                block.appendChild(epList);
                tree.appendChild(block);

                // Toggle expand/collapse (click label or arrow, not checkbox)
                const toggle = head.querySelector(".rfp-toggle");
                const label = head.querySelector(".rfp-season-label");
                [toggle, label].forEach(el => el.addEventListener("click", () => {
                    expanded = !expanded;
                    epList.style.display = expanded ? "block" : "none";
                    toggle.textContent = expanded ? "▲" : "▼";
                }));

                // Season checkbox → select/deselect all in season
                chk.addEventListener("change", () => {
                    files.forEach(f => chk.checked ? checked.add(f.id) : checked.delete(f.id));
                    epList.querySelectorAll(".rfp-ep-chk")
                        .forEach(ec => ec.checked = chk.checked);
                    updateConfirmBtn();
                });

                // Episode checkboxes
                epList.querySelectorAll(".rfp-ep-chk").forEach(ec => {
                    ec.addEventListener("change", () => {
                        const id = parseInt(ec.dataset.id);
                        ec.checked ? checked.add(id) : checked.delete(id);
                        setSeasonCheckState(sn);
                        updateConfirmBtn();
                    });
                });
            }
        }

        // Build panel HTML skeleton
        panel.innerHTML = `
            <div class="rfp-head">
                ✂ Strip Release Group Prefix
                <span class="rfp-head-close">✕</span>
            </div>
            <div class="rfp-body">
                <p class="rfp-desc">
                    Strip <code>${prefixLabel}</code> from selected files, then rename.
                </p>
                <div class="rfp-tree" id="rfp-tree"></div>
                <div class="rfp-status" id="rfp-status"></div>
                <div class="rfp-btns">
                    <button class="rfp-btn rfp-cancel" id="rfp-cancel">Cancel</button>
                    <button class="rfp-btn rfp-confirm" id="rfp-confirm"></button>
                </div>
            </div>
        `;
        renderTree();
        updateConfirmBtn();

        panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
        panel.querySelector("#rfp-cancel").addEventListener("click", () => panel.classList.remove("open"));
        panel.querySelector("#rfp-confirm").addEventListener("click", () => {
            executeGroupFix(series, affected.filter(f => checked.has(f.id)));
        });

        fab.addEventListener("click", () => panel.classList.toggle("open"));
        renderFab();
    }

    // ── Execute: all PUTs first, then rename ──────────────────────────────

    function rfpStatus(msg, type) {
        const el = document.getElementById("rfp-status");
        if (!el) return;
        el.textContent = msg;
        el.className = `rfp-status ${type}`;
    }

    async function executeGroupFix(series, selectedFiles) {
        if (!selectedFiles.length) return;
        const confirmBtn = document.getElementById("rfp-confirm");
        const cancelBtn = document.getElementById("rfp-cancel");
        confirmBtn.disabled = cancelBtn.disabled = true;

        try {
            // ── Step 1: Update every Release Group sequentially ──────────
            for (let i = 0; i < selectedFiles.length; i++) {
                const f = selectedFiles[i];
                rfpStatus(`Updating Release Group ${i + 1} / ${selectedFiles.length}…`, "loading");
                await apiReq("PUT", `/api/v3/episodefile/${f.id}`, {
                    ...f,
                    releaseGroup: f.newReleaseGroup,
                });
            }

            // ── Step 2: Wait for Sonarr to commit all DB writes ──────────
            rfpStatus(`All ${selectedFiles.length} updated. Waiting for Sonarr…`, "loading");
            await new Promise(r => setTimeout(r, 600));

            // ── Step 3: Trigger rename ────────────────────────────────────
            rfpStatus("Renaming files…", "loading");
            await apiReq("POST", "/api/v3/command", {
                name: "RenameFiles",
                seriesId: series.id,
                files: selectedFiles.map(f => f.id),
            });

            rfpStatus(`✓ Done — ${selectedFiles.length} file(s) renamed.`, "ok");
            setTimeout(async () => {
                document.getElementById("rg-fix-fab")?.remove();
                document.getElementById("rg-fix-panel")?.remove();
                // Re-fetch files: after rename, relativePaths change so old _spData.files
                // would cause path-matching in injectEpEditBtns to fail (→ buttons disappear).
                if (_spData?.series) {
                    try {
                        _spData.files = await apiReq(
                            "GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`
                        );
                        injectEpEditBtns();
                    } catch (_) { /* non-critical */ }
                }
            }, 3500);

        } catch (e) {
            rfpStatus(`✗ ${e.message}`, "err");
            confirmBtn.disabled = cancelBtn.disabled = false;
        }
    }

    // Watch for SPA navigation (Sonarr uses React Router)
    (function watchNavigation() {
        const check = () => {
            if (/^\/series\/[^/]+/.test(location.pathname)) {
                clearTimeout(watchNavigation._t);
                watchNavigation._t = setTimeout(checkSeriesPage, 600);
            } else {
                document.getElementById("rg-fix-fab")?.remove();
                document.getElementById("rg-fix-panel")?.remove();
            }
        };
        const orig = history.pushState;
        history.pushState = function (...a) { orig.apply(this, a); check(); };
        window.addEventListener("popstate", check);
        check();
    })();

    // ══════════════════════════════════════════════════════════════════════════
    //  OBSERVE MODALS
    // ══════════════════════════════════════════════════════════════════════════

    new MutationObserver(() => {
        // Release Group picker modal
        const rgModalBody = document.querySelector(
            "[class^='SelectReleaseGroupModalContent-modalBody']"
        );
        const rgTarget = rgModalBody?.querySelector("div");
        if (rgTarget) inject(rgTarget);

        // Interactive Import footer shortcuts
        const importFooter = document.querySelector(
            "[class*='InteractiveImportModalContent-footer']"
        );
        if (importFooter) injectImportShortcuts(importFooter);

        // Select Quality modal — detect by EnhancedSelectInput presence inside a modal body
        // Walk up from the EnhancedSelect button to find the closest innerModalBody
        const enhancedSelect = document.querySelector("[class*='EnhancedSelectInput-enhancedSelect']");
        if (enhancedSelect) {
            const modalInner = enhancedSelect.closest("[class*='ModalBody-innerModalBody']");
            if (modalInner) injectQualityPills(modalInner);
        }

        // Per-episode edit buttons (series page)
        injectEpEditBtns();

    }).observe(document.body, { childList: true, subtree: true });

})();
