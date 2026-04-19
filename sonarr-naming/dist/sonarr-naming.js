/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/modules/api.js"
/*!****************************!*\
  !*** ./src/modules/api.js ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   apiReq: () => (/* binding */ apiReq),
/* harmony export */   waitForCommand: () => (/* binding */ waitForCommand)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");


// ── Sonarr API (used by series-page fix feature) ──────────────────────────────

async function apiReq(method, path, body) {
  const headers = {
    "Content-Type": "application/json"
  };
  const key = GM_getValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.APIKEY_KEY, "");
  if (key) headers["X-Api-Key"] = key;
  const opts = {
    method,
    credentials: "include",
    headers
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  let res = await fetch(path, opts);
  if (res.status === 401) {
    const newKey = window.prompt("Sonarr API Key (Settings → General → API Key):");
    if (!newKey) throw new Error("API key required");
    GM_setValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.APIKEY_KEY, newKey);
    headers["X-Api-Key"] = newKey;
    res = await fetch(path, {
      ...opts,
      headers
    });
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
async function waitForCommand(cmdId, onStatus, maxMs = 300_000) {
  const INTERVAL = 2000;
  const deadline = Date.now() + maxMs;
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

/***/ },

/***/ "./src/modules/constants.js"
/*!**********************************!*\
  !*** ./src/modules/constants.js ***!
  \**********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   APIKEY_KEY: () => (/* binding */ APIKEY_KEY),
/* harmony export */   EDITIONS: () => (/* binding */ EDITIONS),
/* harmony export */   HDTV_FIX: () => (/* binding */ HDTV_FIX),
/* harmony export */   LANGS: () => (/* binding */ LANGS),
/* harmony export */   LANG_NAME_MAP: () => (/* binding */ LANG_NAME_MAP),
/* harmony export */   LANG_PINNED: () => (/* binding */ LANG_PINNED),
/* harmony export */   LANG_STATS_KEY: () => (/* binding */ LANG_STATS_KEY),
/* harmony export */   MAX_LANG: () => (/* binding */ MAX_LANG),
/* harmony export */   NETWORKS: () => (/* binding */ NETWORKS),
/* harmony export */   RG_PREFIX_RE: () => (/* binding */ RG_PREFIX_RE)
/* harmony export */ });
// ── Static data ───────────────────────────────────────────────────────────────

const NETWORKS = [
// ── Thai / Southeast Asia ────────────────────────────────────────────
{
  label: "TrueID",
  value: "TrueID"
}, {
  label: "Viu",
  value: "VIU"
}, {
  label: "WeTV",
  value: "WeTV"
}, {
  label: "iQIYI",
  value: "IQ"
}, {
  label: "MONO MAX",
  value: "MONOMAX"
}, {
  label: "NANA",
  value: "NANA"
}, {
  label: "LINE TV",
  value: "LINETV"
}, {
  label: "AIS Play",
  value: "AIS"
},
// ── China / Japan / Korea ────────────────────────────────────────────
{
  label: "YouKu",
  value: "YOUKU"
}, {
  label: "Bilibili",
  value: "BL"
}, {
  label: "MGTV",
  value: "MGTV"
}, {
  label: "Crunchyroll",
  value: "CR"
}, {
  label: "HIDIVE",
  value: "HIDIVE"
}, {
  label: "Viki",
  value: "VIKI"
},
// ── Global ───────────────────────────────────────────────────────────
{
  label: "Netflix",
  value: "NF"
}, {
  label: "Disney+",
  value: "DSNP"
}, {
  label: "Max",
  value: "MAX"
}, {
  label: "HBO",
  value: "HBO"
}, {
  label: "Amazon",
  value: "AMZN"
}, {
  label: "Apple TV+",
  value: "ATVP"
}, {
  label: "Hulu",
  value: "HULU"
}, {
  label: "Peacock",
  value: "PCOK"
}, {
  label: "Paramount+",
  value: "PMTP"
}, {
  label: "Showtime",
  value: "SHO"
}];
const EDITIONS = [{
  label: "Uncensored",
  value: "Uncensored"
}, {
  label: "Uncut",
  value: "Uncut"
}, {
  label: "Unrated",
  value: "Unrated"
}, {
  label: "Extended",
  value: "Extended"
}, {
  label: "Director's Cut",
  value: "DirectorsCut"
}, {
  label: "Theatrical",
  value: "Theatrical"
}, {
  label: "Remastered",
  value: "Remastered"
}, {
  label: "Collector's",
  value: "Collectors"
}, {
  label: "Translate",
  value: "Translate"
}];
const LANGS = [
// ── Priority (most common in Asian streaming) — appear at top of picker ──
{
  label: "Thai",
  value: "TH"
}, {
  label: "English",
  value: "EN"
}, {
  label: "Chinese",
  value: "ZH"
}, {
  label: "Japanese",
  value: "JA"
}, {
  label: "Korean",
  value: "KO"
}, {
  label: "Malay",
  value: "MS"
}, {
  label: "Indonesian",
  value: "ID"
}, {
  label: "Vietnamese",
  value: "VI"
}, {
  label: "Tagalog",
  value: "TL"
}, {
  label: "Burmese",
  value: "MY"
}, {
  label: "Khmer",
  value: "KM"
}, {
  label: "Lao",
  value: "LO"
}, {
  label: "Hindi",
  value: "HI"
}, {
  label: "Arabic",
  value: "AR"
},
// ── European & others (alphabetical) ────────────────────────────────
{
  label: "Bulgarian",
  value: "BG"
}, {
  label: "Catalan",
  value: "CA"
}, {
  label: "Croatian",
  value: "HR"
}, {
  label: "Czech",
  value: "CS"
}, {
  label: "Danish",
  value: "DA"
}, {
  label: "Dutch",
  value: "NL"
}, {
  label: "Estonian",
  value: "ET"
}, {
  label: "Finnish",
  value: "FI"
}, {
  label: "French",
  value: "FR"
}, {
  label: "German",
  value: "DE"
}, {
  label: "Greek",
  value: "EL"
}, {
  label: "Hebrew",
  value: "HE"
}, {
  label: "Hungarian",
  value: "HU"
}, {
  label: "Italian",
  value: "IT"
}, {
  label: "Latvian",
  value: "LV"
}, {
  label: "Lithuanian",
  value: "LT"
}, {
  label: "Norwegian",
  value: "NO"
}, {
  label: "Polish",
  value: "PL"
}, {
  label: "Portuguese",
  value: "PT"
}, {
  label: "Romanian",
  value: "RO"
}, {
  label: "Russian",
  value: "RU"
}, {
  label: "Serbian",
  value: "SR"
}, {
  label: "Slovak",
  value: "SK"
}, {
  label: "Slovenian",
  value: "SL"
}, {
  label: "Spanish",
  value: "ES"
}, {
  label: "Swedish",
  value: "SV"
}, {
  label: "Turkish",
  value: "TR"
}, {
  label: "Ukrainian",
  value: "UK"
}];

// ── Language name / code → ISO 639-1 2-char code ─────────────────────────
// Covers:
//   • Full names  (from file.languages[].name  e.g. "Thai", "Korean")
//   • ISO 639-2/T (from mediaInfo.audioLanguages e.g. "tha", "kor", "eng/tha")
//   • ISO 639-2/B alternates (e.g. "chi" for Chinese, "ger" for German)
const LANG_NAME_MAP = {
  // ── ISO 639-2/T codes (used by MediaInfo → Sonarr mediaInfo fields) ─
  "tha": "TH",
  "eng": "EN",
  "zho": "ZH",
  "chi": "ZH",
  "jpn": "JA",
  "kor": "KO",
  "msa": "MS",
  "may": "MS",
  "ind": "ID",
  "vie": "VI",
  "tgl": "TL",
  "mya": "MY",
  "bur": "MY",
  "khm": "KM",
  "lao": "LO",
  "hin": "HI",
  "ara": "AR",
  "bul": "BG",
  "cat": "CA",
  "hrv": "HR",
  "ces": "CS",
  "cze": "CS",
  "dan": "DA",
  "nld": "NL",
  "dut": "NL",
  "est": "ET",
  "fin": "FI",
  "fra": "FR",
  "fre": "FR",
  "deu": "DE",
  "ger": "DE",
  "ell": "EL",
  "gre": "EL",
  "heb": "HE",
  "hun": "HU",
  "ita": "IT",
  "lav": "LV",
  "lit": "LT",
  "nor": "NO",
  "pol": "PL",
  "por": "PT",
  "ron": "RO",
  "rum": "RO",
  "rus": "RU",
  "srp": "SR",
  "slk": "SK",
  "slo": "SK",
  "slv": "SL",
  "spa": "ES",
  "swe": "SV",
  "tur": "TR",
  "ukr": "UK"
};

// HDTV quality id → WEBDL replacement (standard Sonarr quality IDs)
const HDTV_FIX = {
  4: {
    id: 5,
    name: "WEBDL-720p"
  },
  // HDTV-720p  → WEBDL-720p
  9: {
    id: 3,
    name: "WEBDL-1080p"
  },
  // HDTV-1080p → WEBDL-1080p
  16: {
    id: 19,
    name: "WEBDL-2160p"
  } // HDTV-2160p → WEBDL-2160p
};
const MAX_LANG = 4;

// Languages pinned at the top regardless of usage stats
const LANG_PINNED = ["TH", "EN"];

// ── Language usage stats ──────────────────────────────────────────────────
const LANG_STATS_KEY = `rg_langstats_${location.hostname}`;
const APIKEY_KEY = `sonarr_apikey_${location.hostname}`;

// Matches one OR MORE consecutive [bracket] groups followed by "-"
// e.g. "[TrueID]-"  "[TrueID][IQ]-"  "[TrueID][IQ][Extended]-"
const RG_PREFIX_RE = /^(?:\[[^\]]+\])+-/;

/***/ },

/***/ "./src/modules/ep-editor.js"
/*!**********************************!*\
  !*** ./src/modules/ep-editor.js ***!
  \**********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   injectEpEditBtns: () => (/* binding */ injectEpEditBtns),
/* harmony export */   openEpRGEditor: () => (/* binding */ openEpRGEditor),
/* harmony export */   refetchFilesAndReInject: () => (/* binding */ refetchFilesAndReInject)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");
/* harmony import */ var _state_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./state.js */ "./src/modules/state.js");
/* harmony import */ var _api_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./api.js */ "./src/modules/api.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./utils.js */ "./src/modules/utils.js");
/* harmony import */ var _rg_parser_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./rg-parser.js */ "./src/modules/rg-parser.js");
/* harmony import */ var _pickers_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./pickers.js */ "./src/modules/pickers.js");
/* harmony import */ var _rename_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./rename.js */ "./src/modules/rename.js");








// ── Per-episode Release Group editor ─────────────────────────────────────────

/** Open floating Release Group editor anchored to `anchorEl`, editing `file`.
 *  @param {Element}  anchorEl  – the ✎ button element
 *  @param {Object}   file      – episode file object from _spData.files
 *  @param {Object}   [ep]      – episode metadata from _spData.epMap (optional)
 */
