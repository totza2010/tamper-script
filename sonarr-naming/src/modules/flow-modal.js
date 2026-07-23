"use strict";

// ── Shared workflow modal ────────────────────────────────────────────────────
//
// One overlay whose inner .rgm-modal content is swapped between steps
// (Suggest Release Group → Rename → Strip). Entry points that continue a flow
// pass their existing overlay as the host; standalone triggers create a fresh
// one. Either way the chrome is the shared light .rgm-* modal.

const FLOW_ID = "rg-flow-panel";

/** Close and remove an rgm overlay. */
export function closeOverlay(el) {
    if (!el) return;
    el.classList.remove("open");
    if (el._onKey) document.removeEventListener("keydown", el._onKey);
    setTimeout(() => el.remove(), 200);
}

/** Return the shared flow overlay, creating (and opening) it if needed. */
export function getFlowOverlay() {
    let el = document.getElementById(FLOW_ID);
    if (el && el.classList.contains("rgm-overlay")) return el;
    el?.remove();

    el = document.createElement("div");
    el.id = FLOW_ID;
    el.className = "rgm-overlay";
    el.innerHTML = `<div class="rgm-modal"></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("open"));

    el._onKey = e => { if (e.key === "Escape") closeOverlay(el); };
    document.addEventListener("keydown", el._onKey);
    // Backdrop blocks page clicks but does not close — prevents accidental dismiss
    el.addEventListener("mousedown", e => { if (e.target === el) { e.preventDefault(); e.stopPropagation(); } });
    return el;
}

/**
 * Render a step's chrome into the overlay's .rgm-modal and return the modal
 * element. `body`/`footer` are HTML strings; the caller then queries the
 * returned element to append JS-built parts and wire handlers.
 *
 * @param {Element} overlay
 * @param {{ title: string, wide?: boolean, body: string, footer: string }} step
 */
export function renderStep(overlay, { title, wide = false, body, footer }) {
    const modal = overlay.querySelector(".rgm-modal");
    modal.className = "rgm-modal" + (wide ? " rgm-modal--wide" : "");
    modal.innerHTML = `
        <div class="rgm-head">
            <span class="rgm-title">${title}</span>
            <span class="rgm-close">✕</span>
        </div>
        ${body}
        ${footer}`;
    modal.querySelector(".rgm-close").addEventListener("click", () => closeOverlay(overlay));
    return modal;
}
