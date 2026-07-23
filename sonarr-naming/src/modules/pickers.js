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

// ── Searchable multi-select (select2 style: chips + dropdown) ────────────────

/**
 * Compact multi-select: selected values show as removable chips; a "+ add"
 * button opens a searchable dropdown of the remaining options. Same
 * { el, get, set } contract as makeMultiPills, so it's a drop-in replacement
 * that doesn't overflow when the option list is long.
 *
 * @param {{label:string,value:string}[]} items
 * @param {string[]} initValues
 * @param {() => void} onChange
 * @param {string} placeholder  – noun for the "+ add {placeholder}" button
 * @param {number} max          – cap on selected values (0 = unlimited)
 */
export function makeSelect2(items, initValues, onChange, placeholder = "add", max = 0) {
    const wrap = document.createElement("div");
    wrap.className = "s2-wrap";

    const box = document.createElement("div");
    box.className = "s2-box";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "s2-add";
    addBtn.textContent = `+ ${placeholder}`;
    box.appendChild(addBtn);

    // The dropdown is appended to <body> (not the wrap) and positioned with
    // fixed coordinates, so a scrolling/overflow-hidden ancestor never clips it
    // — this is how select2 floats its menu.
    const pop = document.createElement("div");
    pop.className = "s2-pop";
    const search = document.createElement("input");
    search.type = "text";
    search.className = "s2-search";
    search.placeholder = "Search…";
    const optsEl = document.createElement("div");
    optsEl.className = "s2-opts";
    pop.append(search, optsEl);

    wrap.append(box);

    const selected = [];              // values, in selection order
    const optEls   = new Map();       // value → option element

    items.forEach(it => {
        const o = document.createElement("button");
        o.type = "button";
        o.className = "s2-opt";
        o.textContent = it.label;
        o.dataset.value  = it.value;
        o.dataset.search = `${it.label} ${it.value}`.toLowerCase();
        o.addEventListener("click", () => { add(it.value); search.value = ""; filter(); });
        optsEl.appendChild(o);
        optEls.set(it.value, o);
    });

    function chipFor(value) {
        const it = items.find(i => i.value === value);
        const chip = document.createElement("span");
        chip.className = "s2-chip";
        chip.innerHTML = `<span></span><span class="s2-x" title="remove">✕</span>`;
        chip.firstChild.textContent = it ? it.label : value;
        chip.querySelector(".s2-x").addEventListener("click", e => { e.stopPropagation(); remove(value); });
        box.insertBefore(chip, addBtn);
    }
    function renderChips() {
        [...box.querySelectorAll(".s2-chip")].forEach(c => c.remove());
        selected.forEach(chipFor);
    }
    const atMax = () => max > 0 && selected.length >= max;
    function add(value, silent) {
        if (selected.includes(value) || atMax()) return;
        selected.push(value);
        chipFor(value);
        filter();
        if (!silent) onChange();
    }
    function remove(value) {
        const i = selected.indexOf(value);
        if (i < 0) return;
        selected.splice(i, 1);
        renderChips();
        filter();
        onChange();
    }
    function filter() {
        const q = search.value.toLowerCase();
        const full = atMax();
        optEls.forEach((el, v) =>
            el.classList.toggle("s2-hide", full || selected.includes(v) || (q && !el.dataset.search.includes(q))));
        addBtn.style.display = full ? "none" : "";
    }

    let open = false;
    function place() {
        const r = box.getBoundingClientRect();
        pop.style.left  = `${r.left}px`;
        pop.style.top   = `${r.bottom + 4}px`;
        pop.style.width = `${r.width}px`;
    }
    function openPop() {
        open = true;
        document.body.appendChild(pop);
        place();
        pop.classList.add("open");
        search.value = ""; filter(); search.focus();
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
    }
    function closePop() {
        open = false;
        pop.classList.remove("open");
        pop.remove();
        window.removeEventListener("scroll", place, true);
        window.removeEventListener("resize", place);
    }
    box.addEventListener("click", e => { if (!e.target.closest(".s2-chip")) (open ? closePop() : openPop()); });
    search.addEventListener("input", filter);
    document.addEventListener("click", e => {
        if (open && !wrap.contains(e.target) && !pop.contains(e.target)) closePop();
    }, true);

    (initValues ?? []).forEach(v => add(v, true));

    const get = () => [...selected];
    const set = (values, silent) => {
        selected.length = 0;
        (values ?? []).forEach(v => { if (!selected.includes(v)) selected.push(v); });
        renderChips();
        filter();
        if (!silent) onChange();
    };
    return { el: wrap, get, set };
}

// ── Multi-part / version token pills (single-select, click again to clear) ───

/**
 * Single-select part/version picker. Values are the canonical bracket tokens
 * PT1…PT5 (multi-part) and V1…V4 (multi-version); one selection per file. An
 * active token outside the defaults is prepended so it is never dropped.
 */
export function makePartPills(activeToken, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "rg-pills";

    const tokens = ["PT1", "PT2", "PT3", "PT4", "PT5", "V1", "V2", "V3", "V4"];
    if (activeToken && !tokens.includes(activeToken)) tokens.unshift(activeToken);

    tokens.forEach(tok => {
        const p = document.createElement("div");
        p.className = "rg-pill part";
        p.textContent = tok;
        p.dataset.value = tok;
        if (tok === activeToken) p.classList.add("active");
        p.addEventListener("click", () => {
            const wasActive = p.classList.contains("active");
            wrap.querySelectorAll(".rg-pill").forEach(x => x.classList.remove("active"));
            if (!wasActive) p.classList.add("active");
            onChange();
        });
        wrap.appendChild(p);
    });

    const get = () => wrap.querySelector(".rg-pill.active")?.dataset.value ?? null;
    return { el: wrap, get };
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
