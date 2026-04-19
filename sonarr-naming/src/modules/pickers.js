import { NETWORKS, EDITIONS, LANGS, MAX_LANG } from "./constants.js";
import { incLangStat, sortedLangs } from "./lang.js";

// ── Multi-select pills (Network / Edition — toggle any number) ────────────────

export function makeMultiPills(items, extraClass, activeValues, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "rg-pills";

    items.forEach(item => {
        const p = document.createElement("div");
        p.className = `rg-pill ${extraClass}`;
        p.textContent = item.label;
        p.dataset.value = item.value;
        if (activeValues.includes(item.value)) p.classList.add("active");
        p.addEventListener("click", () => {
            p.classList.toggle("active");
            onChange();
        });
        wrap.appendChild(p);
    });

    // Returns ordered array of selected values (in pill order)
    const get = () =>
        [...wrap.querySelectorAll(".rg-pill.active")].map(p => p.dataset.value);
    // Set active values without triggering onChange (silent=true) or with (silent=false)
    const set = (values, silent) => {
        wrap.querySelectorAll(".rg-pill").forEach(p =>
            p.classList.toggle("active", values.includes(p.dataset.value)));
        if (!silent) onChange();
    };
    return { el: wrap, get, set };
}

// ── Language picker (searchable inline, no dropdown) ─────────────────────────

export function makeLangPicker(colLabel, initCodes, onChange) {
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
    sortedLangs().forEach(lang => {
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
            incLangStat(lang.value); // track usage — drives sort order next open
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
    // Replace current selection with new codes, optionally silently
    const set = (codes, silent) => {
        selected.length = 0;
        codes.forEach(c => selected.push(c));
        grid.querySelectorAll(".rg-lang-option").forEach(opt =>
            opt.classList.toggle("chosen", selected.includes(opt.dataset.value)));
        renderChips();
        if (!silent) onChange();
    };
    return { el: root, get, set };
}