function openEpRGEditor(anchorEl, file, ep = null) {
  var _document$getElementB, _file$relativePath;
  (_document$getElementB = document.getElementById("ep-rg-popup")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
  const parsed = (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.parseRG)(file.releaseGroup || "");
  const popup = document.createElement("div");
  popup.id = "ep-rg-popup";

  // Position — prefer below the button; flip above if insufficient room.
  // max-height is set dynamically so overflow-y: auto always has a constrained box to scroll within.
  const rect = anchorEl.getBoundingClientRect();
  const MARGIN = 10;
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
  const spaceAbove = rect.top - MARGIN;
  let topPx, maxH;
  if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
    // Open downward
    topPx = rect.bottom + 6;
    maxH = spaceBelow - 6;
  } else {
    // Open upward — estimate height then anchor bottom to button top
    const estimatedH = Math.min(560, spaceAbove);
    topPx = Math.max(MARGIN, rect.top - estimatedH - 6);
    maxH = spaceAbove - 6;
  }
  popup.style.top = `${Math.max(MARGIN, topPx)}px`;
  popup.style.maxHeight = `${Math.max(180, maxH)}px`;
  popup.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 434))}px`;

  // Header
  const head = document.createElement("div");
  head.className = "ep-pop-head";
  head.innerHTML = `✎ Edit Release Group <span class="ep-pop-close">✕</span>`;
  popup.appendChild(head);

  // Episode info box (for re-verification)
  const epLabel = ep ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.fmtEp)(ep) : "";
  const epTitle = (ep === null || ep === void 0 ? void 0 : ep.title) ?? "";
  const fname = ((_file$relativePath = file.relativePath) === null || _file$relativePath === void 0 ? void 0 : _file$relativePath.split(/[/\\]/).pop()) ?? "";
  if (epLabel || fname) {
    const info = document.createElement("div");
    info.className = "ep-pop-epinfo";
    info.innerHTML = `
            ${epLabel ? `<div class="ep-pop-epinfo-label">${epLabel}${epTitle ? ` — ${epTitle}` : ""}</div>` : ""}
            ${fname ? `<div class="ep-pop-epinfo-path">${fname}</div>` : ""}
            <div class="ep-pop-epinfo-rg">Current RG: <code>${file.releaseGroup || "(none)"}</code></div>`;
    popup.appendChild(info);
  }

  // Network (multi-select)
  const netRow = makeEpPopRow("Network");
  const netComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeMultiPills)(_constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS, "net", parsed.networks, sync);
  netRow.appendChild(netComp.el);

  // Edition (multi-select)
  const edtRow = makeEpPopRow("Edition");
  const edtComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeMultiPills)(_constants_js__WEBPACK_IMPORTED_MODULE_0__.EDITIONS, "edt", parsed.editions, sync);
  edtRow.appendChild(edtComp.el);

  // Language (dual)
  const langRow = makeEpPopRow("Language");
  const dual = document.createElement("div");
  dual.className = "rg-dual";
  const audioComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeLangPicker)("Audio", parsed.audioCodes, sync);
  const subComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeLangPicker)("Subtitle", parsed.subCodes, sync);
  dual.append(audioComp.el, subComp.el);
  langRow.appendChild(dual);

  // Preview
  const prevRow = makeEpPopRow("Preview");
  const preview = document.createElement("div");
  preview.className = "ep-pop-preview empty";
  preview.textContent = "—";
  prevRow.appendChild(preview);

  // Buttons
  const btns = document.createElement("div");
  btns.className = "ep-pop-btns";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "ep-pop-btn ep-pop-cancel";
  cancelBtn.textContent = "Cancel";
  const saveBtn = document.createElement("button");
  saveBtn.className = "ep-pop-btn ep-pop-save";
  saveBtn.textContent = "Save";
  btns.append(cancelBtn, saveBtn);
  popup.append(netRow, edtRow, langRow, prevRow, btns);
  document.body.appendChild(popup);
  function makeEpPopRow(label) {
    const row = document.createElement("div");
    row.className = "ep-pop-row";
    const lbl = document.createElement("div");
    lbl.className = "ep-pop-lbl";
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }
  function sync() {
    const nets = netComp.get(),
      edts = edtComp.get();
    const val = (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)(nets, edts, audioComp.get(), subComp.get());
    preview.textContent = val || "—";
    preview.className = "ep-pop-preview" + (!val ? " empty" : nets.length || edts.length ? " has-network" : "");
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
    const value = (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)(netComp.get(), edtComp.get(), audioComp.get(), subComp.get());
    saveBtn.disabled = true;
    try {
      // 1. PUT
      saveBtn.textContent = "Saving…";
      await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("PUT", `/api/v3/episodefile/${file.id}`, {
        ...file,
        releaseGroup: value
      });

      // 2. Wait for Sonarr DB commit
      saveBtn.textContent = "Verifying…";
      await new Promise(r => setTimeout(r, 500));

      // 3. Re-fetch to confirm the change actually applied
      const fresh = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", `/api/v3/episodefile/${file.id}`);
      if (fresh.releaseGroup !== value) {
        throw new Error(`Not saved — got: "${fresh.releaseGroup}"`);
      }

      // 4. Update local cache with fresh data
      const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
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
          const textNode = [...rgCell.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
          if (textNode) {
            textNode.textContent = value;
          } else {
            rgCell.insertBefore(document.createTextNode(value), anchorEl);
          }
          // Refresh button tooltip with new value
          const latestSpData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
          const latestEpArr = latestSpData === null || latestSpData === void 0 ? void 0 : latestSpData.epMap.get(file.id);
          const latestEp0 = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(latestEpArr);
          anchorEl.title = latestEpArr ? `Edit RG — ${(0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.fmtEp)(latestEpArr)} ${(latestEp0 === null || latestEp0 === void 0 ? void 0 : latestEp0.title) ?? ""} (${value || "—"})` : `Edit Release Group (${value || "—"})`;
          // NOTE: intentionally do NOT delete epEditAdded —
          // deleting it causes MutationObserver to inject a duplicate button.
          // The click handler always reads _spData.files (updated in step 4)
          // so the existing button stays up-to-date without re-injection.
        }
      } catch (_) {/* DOM update is best-effort; ignore errors */}

      // 5b. Unified rename mismatch check (same as series-page load)
      const spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
      if (spData !== null && spData !== void 0 && spData.series) (0,_rename_js__WEBPACK_IMPORTED_MODULE_6__.checkRenameMismatch)(spData.series, [file.id]);
      // Strip-prefix check is intentionally NOT triggered here —
      // it only runs on page load or when the user presses the ✂ button.
    } catch (err) {
      const msg = err.message.startsWith("Not saved") ? `✗ ${err.message}` : "✗ Save failed";
      saveBtn.textContent = msg.slice(0, 34);
      saveBtn.style.background = "#5c1a1a";
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = "Retry";
        saveBtn.style.background = "";
      }, 3000);
    }
  });
}

/**
 * Re-fetch _spData.files from the API, then re-run injectEpEditBtns.
 *
 * Called when injectEpEditBtns finds a cell whose DOM path doesn't exist in the
 * cached file list (Sonarr renamed files asynchronously after strip/RG-edit).
 *
 * Uses a boolean flag instead of a timer so:
 *  - Only one fetch runs at a time (concurrent MutationObserver bursts are ignored)
 *  - No fixed delay — re-injection fires as soon as the API responds
 */
async function refetchFilesAndReInject() {
  const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
  if (!(_spData !== null && _spData !== void 0 && _spData.series) || (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.isRefetching)()) return;
  (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.setRefetching)(true);
  try {
    const fresh = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`);
    const currentSpData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
    if (currentSpData) currentSpData.files = fresh; // guard: user may have navigated away
    injectEpEditBtns();
  } catch (_) {/* non-critical */} finally {
    (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.setRefetching)(false);
  }
}
function injectEpEditBtns() {
  const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
  if (!_spData) return;
  if (!/^\/series\/[^/]+/.test(location.pathname)) return;

  // Determine "Relative Path" column index once from the <thead>
  // Sonarr marks column headers with a `label` attribute
  const headerThs = [...document.querySelectorAll("table thead th, thead th")];
  const pathColIdx = headerThs.findIndex(th => th.getAttribute("label") === "Relative Path" || th.textContent.trim() === "Relative Path");

  // Remove any stale duplicate buttons (can happen after page re-renders)
  document.querySelectorAll("td[class*='releaseGroup']").forEach(cell => {
    const btns = [...cell.querySelectorAll(".ep-rg-edit-btn")];
    if (btns.length > 1) btns.slice(1).forEach(b => b.remove());
  });

  // Use td selector to skip the <th> header cell (which also contains "releaseGroup" text)
  document.querySelectorAll("td[class*='releaseGroup']").forEach(cell => {
    var _tr$cells$pathColIdx;
    if (cell.dataset.epEditAdded) {
      // Flag is set — but React may have re-rendered this cell's content,
      // removing our button while keeping the <td> element (and its dataset).
      // Check that the button still actually exists; if not, clear the flag
      // so we fall through and re-inject it.
      if (cell.querySelector(".ep-rg-edit-btn")) return; // still intact, skip
      delete cell.dataset.epEditAdded; // React wiped our button — re-inject
    }
    const tr = cell.closest("tr");
    if (!tr) return;

    // Method 1: use column index from header label
    let pathTxt = pathColIdx >= 0 ? ((_tr$cells$pathColIdx = tr.cells[pathColIdx]) === null || _tr$cells$pathColIdx === void 0 ? void 0 : _tr$cells$pathColIdx.textContent.trim()) ?? "" : "";

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
    let hadPath = false; // true if we got a path string but couldn't match a file
    if (pathTxt) {
      // Exact relativePath match
      file = _spData.files.find(f => f.relativePath === pathTxt);
      // Filename-only match (strips leading season directory)
      if (!file) {
        const fname = pathTxt.split(/[/\\]/).pop().trim();
        if (fname) file = _spData.files.find(f => {
          var _f$relativePath;
          return ((_f$relativePath = f.relativePath) === null || _f$relativePath === void 0 ? void 0 : _f$relativePath.split(/[/\\]/).pop()) === fname;
        });
      }
      if (!file) hadPath = true; // path exists but no match → data is likely stale
    }

    // Last resort: unique release-group text (only safe if exactly 1 file has that RG)
    if (!file) {
      const rgText = cell.textContent.replace("✎", "").trim();
      if (rgText) {
        const hits = _spData.files.filter(f => (f.releaseGroup || "") === rgText);
        if (hits.length === 1) file = hits[0];
      }
    }
    if (!file) {
      // If we had a path but still couldn't match, _spData.files is stale
      // (Sonarr renamed files asynchronously — new DOM paths not in cache yet).
      // Fetch fresh data immediately; throttle prevents concurrent requests.
      if (hadPath) refetchFilesAndReInject();
      return;
    }
    const epArr = _spData.epMap.get(file.id) ?? [];
    const ep0 = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(epArr);
    const btn = document.createElement("span");
    btn.className = "ep-rg-edit-btn";
    btn.title = epArr.length ? `Edit RG — ${(0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.fmtEp)(epArr)} ${(ep0 === null || ep0 === void 0 ? void 0 : ep0.title) ?? ""} (${file.releaseGroup || "—"})` : `Edit Release Group (${file.releaseGroup || "—"})`;
    btn.textContent = "✎";
    btn.dataset.fileId = String(file.id); // visible in DevTools for debugging

    btn.addEventListener("click", e => {
      e.stopPropagation();
      const currentSpData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
      const latest = (currentSpData === null || currentSpData === void 0 ? void 0 : currentSpData.files.find(f => f.id === file.id)) ?? file;
      const latestEpArr = (currentSpData === null || currentSpData === void 0 ? void 0 : currentSpData.epMap.get(latest.id)) ?? [];
      openEpRGEditor(btn, latest, (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(latestEpArr));
    });
    cell.appendChild(btn);
    // Mark as processed ONLY after successful injection so failed-match cells
    // remain retryable (refetchFilesAndReInject will re-run injectEpEditBtns).
    cell.dataset.epEditAdded = "true";
  });
}

/***/ },

/***/ "./src/modules/lang.js"
/*!*****************************!*\
  !*** ./src/modules/lang.js ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   incLangStat: () => (/* binding */ incLangStat),
/* harmony export */   loadLangStats: () => (/* binding */ loadLangStats),
/* harmony export */   mapLangNameToCode: () => (/* binding */ mapLangNameToCode),
/* harmony export */   parseLangString: () => (/* binding */ parseLangString),
/* harmony export */   sortAudioCodes: () => (/* binding */ sortAudioCodes),
/* harmony export */   sortedLangs: () => (/* binding */ sortedLangs),
/* harmony export */   suggestRGFromFile: () => (/* binding */ suggestRGFromFile)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");


// ── Language helpers ──────────────────────────────────────────────────────────

function loadLangStats() {
  try {
    return JSON.parse(GM_getValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_STATS_KEY, "{}"));
  } catch {
    return {};
  }
}
function incLangStat(code) {
  const s = loadLangStats();
  s[code] = (s[code] || 0) + 1;
  GM_setValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_STATS_KEY, JSON.stringify(s));
}

/**
 * Returns LANGS sorted by usage count (desc).
 * LANG_PINNED codes (TH, EN) are always first in declaration order.
 * Ties are broken by original LANGS array order.
 */
function sortedLangs() {
  const s = loadLangStats();
  const pinned = _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_PINNED.map(c => _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANGS.find(l => l.value === c)).filter(Boolean);
  const rest = _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANGS.filter(l => !_constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_PINNED.includes(l.value)).sort((a, b) => (s[b.value] || 0) - (s[a.value] || 0));
  return [...pinned, ...rest];
}

/** Map a Sonarr mediaInfo language name to a 2-char ISO code, or "" if unknown. */
function mapLangNameToCode(name) {
  return _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_NAME_MAP[(name === null || name === void 0 ? void 0 : name.toLowerCase().trim()) ?? ""] ?? "";
}

/**
 * Split a Sonarr language string into 2-char codes.
 * Handles:
 *   "Thai / Korean"    → ["TH","KO"]  (full names, slash-separated)
 *   "eng/tha"          → ["EN","TH"]  (ISO 639-2, slash-separated)
 *   "eng/eng/tha/tha"  → ["EN","TH"]  (deduplicated)
 */
function parseLangString(str) {
  if (!str) return [];
  const codes = str.split(/[/,]/).map(s => mapLangNameToCode(s)).filter(Boolean);
  return [...new Set(codes)]; // deduplicate while preserving order
}

/**
 * Sort language codes by priority: TH → EN → originalCode → (others excluded).
 * Only the three "sanctioned" slots are kept; random extra languages are dropped.
 *
 * @param {string[]} codes        - deduplicated 2-letter codes from parseLangString
 * @param {string}   originalCode - 2-letter code of the series' original language
 *                                  (e.g. "KO" for Korean). Pass "" to keep legacy
 *                                  "include any 3" behaviour (backwards compat).
 */
function sortAudioCodes(codes, originalCode) {
  const PRIORITY = ["TH", "EN"];
  const result = PRIORITY.filter(c => codes.includes(c));
  // Add the series original language as 3rd slot only if it's available in the
  // tracks AND it isn't already captured by the fixed priority list above.
  if (originalCode && !PRIORITY.includes(originalCode) && codes.includes(originalCode)) {
    result.push(originalCode);
  }
  // No other languages are included — they are not part of our naming convention.
  return result.slice(0, 3);
}

/**
 * Compute suggested RG language parts from a file's mediaInfo + languages.
 *
 * Two data sources (most reliable first):
 *   1. file.mediaInfo.audioLanguages / file.mediaInfo.subtitles
 *      — populated by MediaInfo scan (may be empty if scan wasn't run)
 *   2. file.languages  [{id, name}]
 *      — recorded by Sonarr at import time; always present when Sonarr
 *        knows the language (this is what the "Thai, Korean" table column shows)
 *
 * Note: Sonarr's mediaInfo uses `subtitles` (NOT `subtitleLanguages`) for the
 * subtitle language string.
 *
 * Returns {audioCodes, subCodes} or null if no usable language data.
 *
 * @param {object} file          - Sonarr episodefile object
 * @param {string} originalCode  - 2-letter code of the series' original language
 *                                 e.g. "KO" — used to pick the 3rd-priority slot
 */
function suggestRGFromFile(file, originalCode) {
  let audioCodes = [];
  let subCodes = [];

  // Source 1: mediaInfo (actual file analysis)
  const mi = file.mediaInfo;
  if (mi) {
    audioCodes = parseLangString(mi.audioLanguages ?? "");
    // Sonarr uses "subtitles" (not "subtitleLanguages") in the mediaInfo schema
    subCodes = parseLangString(mi.subtitles ?? mi.subtitleLanguages ?? "");
  }

  // Source 2: file.languages [{id, name}]  — fallback when mediaInfo not scanned
  // (This is what Sonarr records at import time, and what the table column shows)
  if (!audioCodes.length && Array.isArray(file.languages) && file.languages.length) {
    audioCodes = [...new Set(file.languages.map(l => mapLangNameToCode(l.name ?? "")).filter(Boolean))];
  }

  // Apply priority ordering: TH → EN → series original language (max 3)
  // Random other languages (e.g. Indonesian for a Korean series) are excluded.
  audioCodes = sortAudioCodes(audioCodes, originalCode);
  subCodes = sortAudioCodes(subCodes, originalCode);
  if (!audioCodes.length && !subCodes.length) return null;
  return {
    audioCodes,
    subCodes
  };
}

/***/ },

/***/ "./src/modules/pickers.js"
/*!********************************!*\
  !*** ./src/modules/pickers.js ***!
  \********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   makeLangPicker: () => (/* binding */ makeLangPicker),
/* harmony export */   makeMultiPills: () => (/* binding */ makeMultiPills)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");
/* harmony import */ var _lang_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./lang.js */ "./src/modules/lang.js");



// ── Multi-select pills (Network / Edition — toggle any number) ────────────────

function makeMultiPills(items, extraClass, activeValues, onChange) {
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
  const get = () => [...wrap.querySelectorAll(".rg-pill.active")].map(p => p.dataset.value);
  // Set active values without triggering onChange (silent=true) or with (silent=false)
  const set = (values, silent) => {
    wrap.querySelectorAll(".rg-pill").forEach(p => p.classList.toggle("active", values.includes(p.dataset.value)));
    if (!silent) onChange();
  };
  return {
    el: wrap,
    get,
    set
  };
}

// ── Language picker (searchable inline, no dropdown) ─────────────────────────

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
  (0,_lang_js__WEBPACK_IMPORTED_MODULE_1__.sortedLangs)().forEach(lang => {
    const opt = document.createElement("div");
    opt.className = "rg-lang-option";
    opt.textContent = `${lang.label} (${lang.value})`;
    opt.dataset.value = lang.value;
    opt.dataset.label = lang.label.toLowerCase();
    if (selected.includes(lang.value)) opt.classList.add("chosen");
    opt.addEventListener("click", () => {
      if (selected.length >= _constants_js__WEBPACK_IMPORTED_MODULE_0__.MAX_LANG) return;
      if (selected.includes(lang.value)) return;
      selected.push(lang.value);
      (0,_lang_js__WEBPACK_IMPORTED_MODULE_1__.incLangStat)(lang.value); // track usage — drives sort order next open
      opt.classList.add("chosen");
      renderChips();
      onChange();
      if (selected.length >= _constants_js__WEBPACK_IMPORTED_MODULE_0__.MAX_LANG) closePanel();
    });
    grid.appendChild(opt);
  });
  panel.appendChild(grid);
  root.appendChild(panel);

  // Search filter
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    grid.querySelectorAll(".rg-lang-option").forEach(opt => {
      const match = opt.dataset.label.includes(q) || opt.dataset.value.toLowerCase().includes(q);
      opt.classList.toggle("hidden", !match);
    });
  });

  // Toggle panel
  let panelOpen = false;
  function openPanel() {
    panelOpen = true;
    panel.classList.add("open");
    searchInput.value = "";
    filterAll();
    searchInput.focus();
  }
  function closePanel() {
    panelOpen = false;
    panel.classList.remove("open");
  }
  function filterAll() {
    grid.querySelectorAll(".rg-lang-option").forEach(o => o.classList.remove("hidden"));
  }
  addBtn.addEventListener("click", () => panelOpen ? closePanel() : openPanel());

  // Close panel on outside click
  document.addEventListener("click", e => {
    if (panelOpen && !root.contains(e.target)) closePanel();
  }, true);

  // Render chips
  function renderChips() {
    // Remove all chips (keep addBtn)
    [...chipsRow.children].forEach(c => {
      if (c !== addBtn) c.remove();
    });
    selected.forEach(code => {
      const lang = _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANGS.find(l => l.value === code);
      if (!lang) return;
      const chip = document.createElement("div");
      chip.className = "rg-chip";
      chip.innerHTML = `${lang.label} <span class="rg-chip-x" data-code="${code}">×</span>`;
      chip.querySelector(".rg-chip-x").addEventListener("click", () => {
        var _grid$querySelector;
        const idx = selected.indexOf(code);
        if (idx !== -1) selected.splice(idx, 1);
        // Un-mark in grid
        (_grid$querySelector = grid.querySelector(`[data-value="${code}"]`)) === null || _grid$querySelector === void 0 || _grid$querySelector.classList.remove("chosen");
        renderChips();
        onChange();
      });
      chipsRow.insertBefore(chip, addBtn);
    });

    // Hide add btn when at max
    addBtn.style.display = selected.length >= _constants_js__WEBPACK_IMPORTED_MODULE_0__.MAX_LANG ? "none" : "";
  }
  renderChips();
  const get = () => [...selected];
  // Replace current selection with new codes, optionally silently
  const set = (codes, silent) => {
    selected.length = 0;
    codes.forEach(c => selected.push(c));
    grid.querySelectorAll(".rg-lang-option").forEach(opt => opt.classList.toggle("chosen", selected.includes(opt.dataset.value)));
    renderChips();
    if (!silent) onChange();
  };
  return {
    el: root,
    get,
    set
  };
}

