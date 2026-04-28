// ── Static data ───────────────────────────────────────────────────────────────

// ── Network definitions ───────────────────────────────────────────────────────
//
// เพิ่ม network ใหม่ → เพิ่มแค่ 1 บรรทัดในกลุ่มที่ถูกต้อง
// เพิ่มกลุ่มใหม่  → เพิ่ม key ใหม่ใน NETWORK_CONFIG
//
// name  : ชื่อแสดงใน picker
// code  : code ที่เขียนลง Release Group เช่น [TrueID], [NF]

const NETWORK_CONFIG = {
    // ── Thai / Southeast Asia ─────────────────────────────────────────────
    TH: { networks: [
        { name: "TrueID",      code: "TrueID"  },
        { name: "Viu",         code: "VIU"     },
        { name: "WeTV",        code: "WeTV"    },
        { name: "iQIYI",       code: "IQ"      },
        { name: "MONO MAX",    code: "MONOMAX" },
        { name: "NANA",        code: "NANA"    },
        { name: "LINE TV",     code: "LINETV"  },
        { name: "AIS Play",    code: "AIS"     },
    ]},
    // ── China / Japan / Korea ─────────────────────────────────────────────
    Asia: { networks: [
        { name: "YouKu",       code: "YOUKU"  },
        { name: "Bilibili",    code: "BL"     },
        { name: "MGTV",        code: "MGTV"   },
        { name: "Crunchyroll", code: "CR"     },
        { name: "HIDIVE",      code: "HIDIVE" },
        { name: "Viki",        code: "VIKI"   },
    ]},
    // ── Global ────────────────────────────────────────────────────────────
    Global: { networks: [
        { name: "Netflix",     code: "NF"   },
        { name: "Disney+",     code: "DSNP" },
        { name: "Max",         code: "MAX"  },
        { name: "HBO",         code: "HBO"  },
        { name: "Amazon",      code: "AMZN" },
        { name: "Apple TV+",   code: "ATVP" },
        { name: "Hulu",        code: "HULU" },
        { name: "Peacock",     code: "PCOK" },
        { name: "Paramount+",  code: "PMTP" },
        { name: "Showtime",    code: "SHO"  },
    ]},
};

// NETWORKS — flat [{label, value}] (backward-compat; settings.js can push/splice)
export const NETWORKS = Object.values(NETWORK_CONFIG)
    .flatMap(g => g.networks.map(({ name: label, code: value }) => ({ label, value })));

// NETWORK_GROUPS — { TH: [{label,value},...], Asia: [...], Global: [...] }
export const NETWORK_GROUPS = Object.fromEntries(
    Object.entries(NETWORK_CONFIG).map(([group, { networks }]) => [
        group,
        networks.map(({ name: label, code: value }) => ({ label, value })),
    ])
);

// NETWORK_GROUP_ORDER — ลำดับกลุ่มตาม key order ใน NETWORK_CONFIG
export const NETWORK_GROUP_ORDER = Object.keys(NETWORK_CONFIG);

export const EDITIONS = [
    { label: "Uncensored",      value: "Uncensored"  },
    { label: "Uncut",           value: "Uncut"        },
    { label: "Unrated",         value: "Unrated"      },
    { label: "Extended",        value: "Extended"     },
    { label: "Director's Cut",  value: "DirectorsCut" },
    { label: "Theatrical",      value: "Theatrical"   },
    { label: "Remastered",      value: "Remastered"   },
    { label: "Collector's",     value: "Collectors"   },
    { label: "Translate",       value: "Translate"    },
    { label: "Channel 7 voice", value: "CH7Voice"     },
];

// ── Language definitions ──────────────────────────────────────────────────────
//
// เพิ่มภาษาใหม่ → เพิ่มแค่ 1 บรรทัดที่นี่ที่เดียว
//
// iso2   : 2-char output code ที่ใช้ทั่วระบบ (AudioTH, SubEN, …)
// label  : ชื่อเต็มที่แสดงใน UI
// iso3   : ISO 639-2 3-char codes ที่ Sonarr / MediaInfo ส่งมา (รองรับหลาย alias)
// pinned : true = แสดงก่อนเสมอ ไม่เรียงตาม usage stats

/** @typedef {{ iso2: string, label: string, iso3: string[], pinned?: boolean }} LangDef */

