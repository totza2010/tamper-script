#!/usr/bin/env python3
"""
qui External Program: Rename season-pack torrent to episode-specific name for Sonarr.

Setup in qui:
  Program:   python (or python3)
  Arguments: "C:\path\to\rename-season-torrent.py" "{hash}" "{name}" "{category}" "{state}"

Filters (all must pass):
  1. Category must be in QB_CATEGORIES (env var, comma-separated), e.g. "tv,sonarr"
  2. Torrent must be completed (state ends with UP, or progress=1)
  3. Torrent must be a folder (files are inside a subdirectory)
  4. Release group must be in QB_GROUPS (env var, comma-separated), default "LOL"
  5. Torrent name must have season SXX but NOT SXXExx already

Logic:
  The.Boys-S05.1080p...     (season-only name)
    + 1 file  → The.Boys-S05E03.1080p...
    + N files → The.Boys-S05E01-E03.1080p...
"""

import sys
import re
import os
import requests

QB_HOST = os.environ.get("QB_HOST", "http://localhost:8080")
QB_USER = os.environ.get("QB_USER", "admin")
QB_PASS = os.environ.get("QB_PASS", "adminadmin")

# Comma-separated list of allowed categories (leave empty to allow all)
QB_CATEGORIES = [c.strip() for c in os.environ.get("QB_CATEGORIES", "").split(",") if c.strip()]

# Comma-separated list of allowed release groups
QB_GROUPS = [g.strip() for g in os.environ.get("QB_GROUPS", "LOL").split(",") if g.strip()]

# Dry run: simulate without actually renaming (set via --dry-run arg or DRY_RUN=1 env)
DRY_RUN = os.environ.get("DRY_RUN", "0").strip() == "1"

# qBittorrent states that mean the torrent is fully downloaded
COMPLETE_STATES = {
    "uploading", "stalledUP", "pausedUP", "stoppedUP",
    "queuedUP", "checkingUP", "forcedUP",
}


def skip(reason):
    print(f"Skipping: {reason}")
    sys.exit(0)


def login(session):
    resp = session.post(
        f"{QB_HOST}/api/v2/auth/login",
        data={"username": QB_USER, "password": QB_PASS},
    )
    resp.raise_for_status()
    if resp.text.strip() != "Ok.":
        print(f"Login failed: {resp.text}")
        sys.exit(1)


def get_torrent_info(session, torrent_hash):
    resp = session.get(f"{QB_HOST}/api/v2/torrents/info", params={"hashes": torrent_hash})
    resp.raise_for_status()
    data = resp.json()
    return data[0] if data else None


def get_files(session, torrent_hash):
    resp = session.get(f"{QB_HOST}/api/v2/torrents/files", params={"hash": torrent_hash})
    resp.raise_for_status()
    return resp.json()


def is_folder_torrent(files):
    """Returns True if all files are inside a subdirectory (not bare at root)."""
    return any("/" in f["name"] or "\\" in f["name"] for f in files)


def get_created_by(session, torrent_hash):
    """Get the 'created_by' field from torrent properties (e.g. '[LOL]')."""
    resp = session.get(f"{QB_HOST}/api/v2/torrents/properties", params={"hash": torrent_hash})
    resp.raise_for_status()
    props = resp.json()
    return props.get("created_by", "")


def match_group(created_by, allowed_groups):
    """Check if created_by contains any of the allowed group names."""
    created_upper = created_by.upper()
    return any(g.upper() in created_upper for g in allowed_groups)


def get_release_group_from_name(torrent_name):
    """Fallback: extract release group from end of torrent name, e.g. -LOL."""
    match = re.search(r"-([A-Za-z0-9]+)$", torrent_name)
    return match.group(1).upper() if match else None


def extract_episodes(files):
    episodes = set()
    for f in files:
        filename = os.path.basename(f["name"].replace("\\", "/"))
        match = re.search(r"S\d+E(\d+)", filename, re.IGNORECASE)
        if match:
            episodes.add(int(match.group(1)))
    return sorted(episodes)


def build_new_name(torrent_name, episodes):
    if not episodes:
        return None

    ep_tag = f"E{episodes[0]:02d}" if len(episodes) == 1 else f"E{episodes[0]:02d}-E{episodes[-1]:02d}"

    new_name = re.sub(
        r"(S\d+)\.",
        lambda m: m.group(1) + ep_tag + ".",
        torrent_name,
        count=1,
        flags=re.IGNORECASE,
    )
    return new_name if new_name != torrent_name else None


def main():
    global DRY_RUN

    args = sys.argv[1:]
    if "--dry-run" in args:
        DRY_RUN = True
        args = [a for a in args if a != "--dry-run"]

    if len(args) < 4:
        print("Usage: rename-season-torrent.py [--dry-run] <hash> <name> <category> <state>")
        print("  Arguments template in qui: \"{hash}\" \"{name}\" \"{category}\" \"{state}\"")
        print("  Dry run also via env:       DRY_RUN=1")
        sys.exit(1)

    torrent_hash = args[0]
    torrent_name = args[1]
    category     = args[2]
    state        = args[3]

    if DRY_RUN:
        print("[DRY RUN] No changes will be made.")

    # --- Filter 1: Category ---
    if QB_CATEGORIES and category not in QB_CATEGORIES:
        skip(f"category '{category}' not in allowed list {QB_CATEGORIES}")

    # --- Filter 2: Completed state ---
    if state not in COMPLETE_STATES:
        skip(f"state '{state}' is not a completed state")

    # --- Filter 3: Season-only name ---
    if re.search(r"S\d+E\d+", torrent_name, re.IGNORECASE):
        skip(f"name already has episode number: {torrent_name}")

    if not re.search(r"S\d+", torrent_name, re.IGNORECASE):
        skip(f"no season pattern in name: {torrent_name}")

    # --- Login & fetch data ---
    session = requests.Session()
    login(session)

    # --- Filter 4 (precise): created_by field, fallback to name parsing ---
    created_by = get_created_by(session, torrent_hash)
    if created_by:
        if not match_group(created_by, QB_GROUPS):
            skip(f"created_by '{created_by}' not in allowed groups {QB_GROUPS}")
    else:
        # Fallback: parse group from torrent name
        group = get_release_group_from_name(torrent_name)
        if not group or group not in [g.upper() for g in QB_GROUPS]:
            skip(f"release group '{group}' not in allowed list {QB_GROUPS}")

    files = get_files(session, torrent_hash)

    # --- Filter 5: Must be a folder torrent ---
    if not is_folder_torrent(files):
        skip(f"not a folder torrent (single-file): {torrent_name}")

    # --- Extract episodes and rename ---
    episodes = extract_episodes(files)
    if not episodes:
        skip(f"no episode numbers found in files for: {torrent_name}")

    new_name = build_new_name(torrent_name, episodes)
    if not new_name:
        skip(f"could not build new name for: {torrent_name}")

    if DRY_RUN:
        print(f"[DRY RUN] Would rename: {torrent_name}")
        print(f"[DRY RUN]          To: {new_name}")
        return

    resp = session.post(
        f"{QB_HOST}/api/v2/torrents/rename",
        data={"hash": torrent_hash, "name": new_name},
    )
    resp.raise_for_status()

    print(f"Renamed: {torrent_name}")
    print(f"     To: {new_name}")


if __name__ == "__main__":
    main()