/***/ },

/***/ "./src/modules/prefix-fix.js"
/*!***********************************!*\
  !*** ./src/modules/prefix-fix.js ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildFixUI: () => (/* binding */ buildFixUI),
/* harmony export */   executeGroupFix: () => (/* binding */ executeGroupFix),
/* harmony export */   prefixAlreadyInFilename: () => (/* binding */ prefixAlreadyInFilename),
/* harmony export */   recheckPrefixFiles: () => (/* binding */ recheckPrefixFiles)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");
/* harmony import */ var _state_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./state.js */ "./src/modules/state.js");
/* harmony import */ var _api_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./api.js */ "./src/modules/api.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./utils.js */ "./src/modules/utils.js");





// ── Series page — Auto-detect [network]- prefix in Release Group ──────────────

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
  var _rg$match;
  const rg = f.releaseGroup || "";
  if (!_constants_js__WEBPACK_IMPORTED_MODULE_0__.RG_PREFIX_RE.test(rg)) return false;
  // Full prefix e.g. "[TrueID][IQ]-" — RG_PREFIX_RE now covers multi-bracket
  const prefix = ((_rg$match = rg.match(_constants_js__WEBPACK_IMPORTED_MODULE_0__.RG_PREFIX_RE)) === null || _rg$match === void 0 ? void 0 : _rg$match[0]) ?? "";
  if (!prefix) return false;
  const basename = (f.relativePath || "").split(/[/\\]/).pop();
  // Filename may have the prefix embedded after quality brackets, e.g.
  // "S01E39 - [WEBDL-2160p]-[TrueID][IQ]-AudioTH…"
  // so we search for the prefix anywhere in the basename (not just at start)
  return basename.includes(prefix);
}

