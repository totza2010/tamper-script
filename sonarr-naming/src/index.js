"use strict";

import './scss/main.scss';

// ── Module imports ────────────────────────────────────────────────────────────
import { NETWORKS, EDITIONS } from "./modules/constants.js";
import { applySavedNetworks } from "./modules/settings.js";
import { injectEpEditBtns } from "./modules/ep-editor.js";
import { initFABs, watchNavigation } from "./modules/series-page.js";
import { makeMultiPills, makeLangPicker } from "./modules/pickers.js";
import { parseRG, buildValue } from "./modules/rg-parser.js";

// ── Apply saved settings ──────────────────────────────────────────────────────
applySavedNetworks();

// ── Initialize persistent FABs ────────────────────────────────────────────────
initFABs();

// ── React value setter helper ─────────────────────────────────────────────────
function setReactValue(input, value) {
    const nativeSet = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
    ).set;
    nativeSet.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

// ── Release Group modal row helper ────────────────────────────────────────────
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

// ── Release Group modal injection ─────────────────────────────────────────────
function inject(target) {
    if (target.dataset.rgInjected) return;
    target.dataset.rgInjected = "true";

    const releaseInput = document.querySelector("input[name='releaseGroup']");
    if (!releaseInput) return;

    const parsed = parseRG(releaseInput.value);
    const container = document.createElement("div");
    container.id = "rg-container";

    // Network (multi-select)
    const netComp = makeMultiPills(NETWORKS, "net", parsed.networks, sync);
    container.appendChild(makeRow("Network", netComp.el));

    // Edition (multi-select)
    const edtComp = makeMultiPills(EDITIONS, "edt", parsed.editions, sync);
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
        const nets  = netComp.get();   // string[]
        const edts  = edtComp.get();   // string[]
        const audio = audioComp.get();
        const sub   = subComp.get();
        const value = buildValue(nets, edts, audio, sub);

        preview.textContent = value || "—";
        preview.className   = !value ? "empty"
                            : nets.length || edts.length ? "has-network" : "";

        setReactValue(releaseInput, value);
    }

    sync();
}

// ── Interactive Import footer shortcuts ───────────────────────────────────────
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

// ── Quality picker shortcuts ──────────────────────────────────────────────────
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

// ── MutationObserver — observe modals ────────────────────────────────────────
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

// ── Start SPA navigation watcher ─────────────────────────────────────────────
watchNavigation();
