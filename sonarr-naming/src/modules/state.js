// ── Shared mutable state ──────────────────────────────────────────────────────

// Series page data cache (populated by checkSeriesPage, used by injectEpEditBtns)
let _spData = null;

// Guard: true while a refetchFilesAndReInject fetch is in-flight
let _refetching = false;

export function getSpData() {
    return _spData;
}

export function setSpData(data) {
    _spData = data;
}

export function clearSpData() {
    _spData = null;
}

export function isRefetching() {
    return _refetching;
}

export function setRefetching(val) {
    _refetching = val;
}