/** Re-fetch episode files and rebuild the Strip-prefix UI without page reload. */
async function recheckPrefixFiles() {
  var _document$getElementB;
  const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
  if (!(_spData !== null && _spData !== void 0 && _spData.series)) return;
  // Remove old fix UI so it refreshes cleanly
  (_document$getElementB = document.getElementById("rg-fix-panel")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
  try {
    const files = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`);
    _spData.files = files;
    const affected = files.filter(f => prefixAlreadyInFilename(f)).map(f => ({
      ...f,
      ep: _spData.epMap.get(f.id) ?? [],
      newReleaseGroup: (f.releaseGroup || "").replace(_constants_js__WEBPACK_IMPORTED_MODULE_0__.RG_PREFIX_RE, "")
    })).sort((a, b) => {
      const ae = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(a.ep),
        be = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(b.ep);
      const ds = ((ae === null || ae === void 0 ? void 0 : ae.seasonNumber) ?? 0) - ((be === null || be === void 0 ? void 0 : be.seasonNumber) ?? 0);
      return ds !== 0 ? ds : ((ae === null || ae === void 0 ? void 0 : ae.episodeNumber) ?? 0) - ((be === null || be === void 0 ? void 0 : be.episodeNumber) ?? 0);
    });
    if (affected.length > 0) {
      buildFixUI(_spData.series, affected);
    } else {
      (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.showToast)("✓ No [prefix]- files found");
    }
  } catch (e) {
    (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.showToast)("✗ " + e.message.slice(0, 60));
    console.warn("[RG Strip recheck]", e.message);
  }
}

// ── Build the confirmation panel with season/episode tree ──────────────────

function buildFixUI(series, affected) {
  var _document$getElementB2;
  (_document$getElementB2 = document.getElementById("rg-fix-panel")) === null || _document$getElementB2 === void 0 || _document$getElementB2.remove();
  const prefixes = [...new Set(affected.map(f => (f.releaseGroup.match(_constants_js__WEBPACK_IMPORTED_MODULE_0__.RG_PREFIX_RE) || [""])[0]))];
  const prefixLabel = prefixes.join(", ");

  // Group by season
  const bySeason = new Map();
  for (const f of affected) {
    var _firstEp;
    const sn = ((_firstEp = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(f.ep)) === null || _firstEp === void 0 ? void 0 : _firstEp.seasonNumber) ?? 0;
    if (!bySeason.has(sn)) bySeason.set(sn, []);
    bySeason.get(sn).push(f);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);

  // Selection state
  const checked = new Set(affected.map(f => f.id));

  // Panel
  const panel = document.createElement("div");
  panel.id = "rg-fix-panel";
  document.body.appendChild(panel);
  function updateConfirmBtn() {
    const btn = panel.querySelector("#rfp-confirm");
    if (btn) {
      btn.textContent = `✂ Strip & Rename (${checked.size})`;
      btn.disabled = checked.size === 0;
    }
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
                        <span class="rfp-ep-label">${(0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.fmtEp)(f.ep)}</span>
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
        epList.querySelectorAll(".rfp-ep-chk").forEach(ec => ec.checked = chk.checked);
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
  const stripNowDefault = GM_getValue("rfp_strip_now", false);

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
            <div class="rgsp-section-lbl" style="margin-top:8px">Strip option</div>
            <label class="rgsp-quality-row" style="margin-bottom:0">
                <input type="checkbox" class="rgsp-quality-chk" id="rfp-strip-now"
                    ${stripNowDefault ? "checked" : ""}>
                <span class="rgsp-quality-txt">
                    <span class="rgsp-quality-label">Strip & Rename immediately when opened</span>
                    <span class="rgsp-quality-detail">Uncheck to review and confirm manually</span>
                </span>
            </label>
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

  // Persist strip-now preference
  panel.querySelector("#rfp-strip-now").addEventListener("change", e => {
    GM_setValue("rfp_strip_now", e.target.checked);
  });

  // Always open the panel immediately
  requestAnimationFrame(() => panel.classList.add("open"));

  // If "strip immediately" is enabled, fire the strip command automatically
  if (stripNowDefault) {
    setTimeout(() => {
      executeGroupFix(series, affected.filter(f => checked.has(f.id)));
    }, 800);
  }
}

// ── Execute: all PUTs first, then rename ──────────────────────────────────

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
      await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("PUT", `/api/v3/episodefile/${f.id}`, {
        ...f,
        releaseGroup: f.newReleaseGroup
      });
    }

    // ── Step 2: Wait for Sonarr to commit all DB writes ──────────
    rfpStatus(`All ${selectedFiles.length} updated. Waiting for Sonarr…`, "loading");
    await new Promise(r => setTimeout(r, 600));

    // ── Step 3: Trigger rename ────────────────────────────────────
    rfpStatus("Renaming files…", "loading");
    const cmd = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("POST", "/api/v3/command", {
      name: "RenameFiles",
      seriesId: series.id,
      files: selectedFiles.map(f => f.id)
    });
    // Poll until Sonarr actually finishes renaming
    await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.waitForCommand)(cmd.id, st => rfpStatus(`Renaming… (${st})`, "loading"));
    rfpStatus(`✓ Done — ${selectedFiles.length} file(s) renamed.`, "ok");
    // Close UI; injectEpEditBtns will auto-refetch when React re-renders new paths.
    setTimeout(() => {
      var _document$getElementB3;
      (_document$getElementB3 = document.getElementById("rg-fix-panel")) === null || _document$getElementB3 === void 0 || _document$getElementB3.remove();
    }, 1500);
  } catch (e) {
    rfpStatus(`✗ ${e.message}`, "err");
    confirmBtn.disabled = cancelBtn.disabled = false;
  }
}

/***/ },

/***/ "./src/modules/rename.js"
/*!*******************************!*\
  !*** ./src/modules/rename.js ***!
  \*******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   checkRenameMismatch: () => (/* binding */ checkRenameMismatch),
/* harmony export */   showRenameNotif: () => (/* binding */ showRenameNotif)
/* harmony export */ });
/* harmony import */ var _api_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./api.js */ "./src/modules/api.js");


// ── Rename mismatch notification ──────────────────────────────────────────────

/**
 * Unified rename-mismatch checker.
 * Called from two places:
 *   1. After per-episode RG edit (fileIds = [id] — check only that file)
 *   2. Series page load with no prefix files (fileIds undefined — check all)
 *
 * Sonarr's /rename endpoint returns files whose current filename differs from
 * what Sonarr would generate given the current metadata.
 */
async function checkRenameMismatch(series, fileIds, afterRenameCb) {
  if (!series) return;
  try {
    const results = await (0,_api_js__WEBPACK_IMPORTED_MODULE_0__.apiReq)("GET", `/api/v3/rename?seriesId=${series.id}`);
    const pending = fileIds ? results.filter(r => fileIds.includes(r.episodeFileId)) : results;
    if (pending.length === 0) return;
    showRenameNotif(series, pending, afterRenameCb);
  } catch (e) {
    console.warn("[RG Rename]", e.message);
  }
}
function showRenameNotif(series, items, afterRenameCb) {
  var _document$getElementB;
  (_document$getElementB = document.getElementById("rg-rename-notif")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
  const notif = document.createElement("div");
  notif.id = "rg-rename-notif";
  const fileRows = items.slice(0, 5).map(r => {
    const oldName = r.existingPath.split(/[/\\]/).pop();
    const newName = r.newPath.split(/[/\\]/).pop();
    return `<div class="rn-file">
            <div class="rn-old">${oldName}</div>
            <div class="rn-arrow">↓</div>
            <div class="rn-new">${newName}</div>
        </div>`;
  }).join("");
  const more = items.length > 5 ? `<div style="color:#567;font-size:11px;padding:3px 0">…and ${items.length - 5} more</div>` : "";
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
  notif.querySelector(".rn-cancel").addEventListener("click", () => notif.remove());
  notif.querySelector("#rn-do-rename").addEventListener("click", async () => {
    const btn = notif.querySelector("#rn-do-rename");
    btn.disabled = true;
    btn.textContent = "Renaming…";
    try {
      const cmd = await (0,_api_js__WEBPACK_IMPORTED_MODULE_0__.apiReq)("POST", "/api/v3/command", {
        name: "RenameFiles",
        seriesId: series.id,
        files: items.map(r => r.episodeFileId)
      });
      // Poll until Sonarr actually finishes — then fire afterRenameCb
      await (0,_api_js__WEBPACK_IMPORTED_MODULE_0__.waitForCommand)(cmd.id, st => {
        btn.textContent = `Renaming… (${st})`;
      });
      btn.textContent = "✓ Done";
      if (afterRenameCb) afterRenameCb();
      setTimeout(() => notif.remove(), 1500);
    } catch (e) {
      btn.textContent = "✗ Error";
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = "Rename Now";
      }, 2500);
    }
  });
}

/***/ },

/***/ "./src/modules/rg-parser.js"
/*!**********************************!*\
  !*** ./src/modules/rg-parser.js ***!
  \**********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildValue: () => (/* binding */ buildValue),
/* harmony export */   needsRGSuggestion: () => (/* binding */ needsRGSuggestion),
/* harmony export */   parseRG: () => (/* binding */ parseRG)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");


// ── Parse existing Release Group ──────────────────────────────────────────────

function parseRG(raw) {
  // Supported prefix formats (both produced by Sonarr or by this script):
  //   A) Multiple brackets : [TrueID][NANA][Extended]-AudioTH…   ← our output
  //   B) Space-separated   : [TrueID NANA Extended]-AudioTH…     ← Sonarr {[Custom Formats]}
  //   C) No prefix         : AudioTHZHSubTHENZH

  // Find the end of the prefix block = last "]-" that is followed immediately
  // by an uppercase letter (start of Audio/Sub body) or end of string.
  // Using RG_PREFIX_RE to extract the full matched prefix, then slice the body.
  const prefixMatch = raw.match(_constants_js__WEBPACK_IMPORTED_MODULE_0__.RG_PREFIX_RE);
  const body = prefixMatch ? raw.slice(prefixMatch[0].length) : raw;

  // Collect bracket content only from the prefix region (not from body)
  const prefixStr = prefixMatch ? prefixMatch[0] : "";
  const brackets = [...prefixStr.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
  const audioM = body.match(/Audio([A-Z]{2}(?:[A-Z]{2})*)/);
  const subM = body.match(/Sub([A-Z]{2}(?:[A-Z]{2})*)/);

  // Expand each bracket entry: split on spaces to handle format B
  // e.g. "TrueID NANA Extended" → ["TrueID","NANA","Extended"]
  const tokens = brackets.flatMap(b => b.split(/\s+/).filter(Boolean));
  const networks = [],
    editions = [];
  tokens.forEach(t => {
    if (_constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.find(n => n.value === t || n.label === t)) networks.push(t);else if (_constants_js__WEBPACK_IMPORTED_MODULE_0__.EDITIONS.find(e => e.value === t || e.label === t)) editions.push(t);
  });
  return {
    networks,
    // e.g. ["TrueID","NANA"]
    editions,
    // e.g. ["Extended"]
    audioCodes: audioM ? audioM[1].match(/.{2}/g) ?? [] : [],
    subCodes: subM ? subM[1].match(/.{2}/g) ?? [] : []
  };
}

// ── Build output string ───────────────────────────────────────────────────────

// networks & editions are now arrays; audioCodes & subCodes remain arrays of 2-char codes
function buildValue(networks, editions, audioCodes, subCodes) {
  const prefix = [...networks, ...editions].map(v => `[${v}]`).join("");
  const parts = [];
  if (audioCodes.length) parts.push(`Audio${audioCodes.join("")}`);
  if (subCodes.length) parts.push(`Sub${subCodes.join("")}`);
  const lang = parts.join("");
  if (!prefix && !lang) return "";
  if (!prefix) return lang;
  return `${prefix}-${lang}`;
}

/**
 * Returns true if this file needs an RG suggestion:
 * releaseGroup is empty OR does not contain "Audio".
 */
function needsRGSuggestion(file) {
  return !(file.releaseGroup ?? "").includes("Audio");
}

/***/ },

/***/ "./src/modules/series-page.js"
/*!************************************!*\
  !*** ./src/modules/series-page.js ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   checkSeriesPage: () => (/* binding */ checkSeriesPage),
/* harmony export */   initFABs: () => (/* binding */ initFABs),
/* harmony export */   watchNavigation: () => (/* binding */ watchNavigation)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");
/* harmony import */ var _state_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./state.js */ "./src/modules/state.js");
/* harmony import */ var _api_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./api.js */ "./src/modules/api.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./utils.js */ "./src/modules/utils.js");
/* harmony import */ var _ep_editor_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ep-editor.js */ "./src/modules/ep-editor.js");
/* harmony import */ var _rename_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./rename.js */ "./src/modules/rename.js");
/* harmony import */ var _prefix_fix_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./prefix-fix.js */ "./src/modules/prefix-fix.js");
/* harmony import */ var _suggestion_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./suggestion.js */ "./src/modules/suggestion.js");
/* harmony import */ var _settings_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./settings.js */ "./src/modules/settings.js");










// ── Series page orchestration ─────────────────────────────────────────────────

function initFABs() {
  // Persistent ⚙ settings button
  const settingsBtn = document.createElement("div");
  settingsBtn.id = "rg-settings-btn";
  settingsBtn.title = "Script Settings";
  settingsBtn.textContent = "⚙";
  settingsBtn.addEventListener("click", _settings_js__WEBPACK_IMPORTED_MODULE_8__.openSettings);
  document.body.appendChild(settingsBtn);

  // ↺ Rename-check button
  const checkBtn = document.createElement("div");
  checkBtn.id = "rg-check-btn";
  checkBtn.className = "rg-fab-side";
  checkBtn.title = "Check rename mismatches now";
  checkBtn.textContent = "↺";
  checkBtn.addEventListener("click", async () => {
    const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
    if (!(_spData !== null && _spData !== void 0 && _spData.series) || checkBtn.classList.contains("spinning")) return;
    checkBtn.classList.add("spinning");
    try {
      var _document$getElementB;
      (_document$getElementB = document.getElementById("rg-rename-notif")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
      await (0,_rename_js__WEBPACK_IMPORTED_MODULE_5__.checkRenameMismatch)(_spData.series);
    } finally {
      checkBtn.classList.remove("spinning");
    }
  });
  document.body.appendChild(checkBtn);

  // ✂ Strip-prefix recheck button
  const stripBtn = document.createElement("div");
  stripBtn.id = "rg-strip-btn";
  stripBtn.className = "rg-fab-side";
  stripBtn.title = "Re-check [prefix]- Release Group files";
  stripBtn.textContent = "✂";
  stripBtn.addEventListener("click", async () => {
    const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
    if (!(_spData !== null && _spData !== void 0 && _spData.series) || stripBtn.classList.contains("spinning")) return;
    stripBtn.classList.add("spinning");
    try {
      await (0,_prefix_fix_js__WEBPACK_IMPORTED_MODULE_6__.recheckPrefixFiles)();
    } finally {
      stripBtn.classList.remove("spinning");
    }
  });
  document.body.appendChild(stripBtn);

  // 💡 RG Suggestion button
  const suggestBtn = document.createElement("div");
  suggestBtn.id = "rg-suggest-btn";
  suggestBtn.className = "rg-fab-side";
  suggestBtn.title = "Suggest Release Group from mediaInfo";
  suggestBtn.textContent = "💡";
  suggestBtn.addEventListener("click", async () => {
    const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
    if (!(_spData !== null && _spData !== void 0 && _spData.series) || suggestBtn.classList.contains("spinning")) return;
    // Toggle: if panel is open, just close it
    const existingPanel = document.getElementById("rg-sugg-panel");
    if (existingPanel !== null && existingPanel !== void 0 && existingPanel.classList.contains("open")) {
      existingPanel.classList.remove("open");
      return;
    }
    suggestBtn.classList.add("spinning");
    try {
      await (0,_suggestion_js__WEBPACK_IMPORTED_MODULE_7__.recheckRGSuggestions)();
    } finally {
      suggestBtn.classList.remove("spinning");
    }
  });
  document.body.appendChild(suggestBtn);
}
async function checkSeriesPage() {
  var _document$getElementB2, _document$getElementB3, _document$getElementB4, _document$getElementB5, _document$getElementB6, _document$getElementB7;
  (_document$getElementB2 = document.getElementById("rg-fix-panel")) === null || _document$getElementB2 === void 0 || _document$getElementB2.remove();
  (_document$getElementB3 = document.getElementById("rg-sugg-panel")) === null || _document$getElementB3 === void 0 || _document$getElementB3.remove();
  (_document$getElementB4 = document.getElementById("rg-rename-notif")) === null || _document$getElementB4 === void 0 || _document$getElementB4.remove();
  (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.setSpData)(null);
  (_document$getElementB5 = document.getElementById("rg-check-btn")) === null || _document$getElementB5 === void 0 || _document$getElementB5.classList.remove("visible");
  (_document$getElementB6 = document.getElementById("rg-strip-btn")) === null || _document$getElementB6 === void 0 || _document$getElementB6.classList.remove("visible");
  (_document$getElementB7 = document.getElementById("rg-suggest-btn")) === null || _document$getElementB7 === void 0 || _document$getElementB7.classList.remove("visible", "has-suggestions");
  const m = location.pathname.match(/^\/series\/([^/]+)/);
  if (!m) return;
  try {
    var _document$getElementB8, _document$getElementB9, _document$getElementB0;
    const allSeries = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", "/api/v3/series");
    const series = allSeries.find(s => s.titleSlug === m[1]);
    if (!series) return;
    const [files, episodes] = await Promise.all([(0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", `/api/v3/episodefile?seriesId=${series.id}`), (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", `/api/v3/episode?seriesId=${series.id}`)]);

    // Build epMap: fileId → episode[] (sorted by season+ep)
    // Multi-episode files (e.g. S01E117-E119) share the same episodeFileId;
    // using an array keeps all episodes so we can display ranges correctly.
    const epMap = new Map();
    episodes.filter(e => e.episodeFileId).forEach(e => {
      const arr = epMap.get(e.episodeFileId);
      if (arr) arr.push(e);else epMap.set(e.episodeFileId, [e]);
    });
    epMap.forEach(arr => arr.sort((a, b) => a.seasonNumber !== b.seasonNumber ? a.seasonNumber - b.seasonNumber : a.episodeNumber - b.episodeNumber));

    // Cache data for per-episode edit buttons
    (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.setSpData)({
      series,
      files,
      epMap
    });
    (_document$getElementB8 = document.getElementById("rg-check-btn")) === null || _document$getElementB8 === void 0 || _document$getElementB8.classList.add("visible");
    (_document$getElementB9 = document.getElementById("rg-strip-btn")) === null || _document$getElementB9 === void 0 || _document$getElementB9.classList.add("visible");
    (_document$getElementB0 = document.getElementById("rg-suggest-btn")) === null || _document$getElementB0 === void 0 || _document$getElementB0.classList.add("visible");
    (0,_ep_editor_js__WEBPACK_IMPORTED_MODULE_4__.injectEpEditBtns)();
    const affected = files.filter(f => (0,_prefix_fix_js__WEBPACK_IMPORTED_MODULE_6__.prefixAlreadyInFilename)(f)).map(f => ({
      ...f,
      ep: epMap.get(f.id) ?? [],
      newReleaseGroup: (f.releaseGroup || "").replace(_constants_js__WEBPACK_IMPORTED_MODULE_0__.RG_PREFIX_RE, "")
    })).sort((a, b) => {
      const ae = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(a.ep),
        be = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(b.ep);
      const ds = ((ae === null || ae === void 0 ? void 0 : ae.seasonNumber) ?? 0) - ((be === null || be === void 0 ? void 0 : be.seasonNumber) ?? 0);
      return ds !== 0 ? ds : ((ae === null || ae === void 0 ? void 0 : ae.episodeNumber) ?? 0) - ((be === null || be === void 0 ? void 0 : be.episodeNumber) ?? 0);
    });

    // ── RG Suggestion: compute BEFORE prefix-fix check so we can suppress
    //    the rename notification when the suggestion panel is going to open.
    const suggCandidates = (0,_suggestion_js__WEBPACK_IMPORTED_MODULE_7__._buildSuggCandidates)(files, epMap, series);
    if (affected.length > 0) {
      (0,_prefix_fix_js__WEBPACK_IMPORTED_MODULE_6__.buildFixUI)(series, affected);
    } else if (suggCandidates.length === 0) {
      // No prefix-fix AND no suggestion candidates →
      // show rename notification if anything needs renaming
      (0,_rename_js__WEBPACK_IMPORTED_MODULE_5__.checkRenameMismatch)(series);
    }
    // When suggestion panel is open, rename notification is suppressed here;
    // it will be shown automatically after the user applies the suggestion.

    if (suggCandidates.length > 0) {
      const suggBtn = document.getElementById("rg-suggest-btn");
      if (suggBtn) {
        suggBtn.classList.add("has-suggestions");
        suggBtn.title = `${suggCandidates.length} file(s) may need Release Group — click to suggest`;
      }
      (0,_suggestion_js__WEBPACK_IMPORTED_MODULE_7__.buildRGSuggestionUI)(series, suggCandidates);
    }
  } catch (e) {
    console.warn("[RG Fix]", e.message);
  }
}
function watchNavigation() {
  const check = () => {
    if (/^\/series\/[^/]+/.test(location.pathname)) {
      clearTimeout(watchNavigation._t);
      watchNavigation._t = setTimeout(checkSeriesPage, 600);
    } else {
      var _document$getElementB1, _document$getElementB10, _document$getElementB11;
      (_document$getElementB1 = document.getElementById("rg-fix-panel")) === null || _document$getElementB1 === void 0 || _document$getElementB1.remove();
      (_document$getElementB10 = document.getElementById("rg-sugg-panel")) === null || _document$getElementB10 === void 0 || _document$getElementB10.remove();
      (_document$getElementB11 = document.getElementById("rg-suggest-btn")) === null || _document$getElementB11 === void 0 || _document$getElementB11.classList.remove("visible", "has-suggestions");
    }
  };
  const orig = history.pushState;
  history.pushState = function (...a) {
    orig.apply(this, a);
    check();
  };
  window.addEventListener("popstate", check);
  check();
}

/***/ },

/***/ "./src/modules/settings.js"
/*!*********************************!*\
  !*** ./src/modules/settings.js ***!
  \*********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   applySavedNetworks: () => (/* binding */ applySavedNetworks),
/* harmony export */   buildSettingsPanel: () => (/* binding */ buildSettingsPanel),
/* harmony export */   loadSettings: () => (/* binding */ loadSettings),
/* harmony export */   openSettings: () => (/* binding */ openSettings),
/* harmony export */   saveSettings: () => (/* binding */ saveSettings)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");
/* harmony import */ var _lang_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./lang.js */ "./src/modules/lang.js");



// ── Settings dashboard ────────────────────────────────────────────────────────

const SETTINGS_KEY = `rg_settings_${location.hostname}`;
function loadSettings() {
  try {
    return JSON.parse(GM_getValue(SETTINGS_KEY, "{}"));
  } catch {
    return {};
  }
}
function saveSettings(obj) {
  GM_setValue(SETTINGS_KEY, JSON.stringify(obj));
}

// Apply saved custom networks on startup (runs after NETWORKS const is set)
function applySavedNetworks() {
  (loadSettings().customNetworks ?? []).forEach(n => {
    if (!_constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.find(x => x.value === n)) _constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.push({
      label: n,
      value: n
    });
  });
}

// The QUALITIES list is used inside the settings panel (Quality tab)
const QUALITIES = [{
  label: "WEBDL-1080p",
  name: "WEBDL-1080p"
}, {
  label: "WEBDL-720p",
  name: "WEBDL-720p"
}, {
  label: "WEBDL-2160p",
  name: "WEBDL-2160p"
}, {
  label: "WEBRip-1080p",
  name: "WEBRip-1080p"
}, {
  label: "WEBRip-720p",
  name: "WEBRip-720p"
}, {
  label: "Bluray-1080p",
  name: "Bluray-1080p"
}, {
  label: "Bluray-720p",
  name: "Bluray-720p"
}, {
  label: "Bluray-2160p",
  name: "Bluray-2160p"
}, {
  label: "HDTV-1080p",
  name: "HDTV-1080p"
}, {
  label: "HDTV-720p",
  name: "HDTV-720p"
}, {
  label: "SDTV",
  name: "SDTV"
}];
function buildSettingsPanel() {
  var _document$getElementB;
  (_document$getElementB = document.getElementById("rg-settings-panel")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
  const panel = document.createElement("div");
  panel.id = "rg-settings-panel";
  const settings = loadSettings();
  const customNets = settings.customNetworks ?? [];
  const disabledQ = settings.disabledQualities ?? [];
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
                <div class="rgs-pills-wrap">${_constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.filter(n => !customNets.includes(n.value)).map(n => `<span class="rgs-pill active" style="cursor:default">${n.label}</span>`).join("")}</div>`;
      body.appendChild(defSec);

      // Custom networks (editable)
      const custSec = document.createElement("div");
      custSec.className = "rgs-section";
      function renderCustom() {
        custSec.innerHTML = `<div class="rgs-section-label">Custom Networks</div>
                    <div class="rgs-desc">Added networks appear in the Release Group picker.</div>`;
        const wrap = document.createElement("div");
        wrap.className = "rgs-pills-wrap";
        customNets.forEach((n, i) => {
          const pill = document.createElement("span");
          pill.className = "rgs-pill active";
          pill.innerHTML = `${n} <span class="rgs-x">×</span>`;
          pill.querySelector(".rgs-x").addEventListener("click", () => {
            customNets.splice(i, 1);
            settings.customNetworks = customNets;
            saveSettings(settings);
            const ni = _constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.findIndex(x => x.value === n);
            if (ni !== -1) _constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.splice(ni, 1);
            renderCustom();
          });
          wrap.appendChild(pill);
        });
        custSec.appendChild(wrap);
        const addRow = document.createElement("div");
        addRow.className = "rgs-add-row";
        addRow.innerHTML = `<input class="rgs-input" id="rgs-net-in" placeholder="e.g. Peacock">
                                    <button class="rgs-add-btn">Add</button>`;
        addRow.querySelector(".rgs-add-btn").addEventListener("click", () => {
          const inp = addRow.querySelector("#rgs-net-in");
          const val = inp.value.trim();
          if (!val || _constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.find(x => x.label === val || x.value === val)) return;
          customNets.push(val);
          settings.customNetworks = customNets;
          saveSettings(settings);
          _constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS.push({
            label: val,
            value: val
          });
          inp.value = "";
          renderCustom();
        });
        custSec.appendChild(addRow);
      }
      renderCustom();
      body.appendChild(custSec);
    }
    if (name === "quality") {
      const sec = document.createElement("div");
      sec.className = "rgs-section";
      sec.innerHTML = `<div class="rgs-section-label">Quality Shortcut Pills</div>
                <div class="rgs-desc">Toggle which qualities appear as quick-select pills in the Quality modal.</div>`;
      const wrap = document.createElement("div");
      wrap.className = "rgs-pills-wrap";
      QUALITIES.forEach(q => {
        const on = !disabledQ.includes(q.name);
        const pill = document.createElement("span");
        pill.className = `rgs-pill${on ? " active" : ""}`;
        pill.textContent = q.label;
        pill.addEventListener("click", () => {
          const i = disabledQ.indexOf(q.name);
          if (i === -1) {
            disabledQ.push(q.name);
            pill.classList.remove("active");
          } else {
            disabledQ.splice(i, 1);
            pill.classList.add("active");
          }
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
      const sec = document.createElement("div");
      sec.className = "rgs-section";
      const key = GM_getValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.APIKEY_KEY, "");
      sec.innerHTML = `<div class="rgs-section-label">API Key — ${location.hostname}</div>
                <div class="rgs-desc">Auto-prompted when missing. Required for series-page features.</div>
                <div class="rgs-key-box">${key ? key.slice(0, 8) + "••••••••••••••••••••••••" : "(not set)"}</div>
                <button class="rgs-small-btn" id="rgs-reset-key">Clear &amp; Reset</button>`;
      sec.querySelector("#rgs-reset-key").addEventListener("click", () => {
        GM_setValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.APIKEY_KEY, "");
        sec.querySelector(".rgs-key-box").textContent = "(cleared — will prompt on next use)";
      });
      body.appendChild(sec);

      // Language usage stats section
      const statSec = document.createElement("div");
      statSec.className = "rgs-section";
      function renderLangStats() {
        var _statSec$querySelecto;
        const s = (0,_lang_js__WEBPACK_IMPORTED_MODULE_1__.loadLangStats)();
        const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 12); // show top 12
        const rows = sorted.length ? sorted.map(([code, count]) => {
          var _LANGS$find;
          const label = ((_LANGS$find = _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANGS.find(l => l.value === code)) === null || _LANGS$find === void 0 ? void 0 : _LANGS$find.label) ?? code;
          const pinned = _constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_PINNED.includes(code) ? " 📌" : "";
          return `<span class="rgs-pill active" style="cursor:default">
                                    ${label} (${code})${pinned}
                                    <span style="color:#89b;font-size:10px;margin-left:3px">×${count}</span>
                                </span>`;
        }).join("") : `<span style="color:#456;font-size:11px">No usage data yet.</span>`;
        statSec.innerHTML = `
                    <div class="rgs-section-label">Language Usage Stats</div>
                    <div class="rgs-desc">Languages are sorted by usage in the picker. TH &amp; EN always appear first.</div>
                    <div class="rgs-pills-wrap" style="margin-bottom:8px">${rows}</div>
                    <button class="rgs-small-btn" id="rgs-reset-stats">Reset Stats</button>`;
        (_statSec$querySelecto = statSec.querySelector("#rgs-reset-stats")) === null || _statSec$querySelecto === void 0 || _statSec$querySelecto.addEventListener("click", () => {
          GM_setValue(_constants_js__WEBPACK_IMPORTED_MODULE_0__.LANG_STATS_KEY, "{}");
          renderLangStats();
        });
      }
      renderLangStats();
      body.appendChild(statSec);
    }
  }
  renderTab("networks");
}
function openSettings() {
  const p = document.getElementById("rg-settings-panel");
  if (p !== null && p !== void 0 && p.classList.contains("open")) p.classList.remove("open");else buildSettingsPanel();
}

/***/ },

/***/ "./src/modules/state.js"
/*!******************************!*\
  !*** ./src/modules/state.js ***!
  \******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   clearSpData: () => (/* binding */ clearSpData),
