#!/bin/bash
# qui Automation: Rename season-pack torrent to episode-specific name for Sonarr.
#
# Conditions handled by qui automation:
#   - Category = tv
#   - State = Completed
#   - Tracker filter (for narrowing, NOT for release group — that's checked via created_by)
#
# DONE_TAG (default: LOL-Checked) is added to EVERY torrent after login+tag-check,
# regardless of outcome — even if it's not LOL group, not a folder, no episodes found.
# Once checked, it won't be re-checked. qui automation uses this tag as a filter
# condition. Script also checks the tag for manual/CLI runs.
#
# Setup in qui External Programs:
#   Program:   /config/rename-season-torrent.sh
#   Arguments: "{hash}" "{name}"
#              Prepend --dry-run to simulate without making changes
#
# Env vars:
#   QB_HOST    default: http://qbittorrent:8080
#   QB_USER    default: totza2010
#   QB_PASS    default: Musiclike.1994
#   QB_GROUPS  comma-separated release groups to allow, default: LOL
#   LOG_FILE   default: /config/rename-season-torrent.log
#   DRY_RUN    1 = simulate (same as --dry-run arg)
#   DONE_TAG   tag applied to all examined LOL torrents, default: LOL-Checked

QB_HOST="${QB_HOST:-http://qbittorrent:8080}"
QB_USER="${QB_USER:-totza2010}"
QB_PASS="${QB_PASS:-Musiclike.1994}"
QB_GROUPS="${QB_GROUPS:-LOL}"
LOG_FILE="${LOG_FILE:-/config/rename-season-torrent.log}"
DRY_RUN="${DRY_RUN:-0}"
DONE_TAG="${DONE_TAG:-LOL-Checked}"

# ── helpers ────────────────────────────────────────────────────────────────────

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
debug() { log "[DEBUG] $*"; }

skip() {
    log "Skipping: $1"
    exit 0
}

# Tag then exit — used for ALL skips after login+tag-check pass
tag_and_skip() {
    log "Skipping: $1"
    add_tag
    exit 0
}

contains_substr() {
    echo "$1" | grep -qiF "$2"
}

add_tag() {
    if [[ "$DRY_RUN" == "1" ]]; then
        log "[DRY RUN] Would add tag: $DONE_TAG"
        return
    fi
    debug "Adding tag '$DONE_TAG'..."
    TAG_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$QB_HOST/api/v2/torrents/addTags" \
        --data-urlencode "hashes=$HASH" \
        --data-urlencode "tags=$DONE_TAG")
    debug "Tag response: '${TAG_RESP:-ok}'"
    log "Tagged: $DONE_TAG"
}

# ── parse args ─────────────────────────────────────────────────────────────────

POSITIONAL=()
for arg in "$@"; do
    [[ "$arg" == "--dry-run" ]] && DRY_RUN=1 || POSITIONAL+=("$arg")
done

