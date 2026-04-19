"use strict";

/**
 * Lightweight SweetAlert-style progress dialog with per-step state tracking.
 *
 * Usage:
 *   const prog = createProgress("💡 Applying…", ["Step A", "Step B", "Step C"]);
 *   prog.update(0, "active", "1 / 10");
 *   prog.update(0, "done");
 *   prog.update(1, "active", "polling…");
 *   prog.update(1, "done");
 *   prog.finish("✓ Done!", 1500);   // auto-dismiss after 1.5 s
 *   // — or on error —
 *   prog.fail("✗ Something went wrong");  // shows error row + Close button
 *
 * Step states: "pending" | "active" | "done" | "error"
 */
export function createProgress(title, steps) {
    // Remove any leftover overlay from a previous run
    document.getElementById("rg-progress-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "rg-progress-overlay";

    const box = document.createElement("div");
    box.className = "rg-progress-box";
    box.innerHTML = `
        <div class="rg-progress-title">${title}</div>
        <div class="rg-progress-steps">
            ${steps.map((s, i) => `
            <div class="rg-progress-step rg-step-pending" data-idx="${i}">
                <span class="rg-step-icon"></span>
                <span class="rg-step-label">${s}</span>
                <span class="rg-step-extra"></span>
            </div>`).join("")}
        </div>
        <div class="rg-progress-msg"></div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));

    // ── Helpers ──────────────────────────────────────────────────────────────
    function getStepEl(idx) {
        return box.querySelector(`.rg-progress-step[data-idx="${idx}"]`);
    }

    function dismiss(delayMs = 0) {
        setTimeout(() => {
            overlay.classList.remove("open");
            setTimeout(() => overlay.remove(), 300);
        }, delayMs);
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        /**
         * Set a step's visual state.
         * @param {number} idx   - 0-based step index
         * @param {"pending"|"active"|"done"|"error"} state
         * @param {string} [extra] - short detail shown on the right (e.g. "3 / 10")
         */
        update(idx, state, extra = "") {
            const row = getStepEl(idx);
            if (!row) return;
            row.className = `rg-progress-step rg-step-${state}`;
            const extraEl = row.querySelector(".rg-step-extra");
            if (extraEl) extraEl.textContent = extra;
        },

        /**
         * Show success message and auto-dismiss after delayMs.
         */
        finish(msg, delayMs = 0) {
            const msgEl = box.querySelector(".rg-progress-msg");
            if (msgEl) { msgEl.textContent = msg; msgEl.className = "rg-progress-msg success"; }
            dismiss(delayMs);
        },

        /**
         * Show error message and add a manual Close button.
         */
        fail(msg) {
            const msgEl = box.querySelector(".rg-progress-msg");
            if (msgEl) { msgEl.textContent = msg; msgEl.className = "rg-progress-msg error"; }
            const closeBtn = document.createElement("button");
            closeBtn.className = "rg-progress-close-btn";
            closeBtn.textContent = "Close";
            closeBtn.addEventListener("click", () => dismiss(0));
            box.appendChild(closeBtn);
        },

        /** Immediately dismiss (with optional animation delay). */
        dismiss,
    };
}