/* harmony export */   getSpData: () => (/* binding */ getSpData),
/* harmony export */   isRefetching: () => (/* binding */ isRefetching),
/* harmony export */   setRefetching: () => (/* binding */ setRefetching),
/* harmony export */   setSpData: () => (/* binding */ setSpData)
/* harmony export */ });
// ── Shared mutable state ──────────────────────────────────────────────────────

// Series page data cache (populated by checkSeriesPage, used by injectEpEditBtns)
let _spData = null;

// Guard: true while a refetchFilesAndReInject fetch is in-flight
let _refetching = false;
function getSpData() {
  return _spData;
}
function setSpData(data) {
  _spData = data;
}
function clearSpData() {
  _spData = null;
}
function isRefetching() {
  return _refetching;
}
function setRefetching(val) {
  _refetching = val;
}

/***/ },

/***/ "./src/modules/suggestion.js"
/*!***********************************!*\
  !*** ./src/modules/suggestion.js ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   _buildSuggCandidates: () => (/* binding */ _buildSuggCandidates),
/* harmony export */   buildRGSuggestionUI: () => (/* binding */ buildRGSuggestionUI),
/* harmony export */   executeRGSuggestion: () => (/* binding */ executeRGSuggestion),
/* harmony export */   recheckRGSuggestions: () => (/* binding */ recheckRGSuggestions)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/modules/constants.js");
/* harmony import */ var _state_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./state.js */ "./src/modules/state.js");
/* harmony import */ var _api_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./api.js */ "./src/modules/api.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./utils.js */ "./src/modules/utils.js");
/* harmony import */ var _rg_parser_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./rg-parser.js */ "./src/modules/rg-parser.js");
/* harmony import */ var _pickers_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./pickers.js */ "./src/modules/pickers.js");
/* harmony import */ var _lang_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./lang.js */ "./src/modules/lang.js");
/* harmony import */ var _rename_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./rename.js */ "./src/modules/rename.js");
/* harmony import */ var _prefix_fix_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./prefix-fix.js */ "./src/modules/prefix-fix.js");










// ── RG Suggestion — detect missing Audio in Release Group, suggest from mediaInfo ──

