#!/bin/bash
# Lip-synced clips of a Raisina TV anchor saying each of their recorded lines (see anchors/README.md).
#   WAV2LIP=~/Wav2Lip SADTALKER=~/SadTalker PY=~/venv/bin/python video/lips/render.sh tara <out-dir> <ids.txt> [pip-ids.txt]
# For each line id: Wav2Lip on the anchor's resting loop with the line's recording, then (lines
# shown full screen) the lower face sharpened with GFPGAN (sharpen.py, run from SadTalker's folder
# for its weights); then a silent, web-ready clip <out-dir>/<id>.mp4. Lines in pip-ids.txt (shown in
# the small window) skip the sharpening. Clips already made are kept. --box is the face on the
# anchor's 720 px resting loop (top bottom left right).
set -e
KEY=$1; OUT=$2; IDS=$3; PIP=${4:-/dev/null}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); V=$ROOT/public/anchors/voice; FACE=$ROOT/public/anchors/$KEY-idle.mp4
BOX=${BOX:-"112 318 245 419"}
mkdir -p "$OUT"
for id in $(cat "$IDS"); do
  [ -s "$OUT/$id.mp4" ] && continue
  ffmpeg -v error -y -i "$V/$id.mp3" -ar 16000 -ac 1 "$OUT/$id.wav"
  (cd "$WAV2LIP" && "$PY" inference.py --checkpoint_path checkpoints/wav2lip.pth --face "$FACE" --audio "$OUT/$id.wav" --outfile "$OUT/$id.raw.mp4" --box $BOX --nosmooth --wav2lip_batch_size 32 > "$OUT/$id.log" 2>&1)
  if grep -qx "$id" "$PIP"; then mv "$OUT/$id.raw.mp4" "$OUT/$id.lip.mp4"
  else (cd "$SADTALKER" && "$PY" "$ROOT/video/lips/sharpen.py" "$OUT/$id.raw.mp4" "$OUT/$id.lip.mp4" >> "$OUT/$id.log" 2>&1); rm -f "$OUT/$id.raw.mp4"; fi
  ffmpeg -v error -y -i "$OUT/$id.lip.mp4" -an -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart "$OUT/$id.mp4"
  rm -f "$OUT/$id.lip.mp4" "$OUT/$id.wav"; echo "done $id"
done
