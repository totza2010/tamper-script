// ── Static data ───────────────────────────────────────────────────────────────

export const NETWORKS = [
    // ── Thai / Southeast Asia ────────────────────────────────────────────
    { label: "TrueID",     value: "TrueID"   },
    { label: "Viu",        value: "VIU"      },
    { label: "WeTV",       value: "WeTV"     },
    { label: "iQIYI",      value: "IQ"       },
    { label: "MONO MAX",   value: "MONOMAX"  },
    { label: "NANA",       value: "NANA"     },
    { label: "LINE TV",    value: "LINETV"   },
    { label: "AIS Play",   value: "AIS"      },
    // ── China / Japan / Korea ────────────────────────────────────────────
    { label: "YouKu",      value: "YOUKU"    },
    { label: "Bilibili",   value: "BL"       },
    { label: "MGTV",       value: "MGTV"     },
    { label: "Crunchyroll",value: "CR"       },
    { label: "HIDIVE",     value: "HIDIVE"   },
    { label: "Viki",       value: "VIKI"     },
    // ── Global ───────────────────────────────────────────────────────────
    { label: "Netflix",    value: "NF"       },
    { label: "Disney+",    value: "DSNP"     },
    { label: "Max",        value: "MAX"      },
    { label: "HBO",        value: "HBO"      },
    { label: "Amazon",     value: "AMZN"     },
    { label: "Apple TV+",  value: "ATVP"     },
    { label: "Hulu",       value: "HULU"     },
    { label: "Peacock",    value: "PCOK"     },
    { label: "Paramount+", value: "PMTP"     },
    { label: "Showtime",   value: "SHO"      },
];

export const EDITIONS = [
    { label: "Uncensored", value: "Uncensored" },
    { label: "Uncut", value: "Uncut" },
    { label: "Unrated", value: "Unrated" },
    { label: "Extended", value: "Extended" },
    { label: "Director's Cut", value: "DirectorsCut" },
    { label: "Theatrical", value: "Theatrical" },
    { label: "Remastered", value: "Remastered" },
    { label: "Collector's", value: "Collectors" },
    { label: "Translate", value: "Translate" },
    { label: "Channel 7 voice", value: "CH7Voice" },
];

export const LANGS = [
    // ── Priority (most common in Asian streaming) — appear at top of picker ──
    { label: "Thai",       value: "TH" },
    { label: "English",    value: "EN" },
    { label: "Chinese",    value: "ZH" },
    { label: "Japanese",   value: "JA" },
    { label: "Korean",     value: "KO" },
    { label: "Malay",      value: "MS" },
    { label: "Indonesian", value: "ID" },
    { label: "Vietnamese", value: "VI" },
    { label: "Tagalog",    value: "TL" },
    { label: "Burmese",    value: "MY" },
    { label: "Khmer",      value: "KM" },
    { label: "Lao",        value: "LO" },
    { label: "Hindi",      value: "HI" },
    { label: "Arabic",     value: "AR" },
    // ── European & others (alphabetical) ────────────────────────────────
    { label: "Bulgarian",  value: "BG" },
    { label: "Catalan",    value: "CA" },
    { label: "Croatian",   value: "HR" },
    { label: "Czech",      value: "CS" },
    { label: "Danish",     value: "DA" },
    { label: "Dutch",      value: "NL" },
    { label: "Estonian",   value: "ET" },
    { label: "Finnish",    value: "FI" },
    { label: "French",     value: "FR" },
    { label: "German",     value: "DE" },
    { label: "Greek",      value: "EL" },
    { label: "Hebrew",     value: "HE" },
    { label: "Hungarian",  value: "HU" },
    { label: "Italian",    value: "IT" },
    { label: "Latvian",    value: "LV" },
    { label: "Lithuanian", value: "LT" },
    { label: "Norwegian",  value: "NO" },
    { label: "Polish",     value: "PL" },
    { label: "Portuguese", value: "PT" },
    { label: "Romanian",   value: "RO" },
    { label: "Russian",    value: "RU" },
    { label: "Serbian",    value: "SR" },
    { label: "Slovak",     value: "SK" },
    { label: "Slovenian",  value: "SL" },
    { label: "Spanish",    value: "ES" },
    { label: "Swedish",    value: "SV" },
    { label: "Turkish",    value: "TR" },
    { label: "Ukrainian",  value: "UK" },
];

// ── Language name / code → ISO 639-1 2-char code ─────────────────────────
// Covers:
//   • Full names  (from file.languages[].name  e.g. "Thai", "Korean")
//   • ISO 639-2/T (from mediaInfo.audioLanguages e.g. "tha", "kor", "eng/tha")
//   • ISO 639-2/B alternates (e.g. "chi" for Chinese, "ger" for German)
export const LANG_NAME_MAP = {
    // ── ISO 639-2/T codes (used by MediaInfo → Sonarr mediaInfo fields) ─
    "tha": "TH",  "eng": "EN",  "zho": "ZH",  "chi": "ZH",
    "jpn": "JA",  "kor": "KO",  "msa": "MS",  "may": "MS",
    "ind": "ID",  "vie": "VI",  "tgl": "TL",
    "mya": "MY",  "bur": "MY",  "khm": "KM",  "lao": "LO",
    "hin": "HI",  "ara": "AR",  "bul": "BG",  "cat": "CA",
    "hrv": "HR",  "ces": "CS",  "cze": "CS",  "dan": "DA",
    "nld": "NL",  "dut": "NL",  "est": "ET",  "fin": "FI",
    "fra": "FR",  "fre": "FR",  "deu": "DE",  "ger": "DE",
    "ell": "EL",  "gre": "EL",  "heb": "HE",  "hun": "HU",
    "ita": "IT",  "lav": "LV",  "lit": "LT",  "nor": "NO",
    "pol": "PL",  "por": "PT",  "ron": "RO",  "rum": "RO",
    "rus": "RU",  "srp": "SR",  "slk": "SK",  "slo": "SK",
    "slv": "SL",  "spa": "ES",  "swe": "SV",  "tur": "TR",
    "ukr": "UK",
};

// HDTV quality id → WEBDL replacement (standard Sonarr quality IDs)
export const HDTV_FIX = {
    4:  { id: 5,  name: "WEBDL-720p"  },   // HDTV-720p  → WEBDL-720p
    9:  { id: 3,  name: "WEBDL-1080p" },   // HDTV-1080p → WEBDL-1080p
    16: { id: 19, name: "WEBDL-2160p" },   // HDTV-2160p → WEBDL-2160p
};

export const MAX_LANG = 4;

// Languages pinned at the top regardless of usage stats
export const LANG_PINNED = ["TH", "EN"];

// ── Language usage stats ──────────────────────────────────────────────────
export const LANG_STATS_KEY = `rg_langstats_${location.hostname}`;

export const APIKEY_KEY = `sonarr_apikey_${location.hostname}`;

// Matches one OR MORE consecutive [bracket] groups followed by "-"
// e.g. "[TrueID]-"  "[TrueID][IQ]-"  "[TrueID][IQ][Extended]-"
export const RG_PREFIX_RE = /^(?:\[[^\]]+\])+-/;