/** Re-fetch files and rebuild RG suggestion panel. Called from the 💡 FAB. */
async function recheckRGSuggestions() {
  const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
  if (!(_spData !== null && _spData !== void 0 && _spData.series)) return;
  try {
    const files = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("GET", `/api/v3/episodefile?seriesId=${_spData.series.id}`);
    _spData.files = files;
    const candidates = _buildSuggCandidates(files, _spData.epMap, _spData.series);
    if (candidates.length > 0) {
      buildRGSuggestionUI(_spData.series, candidates);
    } else {
      var _document$getElementB, _document$getElementB2;
      (_document$getElementB = document.getElementById("rg-sugg-panel")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
      (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.showToast)("✓ All files have Audio in Release Group");
      (_document$getElementB2 = document.getElementById("rg-suggest-btn")) === null || _document$getElementB2 === void 0 || _document$getElementB2.classList.remove("has-suggestions");
    }
  } catch (e) {
    (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.showToast)("✗ " + e.message.slice(0, 60));
  }
}

/** Build sorted suggestion candidate list from files + epMap. */
function _buildSuggCandidates(files, epMap, series) {
  var _series$originalLangu;
  // Derive the series' original language code (e.g. "KO" for Korean)
  // used as the 3rd-priority slot in sortAudioCodes.
  const originalCode = (0,_lang_js__WEBPACK_IMPORTED_MODULE_6__.mapLangNameToCode)((series === null || series === void 0 || (_series$originalLangu = series.originalLanguage) === null || _series$originalLangu === void 0 ? void 0 : _series$originalLangu.name) ?? "");
  return files.filter(f => (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.needsRGSuggestion)(f)).map(f => ({
    ...f,
    ep: epMap.get(f.id) ?? [],
    suggestion: (0,_lang_js__WEBPACK_IMPORTED_MODULE_6__.suggestRGFromFile)(f, originalCode)
  })).filter(c => c.suggestion !== null).sort((a, b) => {
    const ae = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(a.ep),
      be = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(b.ep);
    const ds = ((ae === null || ae === void 0 ? void 0 : ae.seasonNumber) ?? 0) - ((be === null || be === void 0 ? void 0 : be.seasonNumber) ?? 0);
    return ds !== 0 ? ds : ((ae === null || ae === void 0 ? void 0 : ae.episodeNumber) ?? 0) - ((be === null || be === void 0 ? void 0 : be.episodeNumber) ?? 0);
  });
}

/** Build the RG suggestion slide panel. */
function buildRGSuggestionUI(series, candidates) {
  var _document$getElementB3, _panel$querySelector2;
  (_document$getElementB3 = document.getElementById("rg-sugg-panel")) === null || _document$getElementB3 === void 0 || _document$getElementB3.remove();

  // ── Most common suggestion (for pre-fill) ────────────────────────────
  const counts = new Map();
  for (const c of candidates) {
    if (!c.suggestion) continue;
    const key = c.suggestion.audioCodes.join(",") + "|" + c.suggestion.subCodes.join(",");
    const prev = counts.get(key);
    if (prev) prev.count++;else counts.set(key, {
      count: 1,
      suggestion: c.suggestion
    });
  }
  let bestSugg = {
    audioCodes: [],
    subCodes: []
  };
  let bestCount = 0;
  counts.forEach(({
    count,
    suggestion
  }) => {
    if (count > bestCount) {
      bestCount = count;
      bestSugg = suggestion;
    }
  });

  // ── HDTV candidates ──────────────────────────────────────────────────
  const hdtvFiles = candidates.filter(c => {
    var _c$quality;
    return _constants_js__WEBPACK_IMPORTED_MODULE_0__.HDTV_FIX[(_c$quality = c.quality) === null || _c$quality === void 0 || (_c$quality = _c$quality.quality) === null || _c$quality === void 0 ? void 0 : _c$quality.id];
  });

  // ── Total episode count (for multi-episode files) ────────────────────
  const totalEpCount = candidates.reduce((s, c) => s + (Array.isArray(c.ep) ? c.ep.length : c.ep ? 1 : 0), 0);

  // ── Group by season (use first episode in multi-ep files) ────────────
  const bySeason = new Map();
  for (const c of candidates) {
    var _firstEp;
    const sn = ((_firstEp = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.firstEp)(c.ep)) === null || _firstEp === void 0 ? void 0 : _firstEp.seasonNumber) ?? 0;
    if (!bySeason.has(sn)) bySeason.set(sn, []);
    bySeason.get(sn).push(c);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  const checked = new Set(candidates.map(c => c.id));

  // ── Panel skeleton ───────────────────────────────────────────────────
  const renameNowDefault = GM_getValue("rgsp_rename_now", true);
  const panel = document.createElement("div");
  panel.id = "rg-sugg-panel";
  panel.innerHTML = `
        <div class="rgsp-head">
            💡 Suggest Release Group
            <span class="rgsp-close">✕</span>
        </div>
        <div class="rgsp-body">
            <p class="rgsp-desc">
                ${(() => {
    const f = candidates.length,
      e = totalEpCount;
    const fLabel = `<strong>${f}</strong> file${f > 1 ? "s" : ""}`;
    const eLabel = e !== f ? ` (<strong>${e}</strong> episode${e > 1 ? "s" : ""})` : "";
    return `${fLabel}${eLabel} have no Audio in Release Group.`;
  })()}
                Click a file row to edit its values, or edit here to apply to all checked files.
            </p>
            <div class="rgsp-section-lbl">
                Release Group
                <span class="rgsp-edit-target-bar" style="display:inline-flex;margin-left:8px">
                    — editing: <span id="rgsp-edit-target-val" class="rgsp-edit-target-val">All files</span>
                </span>
            </div>
            <div class="rgsp-picker-box" id="rgsp-picker-box"></div>
            <div class="rgsp-section-lbl">Preview</div>
            <div id="rgsp-preview" class="ep-pop-preview empty" style="margin-bottom:10px">—</div>
            ${hdtvFiles.length > 0 ? `
            <div class="rgsp-section-lbl">Quality fix</div>
            <label class="rgsp-quality-row">
                <input type="checkbox" class="rgsp-quality-chk" id="rgsp-q-fix" checked>
                <span class="rgsp-quality-txt">
                    <span class="rgsp-quality-label">Fix HDTV → WEBDL for ${hdtvFiles.length} file${hdtvFiles.length > 1 ? "s" : ""}</span>
                    <span class="rgsp-quality-detail">e.g. HDTV-1080p → WEBDL-1080p</span>
                </span>
            </label>` : ""}
            <div class="rgsp-section-lbl">Rename option</div>
            <label class="rgsp-quality-row" style="margin-bottom:0">
                <input type="checkbox" class="rgsp-quality-chk" id="rgsp-rename-now"
                    ${renameNowDefault ? "checked" : ""}>
                <span class="rgsp-quality-txt">
                    <span class="rgsp-quality-label">Rename files immediately after applying</span>
                    <span class="rgsp-quality-detail">Uncheck to show rename confirmation popup first</span>
                </span>
            </label>
            <div class="rgsp-section-lbl">Files (${candidates.length})
                <span style="font-size:10px;color:#567;font-weight:normal;margin-left:6px">
                    — click a row to edit its Release Group
                </span>
            </div>
            <div class="rfp-tree" id="rgsp-tree"></div>
            <div class="rgsp-status" id="rgsp-status"></div>
        </div>
        <div class="rgsp-footer">
            <button class="rgsp-btn rgsp-cancel" id="rgsp-cancel">Dismiss</button>
            <button class="rgsp-btn rgsp-apply" id="rgsp-apply" disabled>Apply (0)</button>
        </div>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add("open"));

  // ── Picker ───────────────────────────────────────────────────────────
  const pickerBox = panel.querySelector("#rgsp-picker-box");
  const netLbl = document.createElement("div");
  netLbl.className = "rgsp-picker-sub-lbl";
  netLbl.textContent = "Network";
  const netComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeMultiPills)(_constants_js__WEBPACK_IMPORTED_MODULE_0__.NETWORKS, "net", [], syncPreview);
  const edtLbl = document.createElement("div");
  edtLbl.className = "rgsp-picker-sub-lbl";
  edtLbl.textContent = "Edition";
  const edtComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeMultiPills)(_constants_js__WEBPACK_IMPORTED_MODULE_0__.EDITIONS, "edt", [], syncPreview);
  const langLbl = document.createElement("div");
  langLbl.className = "rgsp-picker-sub-lbl";
  langLbl.textContent = "Language";
  const dual = document.createElement("div");
  dual.className = "rg-dual";
  const audioComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeLangPicker)("Audio", bestSugg.audioCodes, syncPreview);
  const subComp = (0,_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeLangPicker)("Subtitle", bestSugg.subCodes, syncPreview);
  dual.append(audioComp.el, subComp.el);
  pickerBox.append(netLbl, netComp.el, edtLbl, edtComp.el, langLbl, dual);
  const preview = panel.querySelector("#rgsp-preview");
  // ── File tree — declared BEFORE syncPreview() to avoid TDZ error ─────
  const tree = panel.querySelector("#rgsp-tree");

  // ── Per-file editable values, initialized from each file's suggestion ─
  // Maps fileId → { audioCodes, subCodes, nets, edts }
  const fileValues = new Map();
  for (const c of candidates) {
    fileValues.set(c.id, {
      audioCodes: c.suggestion ? [...c.suggestion.audioCodes] : [],
      subCodes: c.suggestion ? [...c.suggestion.subCodes] : [],
      nets: [],
      edts: []
    });
  }

  // ── editTarget: null = "All files", or a specific candidate ──────────
  let editTarget = null;

  /** Load values for the given target into the picker (null = All files). */
  function loadTarget(target) {
    editTarget = target;
    const lbl = panel.querySelector("#rgsp-edit-target-val");
    if (lbl) lbl.textContent = target ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.fmtEp)(target.ep) : "All files";

    // Highlight the focused row
    tree.querySelectorAll(".rfp-ep-row").forEach(row => row.classList.toggle("rgsp-focused", !!target && row.dataset.fileId === String(target.id)));
    const vals = target ? fileValues.get(target.id) : {
      audioCodes: bestSugg.audioCodes,
      subCodes: bestSugg.subCodes,
      nets: [],
      edts: []
    };
    netComp.set(vals.nets, true);
    edtComp.set(vals.edts, true);
    audioComp.set(vals.audioCodes, true);
    subComp.set(vals.subCodes, true);

    // Update preview without writing back to fileValues
    const val = (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)(vals.nets, vals.edts, vals.audioCodes, vals.subCodes);
    preview.textContent = val || "—";
    preview.className = "ep-pop-preview" + (!val ? " empty" : vals.nets.length || vals.edts.length ? " has-network" : "");
  }

  /** Called whenever the picker changes — saves to fileValues and updates rows. */
  function syncPreview() {
    const nets = netComp.get(),
      edts = edtComp.get();
    const audio = audioComp.get(),
      sub = subComp.get();
    const val = (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)(nets, edts, audio, sub);
    preview.textContent = val || "—";
    preview.className = "ep-pop-preview" + (!val ? " empty" : nets.length || edts.length ? " has-network" : "");
    const newVals = {
      audioCodes: audio,
      subCodes: sub,
      nets,
      edts
    };
    if (editTarget) {
      // Save only to the focused file
      fileValues.set(editTarget.id, newVals);
      const span = tree.querySelector(`.rgsp-new-rg[data-file-id="${editTarget.id}"]`);
      if (span) span.textContent = val || "—";
    } else {
      // Save to all checked files and update their rows
      for (const c of candidates) {
        if (checked.has(c.id)) fileValues.set(c.id, {
          ...newVals
        });
      }
      tree.querySelectorAll(".rgsp-new-rg[data-file-id]").forEach(el => {
        if (checked.has(parseInt(el.dataset.fileId))) el.textContent = val || "—";
      });
    }
    updateApplyBtn();
  }

  // Quality fix checkbox: toggle badge visibility in tree
  const qFixChk = panel.querySelector("#rgsp-q-fix");
  qFixChk === null || qFixChk === void 0 || qFixChk.addEventListener("change", () => {
    const show = qFixChk.checked;
    tree.querySelectorAll(".rgsp-quality-badge").forEach(el => el.style.display = show ? "" : "none");
  });
  function renderTree() {
    tree.innerHTML = "";
    for (const sn of seasons) {
      const files = bySeason.get(sn);
      const allC = files.every(f => checked.has(f.id));
      const someC = files.some(f => checked.has(f.id));
      let expanded = true;
      const block = document.createElement("div");
      block.className = "rfp-season-block";
      const head = document.createElement("div");
      head.className = "rfp-season-head";
      head.innerHTML = `
                <input type="checkbox" class="rfp-chk rfp-season-chk" data-sn="${sn}">
                <span class="rfp-season-label">
                    Season ${sn} <em>(${files.length} file${files.length > 1 ? "s" : ""})</em>
                </span>
                <span class="rfp-toggle">▲</span>`;
      block.appendChild(head);
      const chk = head.querySelector(".rfp-season-chk");
      chk.checked = allC;
      chk.indeterminate = someC && !allC;
      const epList = document.createElement("div");
      epList.className = "rfp-ep-list";
      for (const c of files) {
        var _c$quality2;
        const row = document.createElement("div");
        row.className = "rfp-ep-row";
        row.dataset.fileId = c.id;
        const vals = fileValues.get(c.id);
        const suggStr = vals ? (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)(vals.nets, vals.edts, vals.audioCodes, vals.subCodes) : "(no mediaInfo)";
        const qualFix = _constants_js__WEBPACK_IMPORTED_MODULE_0__.HDTV_FIX[(_c$quality2 = c.quality) === null || _c$quality2 === void 0 || (_c$quality2 = _c$quality2.quality) === null || _c$quality2 === void 0 ? void 0 : _c$quality2.id];

        // Row has checkbox + clickable edit area
        row.innerHTML = `
                    <input type="checkbox" class="rfp-chk rfp-ep-chk" data-id="${c.id}"
                        ${checked.has(c.id) ? "checked" : ""}>
                    <div class="rfp-ep-edit-area" title="Click to edit this file's Release Group">
                        <span class="rfp-ep-label">${(0,_utils_js__WEBPACK_IMPORTED_MODULE_3__.fmtEp)(c.ep)}</span>
                        <span class="rfp-old">${c.releaseGroup || "(none)"}</span>
                        <span class="rfp-arrow">→</span>
                        <span class="rfp-new rgsp-new-rg" data-file-id="${c.id}" style="color:#fa0">${suggStr}</span>
                        ${qualFix ? `<span class="rgsp-quality-badge" style="font-size:10px;color:#b80;opacity:.8">🎬${c.quality.quality.name}→${qualFix.name}</span>` : ""}
                    </div>`;
        epList.appendChild(row);

        // Click on the edit area → focus this file in the picker
        row.querySelector(".rfp-ep-edit-area").addEventListener("click", () => {
          var _editTarget;
          if (((_editTarget = editTarget) === null || _editTarget === void 0 ? void 0 : _editTarget.id) === c.id) {
            loadTarget(null); // toggle off — back to All
          } else {
            loadTarget(c);
          }
        });
      }
      block.appendChild(epList);
      tree.appendChild(block);

      // Toggle expand/collapse
      const toggle = head.querySelector(".rfp-toggle");
      const label = head.querySelector(".rfp-season-label");
      [toggle, label].forEach(el => el.addEventListener("click", () => {
        expanded = !expanded;
        epList.style.display = expanded ? "block" : "none";
        toggle.textContent = expanded ? "▲" : "▼";
      }));

      // Season checkbox
      chk.addEventListener("change", () => {
        files.forEach(f => chk.checked ? checked.add(f.id) : checked.delete(f.id));
        epList.querySelectorAll(".rfp-ep-chk").forEach(ec => ec.checked = chk.checked);
        updateApplyBtn();
      });

      // Episode checkboxes
      epList.querySelectorAll(".rfp-ep-chk").forEach(ec => {
        ec.addEventListener("change", () => {
          const id = parseInt(ec.dataset.id);
          ec.checked ? checked.add(id) : checked.delete(id);
          const allC2 = files.every(f => checked.has(f.id));
          const someC2 = files.some(f => checked.has(f.id));
          chk.checked = allC2;
          chk.indeterminate = someC2 && !allC2;
          updateApplyBtn();
        });
      });
    }
  }
  renderTree();
  // Initialize picker to "All files" view showing bestSugg values
  loadTarget(null);
  function updateApplyBtn() {
    var _panel$querySelector;
    const btn = panel.querySelector("#rgsp-apply");
    if (!btn) return;
    const renameNow = ((_panel$querySelector = panel.querySelector("#rgsp-rename-now")) === null || _panel$querySelector === void 0 ? void 0 : _panel$querySelector.checked) ?? true;
    const label = renameNow ? "Apply & Rename" : "Apply RG only";
    btn.disabled = checked.size === 0;
    btn.textContent = `${label} (${checked.size})`;
  }
  updateApplyBtn();

  // Rename checkbox: update button label and persist preference
  (_panel$querySelector2 = panel.querySelector("#rgsp-rename-now")) === null || _panel$querySelector2 === void 0 || _panel$querySelector2.addEventListener("change", e => {
    GM_setValue("rgsp_rename_now", e.target.checked);
    updateApplyBtn();
  });

  // ── Event handlers ───────────────────────────────────────────────────
  panel.querySelector(".rgsp-close").addEventListener("click", () => panel.classList.remove("open"));
  panel.querySelector("#rgsp-cancel").addEventListener("click", () => panel.classList.remove("open"));
  panel.querySelector("#rgsp-apply").addEventListener("click", () => {
    var _panel$querySelector3, _panel$querySelector4;
    const applyQFix = ((_panel$querySelector3 = panel.querySelector("#rgsp-q-fix")) === null || _panel$querySelector3 === void 0 ? void 0 : _panel$querySelector3.checked) ?? false;
    const renameNow = ((_panel$querySelector4 = panel.querySelector("#rgsp-rename-now")) === null || _panel$querySelector4 === void 0 ? void 0 : _panel$querySelector4.checked) ?? true;
    const selected = candidates.filter(c => checked.has(c.id));
    // Determine whether any file will have a network/edition prefix
    const hasPrefix = selected.some(c => {
      const fv = fileValues.get(c.id);
      return fv && (fv.nets.length > 0 || fv.edts.length > 0);
    });
    executeRGSuggestion(series, selected, {
      fileValues,
      applyQFix,
      renameNow,
      hasPrefix
    }, panel);
  });
}

/**
 * Apply Release Group suggestions to selected files.
 *
 * opts = {
 *   fileValues: Map<fileId, {audioCodes, subCodes, nets, edts}>
 *   applyQFix:  boolean  — fix HDTV → WEBDL quality
 *   renameNow:  boolean  — trigger rename immediately; if false, show popup
 *   hasPrefix:  boolean  — any file has Network/Edition → run strip check after rename
 * }
 */
async function executeRGSuggestion(series, selected, opts, panel) {
  if (!selected.length) return;
  const applyBtn = panel.querySelector("#rgsp-apply");
  const cancelBtn = panel.querySelector("#rgsp-cancel");
  applyBtn.disabled = cancelBtn.disabled = true;
  const rgspSt = (msg, type) => {
    const el = panel.querySelector("#rgsp-status");
    if (el) {
      el.textContent = msg;
      el.className = `rgsp-status ${type}`;
    }
  };
  try {
    var _document$getElementB4;
    // ── Step 1: PUT each file's Release Group ─────────────────────────
    for (let i = 0; i < selected.length; i++) {
      var _f$suggestion, _f$suggestion2, _f$quality;
      const f = selected[i];
      rgspSt(`Updating ${i + 1} / ${selected.length}…`, "loading");

      // Determine the RG for this specific file from its individual fileValues
      const fv = opts.fileValues.get(f.id);
      const fileRG = fv ? (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)(fv.nets, fv.edts, fv.audioCodes, fv.subCodes) : (0,_rg_parser_js__WEBPACK_IMPORTED_MODULE_4__.buildValue)([], [], ((_f$suggestion = f.suggestion) === null || _f$suggestion === void 0 ? void 0 : _f$suggestion.audioCodes) ?? [], ((_f$suggestion2 = f.suggestion) === null || _f$suggestion2 === void 0 ? void 0 : _f$suggestion2.subCodes) ?? []);
      const update = {
        ...f,
        releaseGroup: fileRG
      };

      // Quality fix if requested and applicable
      if (opts.applyQFix && _constants_js__WEBPACK_IMPORTED_MODULE_0__.HDTV_FIX[(_f$quality = f.quality) === null || _f$quality === void 0 || (_f$quality = _f$quality.quality) === null || _f$quality === void 0 ? void 0 : _f$quality.id]) {
        const fix = _constants_js__WEBPACK_IMPORTED_MODULE_0__.HDTV_FIX[f.quality.quality.id];
        update.quality = {
          ...f.quality,
          quality: {
            ...f.quality.quality,
            id: fix.id,
            name: fix.name
          }
        };
      }
      await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("PUT", `/api/v3/episodefile/${f.id}`, update);

      // Update local cache
      const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
      if (_spData) {
        const idx = _spData.files.findIndex(x => x.id === f.id);
        if (idx !== -1) _spData.files[idx] = {
          ..._spData.files[idx],
          releaseGroup: fileRG
        };
      }
    }
    rgspSt(`All ${selected.length} updated. Waiting for Sonarr…`, "loading");
    await new Promise(r => setTimeout(r, 600));
    (_document$getElementB4 = document.getElementById("rg-suggest-btn")) === null || _document$getElementB4 === void 0 || _document$getElementB4.classList.remove("has-suggestions");
    if (opts.renameNow) {
      // ── Step 2a: Rename immediately ───────────────────────────────
      rgspSt("Renaming files…", "loading");
      const cmd = await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.apiReq)("POST", "/api/v3/command", {
        name: "RenameFiles",
        seriesId: series.id,
        files: selected.map(f => f.id)
      });
      // Poll until Sonarr actually finishes renaming (not just queued)
      await (0,_api_js__WEBPACK_IMPORTED_MODULE_2__.waitForCommand)(cmd.id, st => rgspSt(`Renaming… (${st})`, "loading"));
      rgspSt(`✓ Done — ${selected.length} file(s) updated & renamed.`, "ok");
      setTimeout(async () => {
        panel.classList.remove("open");
        // If Network/Edition prefix was applied, check for strip
        const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
        if (opts.hasPrefix && _spData !== null && _spData !== void 0 && _spData.series) {
          await (0,_prefix_fix_js__WEBPACK_IMPORTED_MODULE_8__.recheckPrefixFiles)();
        }
      }, 1500);
    } else {
      // ── Step 2b: Show rename confirmation popup ────────────────────
      rgspSt(`✓ ${selected.length} RG(s) updated — confirm rename below.`, "ok");

      // Post-rename callback: check strip if prefix was applied
      const afterRename = opts.hasPrefix ? () => (0,_prefix_fix_js__WEBPACK_IMPORTED_MODULE_8__.recheckPrefixFiles)() : null;
      setTimeout(() => {
        panel.classList.remove("open");
        const _spData = (0,_state_js__WEBPACK_IMPORTED_MODULE_1__.getSpData)();
        if (_spData !== null && _spData !== void 0 && _spData.series) (0,_rename_js__WEBPACK_IMPORTED_MODULE_7__.checkRenameMismatch)(_spData.series, null, afterRename);
      }, 1500);
    }
  } catch (e) {
    rgspSt(`✗ ${e.message}`, "err");
    applyBtn.disabled = cancelBtn.disabled = false;
  }
}

/***/ },

/***/ "./src/modules/utils.js"
/*!******************************!*\
  !*** ./src/modules/utils.js ***!
  \******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   firstEp: () => (/* binding */ firstEp),
/* harmony export */   fmtEp: () => (/* binding */ fmtEp),
/* harmony export */   showToast: () => (/* binding */ showToast)
/* harmony export */ });
// ── Utility functions ─────────────────────────────────────────────────────────

/**
 * Format episode label from a single episode object or an array of episodes.
 * Multi-episode files show a range: S01E117-E119.
 */
function fmtEp(ep) {
  const eps = Array.isArray(ep) ? ep : ep ? [ep] : [];
  if (!eps.length) return "?";
  const pad = n => String(n).padStart(2, "0");
  const first = eps[0];
  const last = eps[eps.length - 1];
  const sn = pad(first.seasonNumber);
  if (eps.length === 1) return `S${sn}E${pad(first.episodeNumber)}`;
  if (first.seasonNumber === last.seasonNumber) return `S${sn}E${pad(first.episodeNumber)}-E${pad(last.episodeNumber)}`;
  return `S${sn}E${pad(first.episodeNumber)}…`;
}

/** Return the first episode from an epMap value (array or single, may be null). */
function firstEp(epVal) {
  return Array.isArray(epVal) ? epVal[0] ?? null : epVal ?? null;
}
function showToast(msg, ms = 3000) {
  var _document$getElementB;
  (_document$getElementB = document.getElementById("rg-toast")) === null || _document$getElementB === void 0 || _document$getElementB.remove();
  const t = document.createElement("div");
  t.id = "rg-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/***/ },

/***/ "./node_modules/css-loader/dist/cjs.js!./node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./src/scss/main.scss"
/*!*************************************************************************************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./src/scss/main.scss ***!
  \*************************************************************************************************************************************/
(module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/noSourceMaps.js */ "./node_modules/css-loader/dist/runtime/noSourceMaps.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/api.js */ "./node_modules/css-loader/dist/runtime/api.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);
// Imports


var ___CSS_LOADER_EXPORT___ = _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default()((_node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default()));
// Module
___CSS_LOADER_EXPORT___.push([module.id, `:root {
  --rg-bg: #1a1a2e;
  --rg-bg-head: #13132a;
  --rg-bg-dark: #0d0d1e;
  --rg-border: #2a2a45;
  --rg-text: #e0e0e0;
  --rg-text-dim: #789;
  --rg-accent: #4cc;
  --rg-accent-gold: #fa0;
  --rg-accent-green:#4d4;
  --rg-accent-blue: #6ae;
  --rg-panel-w: 460px;
}

.rfp-head {
  background: #13132a;
  padding: 11px 14px;
  font-weight: bold;
  color: #6d6;
  font-size: 13px;
  border-bottom: 1px solid #2a2a45;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.rfp-head-close {
  cursor: pointer;
  color: #789;
  font-size: 16px;
}

.rfp-body {
  padding: 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.rfp-desc {
  font-size: 12px;
  color: #aab;
  margin: 0;
  padding: 8px 10px;
  background: #12122a;
  border-radius: 6px;
  border: 1px solid #2a2a45;
}

.rfp-desc code {
  background: #0d3d20;
  color: #6d6;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
}

.rfp-tree {
  border: 1px solid #2a2a45;
  border-radius: 6px;
  overflow: hidden;
}

.rfp-season-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #13132a;
  cursor: pointer;
  border-bottom: 1px solid #2a2a45;
  user-select: none;
}
.rfp-season-head:last-child {
  border-bottom: none;
}
.rfp-season-head:hover {
  background: #1a1a38;
}

.rfp-season-label {
  flex: 1;
  font-weight: bold;
  font-size: 12px;
  color: #ccd;
}
.rfp-season-label em {
  color: #567;
  font-style: normal;
  font-size: 11px;
}

.rfp-toggle {
  color: #567;
  font-size: 11px;
  padding: 0 4px;
}

.rfp-ep-list {
  background: #111120;
}

.rfp-ep-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px 6px 28px;
  border-bottom: 1px solid #1a1a30;
  font-size: 11px;
}
.rfp-ep-row:last-child {
  border-bottom: none;
}

.rfp-ep-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.rfp-ep-label {
  color: #4cc;
  font-weight: bold;
  min-width: 52px;
}

.rfp-old {
  color: #fa0;
  font-family: monospace;
}

.rfp-arrow {
  color: #456;
}

.rfp-new {
  color: #6d6;
  font-family: monospace;
  font-weight: bold;
}

.rfp-chk {
  accent-color: #4cc;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  cursor: pointer;
}

.rfp-status {
  font-size: 11px;
  text-align: center;
  padding: 6px 8px;
  border-radius: 4px;
  display: none;
}
.rfp-status.ok {
  display: block;
  background: #0d200d;
  color: #4d4;
}
.rfp-status.err {
  display: block;
  background: #200d0d;
  color: #d44;
}
.rfp-status.loading {
  display: block;
  background: #0d1e2a;
  color: #4ad;
}

.rfp-btns {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.rfp-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}

.rfp-cancel {
  background: #2a2a3a;
  color: #889;
}

.rfp-cancel:hover {
  background: #3a3a4a;
}

.rfp-confirm {
  background: #1a5c2a;
  color: #cfc;
}

.rfp-confirm:hover {
  background: #247a38;
}

.rfp-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

#rg-fix-panel {
  position: fixed;
  top: 0;
  right: -480px;
  z-index: 9998;
  width: 460px;
  height: 100vh;
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 12px 0 0 12px;
  box-shadow: -4px 0 28px rgba(0, 0, 0, 0.6);
  font-family: sans-serif;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: right 0.3s ease;
}
#rg-fix-panel.open {
  right: 0;
  border-radius: 0;
}

#rg-sugg-panel {
  position: fixed;
  top: 0;
  right: -460px;
  width: 440px;
  height: 100vh;
  background: #12121e;
  border-left: 1px solid #2a2a40;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.65);
  font-family: sans-serif;
  font-size: 13px;
  color: #e0e0e0;
  transition: right 0.25s ease;
  overflow: hidden;
}
#rg-sugg-panel.open {
  right: 0;
}

.rgsp-head {
  background: #1e1400;
  padding: 13px 16px;
  font-size: 13px;
  font-weight: bold;
  color: #fa0;
  border-bottom: 1px solid #3a2a00;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.rgsp-close {
  cursor: pointer;
  color: #789;
  font-size: 18px;
}

.rgsp-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.rgsp-desc {
  font-size: 11px;
  color: #aab;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #1a1200;
  border-radius: 6px;
  border: 1px solid #3a2800;
}

.rgsp-section-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #456;
  margin: 10px 0 5px;
}

.rgsp-picker-box {
  border: 1px solid #2a2a45;
  border-radius: 8px;
  padding: 10px;
  background: #0d0d1e;
  margin-bottom: 8px;
}

.rgsp-picker-sub-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #567;
  margin: 7px 0 4px;
}