/** @type {LangDef[]} */
const LANG_DEFS = [
    // ── Priority (pinned — always appear at top regardless of usage) ──────
    { iso2: "TH", label: "Thai",       iso3: ["tha"],            pinned: true },
    { iso2: "EN", label: "English",    iso3: ["eng"],            pinned: true },
    // ── Asian streaming (common) ──────────────────────────────────────────
    { iso2: "ZH", label: "Chinese",    iso3: ["zho", "chi"]                   },
    { iso2: "JA", label: "Japanese",   iso3: ["jpn"]                          },
    { iso2: "KO", label: "Korean",     iso3: ["kor"]                          },
    { iso2: "MS", label: "Malay",      iso3: ["msa", "may"]                   },
    { iso2: "ID", label: "Indonesian", iso3: ["ind"]                          },
    { iso2: "VI", label: "Vietnamese", iso3: ["vie"]                          },
    { iso2: "TL", label: "Tagalog",    iso3: ["tgl"]                          },
    { iso2: "MY", label: "Burmese",    iso3: ["mya", "bur"]                   },
    { iso2: "KM", label: "Khmer",      iso3: ["khm"]                          },
    { iso2: "LO", label: "Lao",        iso3: ["lao"]                          },
    { iso2: "HI", label: "Hindi",      iso3: ["hin"]                          },
    { iso2: "AR", label: "Arabic",     iso3: ["ara"]                          },
    // ── European & others (alphabetical) ─────────────────────────────────
    { iso2: "BG", label: "Bulgarian",  iso3: ["bul"]                          },
    { iso2: "CA", label: "Catalan",    iso3: ["cat"]                          },
    { iso2: "HR", label: "Croatian",   iso3: ["hrv"]                          },
    { iso2: "CS", label: "Czech",      iso3: ["ces", "cze"]                   },
    { iso2: "DA", label: "Danish",     iso3: ["dan"]                          },
    { iso2: "NL", label: "Dutch",      iso3: ["nld", "dut"]                   },
    { iso2: "ET", label: "Estonian",   iso3: ["est"]                          },
    { iso2: "FI", label: "Finnish",    iso3: ["fin"]                          },
    { iso2: "FR", label: "French",     iso3: ["fra", "fre"]                   },
    { iso2: "DE", label: "German",     iso3: ["deu", "ger"]                   },
    { iso2: "EL", label: "Greek",      iso3: ["ell", "gre"]                   },
    { iso2: "HE", label: "Hebrew",     iso3: ["heb"]                          },
    { iso2: "HU", label: "Hungarian",  iso3: ["hun"]                          },
    { iso2: "IT", label: "Italian",    iso3: ["ita"]                          },
    { iso2: "LV", label: "Latvian",    iso3: ["lav"]                          },
    { iso2: "LT", label: "Lithuanian", iso3: ["lit"]                          },
    { iso2: "NO", label: "Norwegian",  iso3: ["nor"]                          },
    { iso2: "PL", label: "Polish",     iso3: ["pol"]                          },
    { iso2: "PT", label: "Portuguese", iso3: ["por"]                          },
    { iso2: "RO", label: "Romanian",   iso3: ["ron", "rum"]                   },
    { iso2: "RU", label: "Russian",    iso3: ["rus"]                          },
    { iso2: "SR", label: "Serbian",    iso3: ["srp"]                          },
    { iso2: "SK", label: "Slovak",     iso3: ["slk", "slo"]                   },
    { iso2: "SL", label: "Slovenian",  iso3: ["slv"]                          },
    { iso2: "ES", label: "Spanish",    iso3: ["spa"]                          },
    { iso2: "SV", label: "Swedish",    iso3: ["swe"]                          },
    { iso2: "TR", label: "Turkish",    iso3: ["tur"]                          },
    { iso2: "UK", label: "Ukrainian",  iso3: ["ukr"]                          },
];

// LANGS — [{label, value}] สำหรับ pickers / UI
export const LANGS = LANG_DEFS.map(({ label, iso2: value }) => ({ label, value }));

// LANG_NAME_MAP — iso3 code → iso2  สำหรับ lang.js::mapLangNameToCode
export const LANG_NAME_MAP = Object.fromEntries(
    LANG_DEFS.flatMap(({ iso2, iso3 }) => iso3.map(code => [code, iso2]))
);

// LANG_PINNED — ["TH","EN"] codes ที่ pinned:true
export const LANG_PINNED = LANG_DEFS.filter(l => l.pinned).map(l => l.iso2);

// HDTV quality id → WEBDL replacement (standard Sonarr quality IDs)
export const HDTV_FIX = {
    4:  { id: 5,  name: "WEBDL-720p"  },   // HDTV-720p  → WEBDL-720p
    9:  { id: 3,  name: "WEBDL-1080p" },   // HDTV-1080p → WEBDL-1080p
    16: { id: 19, name: "WEBDL-2160p" },   // HDTV-2160p → WEBDL-2160p
};

export const MAX_LANG = 4;

// ── Storage keys ──────────────────────────────────────────────────────────────
export const LANG_STATS_KEY = `rg_langstats_${location.hostname}`;
export const APIKEY_KEY     = `sonarr_apikey_${location.hostname}`;

// Matches one OR MORE consecutive [bracket] groups followed by "-"
// e.g. "[TrueID]-"  "[TrueID][IQ]-"  "[TrueID][IQ][Extended]-"
export const RG_PREFIX_RE = /^(?:\[[^\]]+\])+-/;