if [[ ${#POSITIONAL[@]} -lt 2 ]]; then
    echo "Usage: $0 [--dry-run] <hash> <name>"
    exit 1
fi

HASH="${POSITIONAL[0]}"
NAME="${POSITIONAL[1]}"

log "========================================"
log "Hash:    $HASH"
log "Name:    $NAME"
log "DryRun:  $DRY_RUN"
[[ "$DRY_RUN" == "1" ]] && log "[DRY RUN] No changes will be made."

# ── login ──────────────────────────────────────────────────────────────────────

debug "Logging in to $QB_HOST ..."
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$QB_HOST/api/v2/auth/login" \
    --data-urlencode "username=$QB_USER" \
    --data-urlencode "password=$QB_PASS")

debug "Login response: $LOGIN_RESP"
[[ "$LOGIN_RESP" == "Ok." ]] || { log "Login failed: $LOGIN_RESP"; exit 1; }

# ── filter: already tagged ────────────────────────────────────────────────────
# (for manual/CLI runs where qui automation filter isn't in play)

debug "Checking for existing tag '$DONE_TAG'..."
TORRENT_TAGS=$(curl -s -b "$COOKIE_JAR" \
    "$QB_HOST/api/v2/torrents/info?hashes=$HASH" \
    | grep -o '"tags":"[^"]*"' | cut -d'"' -f4)

debug "Current tags: '$TORRENT_TAGS'"
contains_substr "$TORRENT_TAGS" "$DONE_TAG" && skip "already tagged '$DONE_TAG'"

# ── filter: season-only name ──────────────────────────────────────────────────

debug "Checking season pattern in name..."
echo "$NAME" | grep -qiE 'S[0-9]+E[0-9]+' && tag_and_skip "name already has episode number"
echo "$NAME" | grep -qiE 'S[0-9]+-S[0-9]+' && tag_and_skip "multi-season pack, Sonarr cannot import"
echo "$NAME" | grep -qiE 'S[0-9]+'          || tag_and_skip "no season pattern found in name"
debug "Season-only name confirmed."

# ── filter: release group via created_by ──────────────────────────────────────

debug "Fetching torrent properties for created_by check..."
PROPS_JSON=$(curl -s -b "$COOKIE_JAR" "$QB_HOST/api/v2/torrents/properties?hash=$HASH")
debug "Properties (truncated): ${PROPS_JSON:0:200}"

CREATED_BY=$(echo "$PROPS_JSON" \
    | grep -o '"created_by":"[^"]*"' | cut -d'"' -f4 | tr -d '[](){} ')
debug "created_by (cleaned): '$CREATED_BY'"

if [[ -n "$CREATED_BY" ]]; then
    matched=0
    IFS=',' read -ra REL_GROUPS <<< "$QB_GROUPS"
    for g in "${REL_GROUPS[@]}"; do
        g=$(echo "$g" | tr -d ' ')
        debug "Checking group '$g' against created_by '$CREATED_BY'..."
        contains_substr "$CREATED_BY" "$g" && matched=1
    done
    [[ $matched -eq 0 ]] && tag_and_skip "created_by '$CREATED_BY' not in allowed groups [$QB_GROUPS]"
    debug "Release group matched via created_by."
else
    REL_GROUP=$(echo "$NAME" | grep -oiE '\-[A-Za-z0-9]+$' | tr -d '-')
    debug "created_by empty, fallback group from name: '$REL_GROUP'"
    matched=0
    IFS=',' read -ra REL_GROUPS <<< "$QB_GROUPS"
    for g in "${REL_GROUPS[@]}"; do
        g=$(echo "$g" | tr -d ' ')
        contains_substr "$REL_GROUP" "$g" && matched=1
    done
    [[ $matched -eq 0 ]] && tag_and_skip "release group '$REL_GROUP' not in allowed list [$QB_GROUPS]"
    debug "Release group matched via name fallback."
fi

# ── get files ──────────────────────────────────────────────────────────────────

debug "Fetching file list..."
FILES_JSON=$(curl -s -b "$COOKIE_JAR" "$QB_HOST/api/v2/torrents/files?hash=$HASH")
debug "Files JSON (truncated): ${FILES_JSON:0:300}"

FILE_NAMES=$(echo "$FILES_JSON" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
debug "File names extracted:"
echo "$FILE_NAMES" | while IFS= read -r line; do debug "  $line"; done

# ── filter: must be folder torrent ────────────────────────────────────────────

debug "Checking folder structure..."
echo "$FILE_NAMES" | grep -q '/' || tag_and_skip "not a folder torrent (single-file at root)"
debug "Folder torrent confirmed."

# ── extract episode numbers ────────────────────────────────────────────────────

debug "Extracting episode numbers from filenames..."
EP_SORTED=$(echo "$FILE_NAMES" \
    | grep -oiE 'S[0-9]+E[0-9]+' \
    | grep -oiE 'E[0-9]+' \
    | sed 's/[Ee]//i' \
    | sort -n | uniq)

debug "Episodes found: $(echo "$EP_SORTED" | tr '\n' ' ')"
[[ -z "$EP_SORTED" ]] && tag_and_skip "no episode numbers found in files"

FIRST_EP=$(echo "$EP_SORTED" | head -1)
LAST_EP=$(echo  "$EP_SORTED" | tail -1)
EP_COUNT=$(echo "$EP_SORTED" | wc -l | tr -d ' ')

debug "First: $FIRST_EP | Last: $LAST_EP | Count: $EP_COUNT"

# ── build episode tag ──────────────────────────────────────────────────────────

if [[ "$EP_COUNT" -eq 1 ]]; then
    EP_TAG=$(printf "E%02d" $(( 10#$FIRST_EP )))
else
    EP_TAG=$(printf "E%02d-E%02d" $(( 10#$FIRST_EP )) $(( 10#$LAST_EP )))
fi
debug "Episode tag: $EP_TAG"

# ── build new name ─────────────────────────────────────────────────────────────

SEASON=$(echo "$NAME" | grep -oiE 'S[0-9]+' | head -1)
NEW_NAME="${NAME/"$SEASON."/"$SEASON$EP_TAG."}"
debug "Season: $SEASON | New name: $NEW_NAME"

[[ "$NEW_NAME" == "$NAME" ]] && tag_and_skip "could not insert episode tag into name"

# ── dry run exit ───────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "1" ]]; then
    log "[DRY RUN] Would rename: $NAME"
    log "[DRY RUN]          To: $NEW_NAME"
    add_tag
    exit 0
fi

# ── rename ─────────────────────────────────────────────────────────────────────

debug "Renaming torrent..."
RENAME_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$QB_HOST/api/v2/torrents/rename" \
    --data-urlencode "hash=$HASH" \
    --data-urlencode "name=$NEW_NAME")
debug "Rename response: '${RENAME_RESP:-ok}'"

log "Renamed: $NAME"
log "     To: $NEW_NAME"

add_tag