.rgsp-quality-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #1e1400;
  border: 1px solid #4a3000;
  margin-bottom: 8px;
  cursor: pointer;
}

.rgsp-quality-txt {
  flex: 1;
}

.rgsp-quality-label {
  font-size: 12px;
  color: #fa0;
  display: block;
}

.rgsp-quality-detail {
  font-size: 10px;
  color: #789;
  margin-top: 2px;
  display: block;
}

.rgsp-quality-chk {
  accent-color: #fa0;
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 2px;
}

.rgsp-status {
  font-size: 11px;
  text-align: center;
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  display: none;
}
.rgsp-status.ok {
  display: block;
  background: #0d200d;
  color: #4d4;
}
.rgsp-status.err {
  display: block;
  background: #200d0d;
  color: #d44;
}
.rgsp-status.loading {
  display: block;
  background: #0d1e2a;
  color: #4ad;
}

.rgsp-edit-target-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: #789;
}

.rgsp-edit-target-val {
  color: #4ef;
  font-weight: bold;
}

.rfp-ep-row.rgsp-focused {
  background: #0d1f2a;
  border-radius: 5px;
  outline: 1px solid #2a7aaa;
}

.rfp-ep-edit-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.rfp-ep-edit-area:hover .rfp-ep-label {
  text-decoration: underline dotted;
}

.rgsp-footer {
  padding: 10px 12px;
  border-top: 1px solid #2a2a40;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.rgsp-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}

.rgsp-cancel {
  background: #2a2a3a;
  color: #889;
}

.rgsp-cancel:hover {
  background: #3a3a4a;
}

.rgsp-apply {
  background: #1a4070;
  color: #6ae;
}

.rgsp-apply:hover {
  background: #1f4d88;
}

.rgsp-apply:disabled {
  opacity: 0.4;
  cursor: default;
}

.ep-rg-edit-btn {
  margin-left: 5px;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid #3a3a55;
  background: transparent;
  color: #567;
  cursor: pointer;
  font-size: 11px;
  vertical-align: middle;
  transition: all 0.14s;
  line-height: 1.6;
  display: inline-block;
}
.ep-rg-edit-btn:hover {
  border-color: #4cc;
  color: #4cc;
  background: #0d1a2a;
}

#ep-rg-popup {
  position: fixed;
  z-index: 10002;
  background: #1a1a2e;
  border: 1px solid #3a3a55;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75);
  padding: 14px;
  width: 420px;
  max-height: 82vh;
  overflow-y: auto;
  font-family: sans-serif;
  font-size: 13px;
  color: #e0e0e0;
}

.ep-pop-head {
  font-weight: bold;
  color: #4cc;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ep-pop-close {
  cursor: pointer;
  color: #789;
  font-size: 16px;
}

.ep-pop-row {
  margin-bottom: 10px;
}

.ep-pop-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #567;
  margin-bottom: 5px;
}

.ep-pop-preview {
  padding: 5px 10px;
  border-radius: 5px;
  background: #111;
  border: 1px solid #222;
  font-family: monospace;
  font-size: 11px;
  color: #6b6;
  word-break: break-all;
  min-height: 22px;
}
.ep-pop-preview.has-network {
  color: #fa0;
}
.ep-pop-preview.empty {
  color: #444;
  font-style: italic;
}

.ep-pop-btns {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.ep-pop-btn {
  flex: 1;
  padding: 7px 0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}

.ep-pop-cancel {
  background: #2a2a3a;
  color: #889;
}

.ep-pop-cancel:hover {
  background: #3a3a4a;
}

.ep-pop-save {
  background: #1a5c2a;
  color: #cfc;
}

.ep-pop-save:hover {
  background: #247a38;
}

.ep-pop-save:disabled {
  opacity: 0.4;
  cursor: default;
}

.ep-pop-epinfo {
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #0d0d1e;
  border: 1px solid #2a2a40;
  border-radius: 6px;
  font-size: 11px;
  color: #aab;
}

.ep-pop-epinfo-label {
  font-weight: bold;
  color: #7dd;
  margin-bottom: 3px;
  font-size: 12px;
}

.ep-pop-epinfo-path {
  color: #567;
  font-family: monospace;
  font-size: 10px;
  word-break: break-all;
  margin-bottom: 3px;
}

.ep-pop-epinfo-rg {
  color: #fa0;
  font-size: 10px;
}
.ep-pop-epinfo-rg code {
  background: #1a1000;
  border-radius: 3px;
  padding: 1px 5px;
  font-family: monospace;
}

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

#rg-container .rg-dual > * {
  flex: 1;
  min-width: 0;
}

.rg-dual {
  display: flex;
  gap: 10px;
}

.rg-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.rg-pill {
  padding: 4px 12px;
  border-radius: 14px;
  border: 1px solid #3a3a55;
  background: transparent;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  transition: background 0.14s, border-color 0.14s, color 0.14s;
  white-space: nowrap;
}
.rg-pill:hover {
  border-color: #666;
  color: #bbb;
}

.rg-pill.net.active {
  background: #1a3a10;
  border-color: #5c5;
  color: #7e7;
  font-weight: bold;
}

.rg-pill.edt.active {
  background: #2a2000;
  border-color: #b80;
  color: #eb0;
  font-weight: bold;
}

.rg-lang-col-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #567;
  margin-bottom: 5px;
}

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
  transition: color 0.12s;
}
.rg-chip-x:hover {
  color: #f88;
}

.rg-add-btn {
  padding: 3px 11px;
  border-radius: 14px;
  border: 1px dashed #4a4a66;
  color: #667;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  transition: all 0.14s;
}
.rg-add-btn:hover {
  border-color: #4cc;
  color: #9bb;
}

.rg-lang-panel {
  margin-top: 7px;
  padding: 8px;
  background: #12121e;
  border: 1px solid #2a2a40;
  border-radius: 8px;
  display: none;
}
.rg-lang-panel.open {
  display: block;
}

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
.rg-lang-search:focus {
  border-color: #4cc;
}

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
  transition: all 0.12s;
}
.rg-lang-option:hover {
  border-color: #4cc;
  color: #cce;
}
.rg-lang-option.chosen {
  display: none;
}
.rg-lang-option.hidden {
  display: none;
}

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
#rg-preview.has-network {
  color: #fa0;
}
#rg-preview.empty {
  color: #444;
  font-style: italic;
}

.rg-fab-side {
  position: fixed;
  left: 24px;
  z-index: 9999;
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background: #1a1a2e;
  border: 1px solid #2a2a45;
  color: #567;
  font-size: 15px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: all 0.18s;
  user-select: none;
}
.rg-fab-side.visible {
  display: flex;
}

#rg-check-btn {
  bottom: 66px;
}

#rg-check-btn:hover {
  border-color: #4ad;
  color: #4ad;
}

#rg-check-btn.spinning {
  color: #fa0;
  border-color: #fa0;
  animation: rg-spin 0.8s linear infinite;
}

#rg-strip-btn {
  bottom: 108px;
}

#rg-strip-btn:hover {
  border-color: #6d6;
  color: #6d6;
}

#rg-strip-btn.spinning {
  color: #fa0;
  border-color: #fa0;
  animation: rg-spin 0.8s linear infinite;
}

#rg-suggest-btn {
  bottom: 150px;
}

#rg-suggest-btn:hover {
  border-color: #fa0;
  color: #fa0;
}

#rg-suggest-btn.has-suggestions {
  border-color: #fa0;
  color: #fa0;
  background: #1e1200;
}

#rg-suggest-btn.spinning {
  animation: rg-spin 0.8s linear infinite;
}

@keyframes rg-spin {
  to {
    transform: rotate(360deg);
  }
}
#rg-toast {
  position: fixed;
  bottom: 70px;
  left: 70px;
  z-index: 10003;
  background: #0d200d;
  border: 1px solid #4a6;
  color: #6d6;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-family: sans-serif;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  animation: rg-fadein 0.15s ease;
}

@keyframes rg-fadein {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
  }
}
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
  transition: all 0.14s;
  white-space: nowrap;
}
.ii-btn:hover {
  border-color: #4cc;
  color: #cce;
  background: #12122a;
}
.ii-btn.ii-rg {
  border-color: #4a6;
  color: #7c7;
}
.ii-btn.ii-rg:hover {
  border-color: #6d6;
  color: #9e9;
  background: #101a10;
}
.ii-btn.ii-q {
  border-color: #66a;
  color: #99c;
}
.ii-btn.ii-q:hover {
  border-color: #99d;
  color: #bbd;
  background: #12121e;
}
.ii-btn.ii-lang {
  border-color: #a66;
  color: #c99;
}
.ii-btn.ii-lang:hover {
  border-color: #d88;
  color: #daa;
  background: #1e1010;
}

.ii-divider {
  width: 1px;
  height: 20px;
  background: #2a2a40;
  margin: 0 2px;
}

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
  transition: all 0.14s;
  white-space: nowrap;
}
.sq-pill:hover {
  border-color: #4a8;
  background: #eaf4ee;
  color: #2a6;
}
.sq-pill.active {
  border-color: #4a8;
  background: #d4edda;
  color: #195;
  font-weight: bold;
}

#rg-rename-notif {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9997;
  width: 360px;
  background: #1a1a2e;
  border: 1px solid #4a6;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.65);
  font-family: sans-serif;
  font-size: 12px;
  color: #e0e0e0;
  display: none;
  flex-direction: column;
  transform: translateY(16px);
  opacity: 0;
  transition: transform 0.2s ease, opacity 0.2s ease;
}
#rg-rename-notif.open {
  display: flex;
  transform: translateY(0);
  opacity: 1;
}

.rn-head {
  background: #0d2a18;
  padding: 9px 13px;
  font-weight: bold;
  color: #4d9;
  border-bottom: 1px solid #2a4a36;
  border-radius: 10px 10px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rn-head-close {
  cursor: pointer;
  color: #789;
  font-size: 14px;
}

.rn-body {
  padding: 10px 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.rn-file {
  background: #111120;
  border-radius: 5px;
  padding: 6px 9px;
  font-family: monospace;
  font-size: 10px;
}

.rn-old {
  color: #fa0;
  word-break: break-all;
}

.rn-arrow {
  color: #456;
  margin: 2px 0;
}

.rn-new {
  color: #6d6;
  word-break: break-all;
}

.rn-btns {
  display: flex;
  gap: 8px;
  padding: 8px 13px 12px;
}

.rn-btn {
  flex: 1;
  padding: 7px 0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}

.rn-cancel {
  background: #2a2a3a;
  color: #889;
}

.rn-cancel:hover {
  background: #3a3a4a;
}

.rn-rename-now {
  background: #1a5c2a;
  color: #cfc;
}

.rn-rename-now:hover {
  background: #247a38;
}

.rn-rename-now:disabled {
  opacity: 0.4;
  cursor: default;
}

#rg-settings-btn {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 9999;
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background: #1a1a2e;
  border: 1px solid #2a2a45;
  color: #567;
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: all 0.18s;
  user-select: none;
}
#rg-settings-btn:hover {
  border-color: #4cc;
  color: #4cc;
}

#rg-settings-panel {
  position: fixed;
  top: 0;
  right: -440px;
  width: 420px;
  height: 100vh;
  background: #12121e;
  border-left: 1px solid #2a2a40;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.65);
  font-family: sans-serif;
  font-size: 13px;
  color: #e0e0e0;
  transition: right 0.25s ease;
  overflow: hidden;
}
#rg-settings-panel.open {
  right: 0;
}

.rgs-head {
  background: #0d0d1e;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: bold;
  color: #4cc;
  border-bottom: 1px solid #2a2a40;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.rgs-close {
  cursor: pointer;
  color: #789;
  font-size: 18px;
}

.rgs-tabs {
  display: flex;
  border-bottom: 1px solid #2a2a40;
  flex-shrink: 0;
}

.rgs-tab {
  flex: 1;
  padding: 9px 4px;
  text-align: center;
  font-size: 11px;
  color: #567;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  user-select: none;
  transition: all 0.14s;
}
.rgs-tab:hover {
  color: #99b;
}
.rgs-tab.active {
  color: #4cc;
  border-bottom-color: #4cc;
}

.rgs-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}

.rgs-section {
  margin-bottom: 18px;
}

.rgs-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #456;
  margin-bottom: 7px;
}

.rgs-desc {
  font-size: 11px;
  color: #567;
  margin-bottom: 8px;
  line-height: 1.5;
}

.rgs-pills-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 6px;
}

.rgs-pill {
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid #3a3a55;
  background: transparent;
  color: #889;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  transition: all 0.13s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.rgs-pill:hover {
  border-color: #777;
  color: #bbb;
}
.rgs-pill.active {
  border-color: #4cc;
  background: #0d2a33;
  color: #4ef;
}
.rgs-pill .rgs-x {
  color: #567;
  font-size: 12px;
  transition: color 0.12s;
}
.rgs-pill:hover .rgs-x {
  color: #f88;
}

.rgs-add-row {
  display: flex;
  gap: 7px;
  margin-top: 7px;
}

.rgs-input {
  flex: 1;
  padding: 5px 9px;
  background: #1a1a2e;
  border: 1px solid #3a3a55;
  border-radius: 6px;
  color: #ddd;
  font-size: 12px;
  outline: none;
}
.rgs-input:focus {
  border-color: #4cc;
}

.rgs-add-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid #4cc;
  background: transparent;
  color: #4cc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.13s;
}
.rgs-add-btn:hover {
  background: #0d2a33;
}

.rgs-key-box {
  background: #0d0d1e;
  border: 1px solid #2a2a40;
  border-radius: 6px;
  padding: 8px 11px;
  font-family: monospace;
  font-size: 11px;
  color: #6b9;
  word-break: break-all;
  margin-bottom: 6px;
}

