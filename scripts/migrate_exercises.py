"""
One-off migration: exercises.json + gif bank -> Supabase (muscle_groups, exercises
tables + exercise-gifs storage bucket).

Requires: pip install requests pillow
Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Safe to re-run: upserts muscle_groups/exercises by id, skips re-uploading a gif
if an object with the same path already exists in storage.
"""
import io
import json
import time
import os
import sys

import requests
from PIL import Image, ImageSequence

BANK_DIR = "/Users/juninhotaranttine/Downloads/GIFs/Taranttine Personal Banco de Mídia"
EXERCISES_JSON = os.path.join(BANK_DIR, "exercises.json")
GIFS_DIR = os.path.join(BANK_DIR, "gifs")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running.")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

TARGET_WIDTH = 280
MAX_FRAMES = 14


def compress_gif(src_path: str) -> bytes:
    im = Image.open(src_path)
    w, h = im.size
    new_h = int(h * TARGET_WIDTH / w)
    n_frames = getattr(im, "n_frames", 1)
    step = max(1, n_frames // MAX_FRAMES)
    frames, durations = [], []
    for i, frame in enumerate(ImageSequence.Iterator(im)):
        if i % step != 0:
            continue
        f = frame.convert("RGB").resize((TARGET_WIDTH, new_h), Image.LANCZOS)
        f = f.convert("P", palette=Image.ADAPTIVE, colors=96)
        frames.append(f)
        durations.append(max(frame.info.get("duration", 80), 60))
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:],
                    duration=durations, loop=0, optimize=True, disposal=2)
    return buf.getvalue()


def object_exists(storage_path: str) -> bool:
    url = f"{SUPABASE_URL}/storage/v1/object/info/exercise-gifs/{storage_path}"
    r = requests.get(url, headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
    return r.status_code == 200


def upload_gif(storage_path: str, data: bytes, retries: int = 3):
    url = f"{SUPABASE_URL}/storage/v1/object/exercise-gifs/{storage_path}"
    for attempt in range(1, retries + 1):
        r = requests.post(
            url,
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                      "Content-Type": "image/gif", "x-upsert": "true"},
            data=data,
        )
        if r.ok:
            return
        if attempt == retries:
            print(f"    upload failed after {retries} attempts: {r.status_code} {r.text}")
            r.raise_for_status()
        time.sleep(2 * attempt)


def upsert_rows(table: str, rows: list, on_conflict: str):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    r = requests.post(url, headers=HEADERS, data=json.dumps(rows))
    r.raise_for_status()


def get_muscle_group_ids() -> dict:
    url = f"{SUPABASE_URL}/rest/v1/muscle_groups?select=id,name"
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    return {row["name"]: row["id"] for row in r.json()}


def main():
    with open(EXERCISES_JSON, encoding="utf-8") as f:
        data = json.load(f)

    muscle_group_names = sorted({e["grupo_muscular"] for e in data["exercises"]})
    upsert_rows("muscle_groups", [{"name": n} for n in muscle_group_names], on_conflict="name")
    group_ids = get_muscle_group_ids()

    exercises = data["exercises"]
    print(f"Migrating {len(exercises)} exercises...")

    exercise_rows = []
    for i, ex in enumerate(exercises, 1):
        ex_id = ex["id"]
        gif_rel_path = ex["gif_url"]  # e.g. "ABDOMEN CORE/ABS rolinho.gif"
        src_path = os.path.join(GIFS_DIR, gif_rel_path)
        storage_path = f"{ex_id}.gif"

        if not object_exists(storage_path):
            if not os.path.exists(src_path):
                print(f"  [SKIP missing file] {ex_id}: {src_path}")
                continue
            compressed = compress_gif(src_path)
            upload_gif(storage_path, compressed)
            print(f"  [{i}/{len(exercises)}] uploaded {ex_id} ({len(compressed)//1024} KB)")
        else:
            print(f"  [{i}/{len(exercises)}] {ex_id} already in storage, skipping upload")

        exercise_rows.append({
            "id": ex_id,
            "name": ex["nome"],
            "muscle_group_id": group_ids[ex["grupo_muscular"]],
            "gif_path": storage_path,
            "tags": ex.get("tags", []),
        })

        if len(exercise_rows) >= 50:
            upsert_rows("exercises", exercise_rows, on_conflict="id")
            exercise_rows = []

    upsert_rows("exercises", exercise_rows, on_conflict="id")
    print("Done.")


if __name__ == "__main__":
    main()