.rgs-small-btn {
  padding: 5px 11px;
  border-radius: 5px;
  border: 1px solid #3a3a55;
  background: transparent;
  color: #889;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.13s;
}
.rgs-small-btn:hover {
  border-color: #f88;
  color: #f88;
}`, ""]);
// Exports
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (___CSS_LOADER_EXPORT___);


/***/ },

/***/ "./node_modules/css-loader/dist/runtime/api.js"
/*!*****************************************************!*\
  !*** ./node_modules/css-loader/dist/runtime/api.js ***!
  \*****************************************************/
(module) {



/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
module.exports = function (cssWithMappingToString) {
  var list = [];

  // return the list of modules as css string
  list.toString = function toString() {
    return this.map(function (item) {
      var content = "";
      var needLayer = typeof item[5] !== "undefined";
      if (item[4]) {
        content += "@supports (".concat(item[4], ") {");
      }
      if (item[2]) {
        content += "@media ".concat(item[2], " {");
      }
      if (needLayer) {
        content += "@layer".concat(item[5].length > 0 ? " ".concat(item[5]) : "", " {");
      }
      content += cssWithMappingToString(item);
      if (needLayer) {
        content += "}";
      }
      if (item[2]) {
        content += "}";
      }
      if (item[4]) {
        content += "}";
      }
      return content;
    }).join("");
  };

  // import a list of modules into the list
  list.i = function i(modules, media, dedupe, supports, layer) {
    if (typeof modules === "string") {
      modules = [[null, modules, undefined]];
    }
    var alreadyImportedModules = {};
    if (dedupe) {
      for (var k = 0; k < this.length; k++) {
        var id = this[k][0];
        if (id != null) {
          alreadyImportedModules[id] = true;
        }
      }
    }
    for (var _k = 0; _k < modules.length; _k++) {
      var item = [].concat(modules[_k]);
      if (dedupe && alreadyImportedModules[item[0]]) {
        continue;
      }
      if (typeof layer !== "undefined") {
        if (typeof item[5] === "undefined") {
          item[5] = layer;
        } else {
          item[1] = "@layer".concat(item[5].length > 0 ? " ".concat(item[5]) : "", " {").concat(item[1], "}");
          item[5] = layer;
        }
      }
      if (media) {
        if (!item[2]) {
          item[2] = media;
        } else {
          item[1] = "@media ".concat(item[2], " {").concat(item[1], "}");
          item[2] = media;
        }
      }
      if (supports) {
        if (!item[4]) {
          item[4] = "".concat(supports);
        } else {
          item[1] = "@supports (".concat(item[4], ") {").concat(item[1], "}");
          item[4] = supports;
        }
      }
      list.push(item);
    }
  };
  return list;
};

/***/ },

/***/ "./node_modules/css-loader/dist/runtime/noSourceMaps.js"
/*!**************************************************************!*\
  !*** ./node_modules/css-loader/dist/runtime/noSourceMaps.js ***!
  \**************************************************************/
(module) {



module.exports = function (i) {
  return i[1];
};

/***/ },

/***/ "./src/scss/main.scss"
/*!****************************!*\
  !*** ./src/scss/main.scss ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js */ "./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleDomAPI.js */ "./node_modules/style-loader/dist/runtime/styleDomAPI.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertBySelector.js */ "./node_modules/style-loader/dist/runtime/insertBySelector.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js */ "./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertStyleElement.js */ "./node_modules/style-loader/dist/runtime/insertStyleElement.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleTagTransform.js */ "./node_modules/style-loader/dist/runtime/styleTagTransform.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_main_scss__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! !!../../node_modules/css-loader/dist/cjs.js!../../node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./main.scss */ "./node_modules/css-loader/dist/cjs.js!./node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./src/scss/main.scss");

      
      
      
      
      
      
      
      
      

var options = {};

options.styleTagTransform = (_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default());
options.setAttributes = (_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default());

      options.insert = _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default().bind(null, "head");
    
options.domAPI = (_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default());
options.insertStyleElement = (_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default());

var update = _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default()(_node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_main_scss__WEBPACK_IMPORTED_MODULE_6__["default"], options);




       /* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_main_scss__WEBPACK_IMPORTED_MODULE_6__["default"] && _node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_main_scss__WEBPACK_IMPORTED_MODULE_6__["default"].locals ? _node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_main_scss__WEBPACK_IMPORTED_MODULE_6__["default"].locals : undefined);


/***/ },

/***/ "./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js"
/*!****************************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js ***!
  \****************************************************************************/
(module) {



var stylesInDOM = [];
function getIndexByIdentifier(identifier) {
  var result = -1;
  for (var i = 0; i < stylesInDOM.length; i++) {
    if (stylesInDOM[i].identifier === identifier) {
      result = i;
      break;
    }
  }
  return result;
}
function modulesToDom(list, options) {
  var idCountMap = {};
  var identifiers = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var id = options.base ? item[0] + options.base : item[0];
    var count = idCountMap[id] || 0;
    var identifier = "".concat(id, " ").concat(count);
    idCountMap[id] = count + 1;
    var indexByIdentifier = getIndexByIdentifier(identifier);
    var obj = {
      css: item[1],
      media: item[2],
      sourceMap: item[3],
      supports: item[4],
      layer: item[5]
    };
    if (indexByIdentifier !== -1) {
      stylesInDOM[indexByIdentifier].references++;
      stylesInDOM[indexByIdentifier].updater(obj);
    } else {
      var updater = addElementStyle(obj, options);
      options.byIndex = i;
      stylesInDOM.splice(i, 0, {
        identifier: identifier,
        updater: updater,
        references: 1
      });
    }
    identifiers.push(identifier);
  }
  return identifiers;
}
function addElementStyle(obj, options) {
  var api = options.domAPI(options);
  api.update(obj);
  var updater = function updater(newObj) {
    if (newObj) {
      if (newObj.css === obj.css && newObj.media === obj.media && newObj.sourceMap === obj.sourceMap && newObj.supports === obj.supports && newObj.layer === obj.layer) {
        return;
      }
      api.update(obj = newObj);
    } else {
      api.remove();
    }
  };
  return updater;
}
module.exports = function (list, options) {
  options = options || {};
  list = list || [];
  var lastIdentifiers = modulesToDom(list, options);
  return function update(newList) {
    newList = newList || [];
    for (var i = 0; i < lastIdentifiers.length; i++) {
      var identifier = lastIdentifiers[i];
      var index = getIndexByIdentifier(identifier);
      stylesInDOM[index].references--;
    }
    var newLastIdentifiers = modulesToDom(newList, options);
    for (var _i = 0; _i < lastIdentifiers.length; _i++) {
      var _identifier = lastIdentifiers[_i];
      var _index = getIndexByIdentifier(_identifier);
      if (stylesInDOM[_index].references === 0) {
        stylesInDOM[_index].updater();
        stylesInDOM.splice(_index, 1);
      }
    }
    lastIdentifiers = newLastIdentifiers;
  };
};

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/insertBySelector.js"
/*!********************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/insertBySelector.js ***!
  \********************************************************************/
(module) {



var memo = {};

/* istanbul ignore next  */
function getTarget(target) {
  if (typeof memo[target] === "undefined") {
    var styleTarget = document.querySelector(target);

    // Special case to return head of iframe instead of iframe itself
    if (window.HTMLIFrameElement && styleTarget instanceof window.HTMLIFrameElement) {
      try {
        // This will throw an exception if access to iframe is blocked
        // due to cross-origin restrictions
        styleTarget = styleTarget.contentDocument.head;
      } catch (e) {
        // istanbul ignore next
        styleTarget = null;
      }
    }
    memo[target] = styleTarget;
  }
  return memo[target];
}

/* istanbul ignore next  */
function insertBySelector(insert, style) {
  var target = getTarget(insert);
  if (!target) {
    throw new Error("Couldn't find a style target. This probably means that the value for the 'insert' parameter is invalid.");
  }
  target.appendChild(style);
}
module.exports = insertBySelector;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/insertStyleElement.js"
/*!**********************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/insertStyleElement.js ***!
  \**********************************************************************/
(module) {



/* istanbul ignore next  */
function insertStyleElement(options) {
  var element = document.createElement("style");
  options.setAttributes(element, options.attributes);
  options.insert(element, options.options);
  return element;
}
module.exports = insertStyleElement;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js"
/*!**********************************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js ***!
  \**********************************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {



/* istanbul ignore next  */
function setAttributesWithoutAttributes(styleElement) {
  var nonce =  true ? __webpack_require__.nc : 0;
  if (nonce) {
    styleElement.setAttribute("nonce", nonce);
  }
}
module.exports = setAttributesWithoutAttributes;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/styleDomAPI.js"
/*!***************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/styleDomAPI.js ***!
  \***************************************************************/
(module) {



/* istanbul ignore next  */
function apply(styleElement, options, obj) {
  var css = "";
  if (obj.supports) {
    css += "@supports (".concat(obj.supports, ") {");
  }
  if (obj.media) {
    css += "@media ".concat(obj.media, " {");
  }
  var needLayer = typeof obj.layer !== "undefined";
  if (needLayer) {
    css += "@layer".concat(obj.layer.length > 0 ? " ".concat(obj.layer) : "", " {");
  }
  css += obj.css;
  if (needLayer) {
    css += "}";
  }
  if (obj.media) {
    css += "}";
  }
  if (obj.supports) {
    css += "}";
  }
  var sourceMap = obj.sourceMap;
  if (sourceMap && typeof btoa !== "undefined") {
    css += "\n/*# sourceMappingURL=data:application/json;base64,".concat(btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap)))), " */");
  }

  // For old IE
  /* istanbul ignore if  */
  options.styleTagTransform(css, styleElement, options.options);
}
function removeStyleElement(styleElement) {
  // istanbul ignore if
  if (styleElement.parentNode === null) {
    return false;
  }
  styleElement.parentNode.removeChild(styleElement);
}

/* istanbul ignore next  */
function domAPI(options) {
  if (typeof document === "undefined") {
    return {
      update: function update() {},
      remove: function remove() {}
    };
  }
  var styleElement = options.insertStyleElement(options);
  return {
    update: function update(obj) {
      apply(styleElement, options, obj);
    },
    remove: function remove() {
      removeStyleElement(styleElement);
    }
  };
}
module.exports = domAPI;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/styleTagTransform.js"
/*!*********************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/styleTagTransform.js ***!
  \*********************************************************************/
(module) {



/* istanbul ignore next  */
function styleTagTransform(css, styleElement) {
  if (styleElement.styleSheet) {
    styleElement.styleSheet.cssText = css;
  } else {
    while (styleElement.firstChild) {
      styleElement.removeChild(styleElement.firstChild);
    }
    styleElement.appendChild(document.createTextNode(css));
  }
}
module.exports = styleTagTransform;

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/nonce */
/******/ 	(() => {
/******/ 		__webpack_require__.nc = undefined;
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _scss_main_scss__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./scss/main.scss */ "./src/scss/main.scss");
/* harmony import */ var _modules_constants_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./modules/constants.js */ "./src/modules/constants.js");
/* harmony import */ var _modules_settings_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./modules/settings.js */ "./src/modules/settings.js");
/* harmony import */ var _modules_ep_editor_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./modules/ep-editor.js */ "./src/modules/ep-editor.js");
/* harmony import */ var _modules_series_page_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./modules/series-page.js */ "./src/modules/series-page.js");
/* harmony import */ var _modules_pickers_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./modules/pickers.js */ "./src/modules/pickers.js");
/* harmony import */ var _modules_rg_parser_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./modules/rg-parser.js */ "./src/modules/rg-parser.js");




// ── Module imports ────────────────────────────────────────────────────────────







// ── Apply saved settings ──────────────────────────────────────────────────────
(0,_modules_settings_js__WEBPACK_IMPORTED_MODULE_2__.applySavedNetworks)();

// ── Initialize persistent FABs ────────────────────────────────────────────────
(0,_modules_series_page_js__WEBPACK_IMPORTED_MODULE_4__.initFABs)();

// ── React value setter helper ─────────────────────────────────────────────────
function setReactValue(input, value) {
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeSet.call(input, value);
  input.dispatchEvent(new Event("input", {
    bubbles: true
  }));
}

// ── Release Group modal row helper ────────────────────────────────────────────
function makeRow(labelText, rightEl) {
  const row = document.createElement("div");
  row.className = "rg-row";
  const lbl = document.createElement("div");
  lbl.className = "rg-label";
  lbl.textContent = labelText;
  const right = document.createElement("div");
  right.className = "rg-right";
  right.appendChild(rightEl);
  row.append(lbl, right);
  return row;
}

// ── Release Group modal injection ─────────────────────────────────────────────
function inject(target) {
  if (target.dataset.rgInjected) return;
  target.dataset.rgInjected = "true";
  const releaseInput = document.querySelector("input[name='releaseGroup']");
  if (!releaseInput) return;
  const parsed = (0,_modules_rg_parser_js__WEBPACK_IMPORTED_MODULE_6__.parseRG)(releaseInput.value);
  const container = document.createElement("div");
  container.id = "rg-container";

  // Network (multi-select)
  const netComp = (0,_modules_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeMultiPills)(_modules_constants_js__WEBPACK_IMPORTED_MODULE_1__.NETWORKS, "net", parsed.networks, sync);
  container.appendChild(makeRow("Network", netComp.el));

  // Edition (multi-select)
  const edtComp = (0,_modules_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeMultiPills)(_modules_constants_js__WEBPACK_IMPORTED_MODULE_1__.EDITIONS, "edt", parsed.editions, sync);
  container.appendChild(makeRow("Edition", edtComp.el));

  // Language (Audio + Sub)
  const audioComp = (0,_modules_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeLangPicker)("Audio", parsed.audioCodes, sync);
  const subComp = (0,_modules_pickers_js__WEBPACK_IMPORTED_MODULE_5__.makeLangPicker)("Subtitle", parsed.subCodes, sync);
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
    const nets = netComp.get(); // string[]
    const edts = edtComp.get(); // string[]
    const audio = audioComp.get();
    const sub = subComp.get();
    const value = (0,_modules_rg_parser_js__WEBPACK_IMPORTED_MODULE_6__.buildValue)(nets, edts, audio, sub);
    preview.textContent = value || "—";
    preview.className = !value ? "empty" : nets.length || edts.length ? "has-network" : "";
    setReactValue(releaseInput, value);
  }
  sync();
}

// ── Interactive Import footer shortcuts ───────────────────────────────────────
function triggerBulkSelect(value) {
  const sel = document.querySelector("select[name='select']");
  if (!sel) return;
  // Use React's native setter so React state picks up the change
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  nativeSetter.call(sel, value);
  sel.dispatchEvent(new Event("change", {
    bubbles: true
  }));
}
function injectImportShortcuts(footer) {
  if (footer.dataset.iiAdded) return;
  footer.dataset.iiAdded = "true";
  const leftArea = footer.querySelector("[class*='leftButtons']");
  if (!leftArea) return;
  const bar = document.createElement("div");
  bar.id = "ii-shortcuts";
  const buttons = [{
    label: "🏷 Release Group",
    cls: "ii-rg",
    action: "releaseGroup"
  }, {
    label: "🎬 Quality",
    cls: "ii-q",
    action: "quality"
  }, {
    label: "🌐 Language",
    cls: "ii-lang",
    action: "language"
  }];
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
const QUALITIES = [{
  label: "WEBDL-1080p",
  name: "WEBDL-1080p"
}, {
  label: "WEBDL-720p",
  name: "WEBDL-720p"
}, {
  label: "WEBDL-2160p",
  name: "WEBDL-2160p"
}, {
  label: "WEBRip-1080p",
  name: "WEBRip-1080p"
}, {
  label: "WEBRip-720p",
  name: "WEBRip-720p"
}, {
  label: "Bluray-1080p",
  name: "Bluray-1080p"
}, {
  label: "Bluray-720p",
  name: "Bluray-720p"
}, {
  label: "Bluray-2160p",
  name: "Bluray-2160p"
}, {
  label: "HDTV-1080p",
  name: "HDTV-1080p"
}, {
  label: "HDTV-720p",
  name: "HDTV-720p"
}, {
  label: "SDTV",
  name: "SDTV"
}];

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
            if (el.textContent.trim() === qualityName && el.children.length === 0) {
              // Click the clickable ancestor (Sonarr wraps text in a container)
              const target = el.closest("[class*='Option']") || el.closest("[class*='Item']") || el.parentElement;
              target === null || target === void 0 || target.click();
              obs.disconnect();
              resolve();
              return;
            }
          }
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout safety: close dropdown if nothing matched within 2 s
    setTimeout(() => {
      obs.disconnect();
      resolve();
    }, 2000);
    btn.click(); // open the dropdown
  });
}
function injectQualityPills(modalBody) {
  if (modalBody.dataset.sqAdded) return;

  // Wait until the Quality FormGroup is actually rendered before proceeding
  const qualityGroup = [...modalBody.querySelectorAll("[class*='FormGroup-group']")].find(g => {
    var _g$querySelector;
    return ((_g$querySelector = g.querySelector("label")) === null || _g$querySelector === void 0 ? void 0 : _g$querySelector.textContent.trim()) === "Quality";
  });
  if (!qualityGroup) return; // not ready yet — don't set flag, retry on next mutation

  modalBody.dataset.sqAdded = "true"; // set only after content confirmed present

  // Determine currently selected quality from the button text
  const getSelected = () => {
    var _modalBody$querySelec;
    return ((_modalBody$querySelec = modalBody.querySelector("[class*='HintedSelectInputSelectedValue-valueText']")) === null || _modalBody$querySelec === void 0 ? void 0 : _modalBody$querySelec.textContent.trim()) ?? "";
  };
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
  const rgModalBody = document.querySelector("[class^='SelectReleaseGroupModalContent-modalBody']");
  const rgTarget = rgModalBody === null || rgModalBody === void 0 ? void 0 : rgModalBody.querySelector("div");
  if (rgTarget) inject(rgTarget);

  // Interactive Import footer shortcuts
  const importFooter = document.querySelector("[class*='InteractiveImportModalContent-footer']");
  if (importFooter) injectImportShortcuts(importFooter);

  // Select Quality modal — detect by EnhancedSelectInput presence inside a modal body
  // Walk up from the EnhancedSelect button to find the closest innerModalBody
  const enhancedSelect = document.querySelector("[class*='EnhancedSelectInput-enhancedSelect']");
  if (enhancedSelect) {
    const modalInner = enhancedSelect.closest("[class*='ModalBody-innerModalBody']");
    if (modalInner) injectQualityPills(modalInner);
  }

  // Per-episode edit buttons (series page)
  (0,_modules_ep_editor_js__WEBPACK_IMPORTED_MODULE_3__.injectEpEditBtns)();
}).observe(document.body, {
  childList: true,
  subtree: true
});

// ── Start SPA navigation watcher ─────────────────────────────────────────────
(0,_modules_series_page_js__WEBPACK_IMPORTED_MODULE_4__.watchNavigation)();
})();

/******/ })()
;