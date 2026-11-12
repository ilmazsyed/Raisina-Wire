#!/bin/bash
# Sends a channel's stream, as it is (no re-encoding), from the media server to a platform's RTMP
# ingest (PUSH_URL: its server address and stream key). It reconnects by itself if the platform
# drops it. Without PUSH_URL it does nothing.
set -u
: "${SRC:?the media server address}"
[ -z "${PUSH_URL:-}" ] && { echo "no platform address: idle"; exec sleep infinity; }
while true; do
  echo "$(date '+%F %T') relay: start"
  ffmpeg -hide_banner -loglevel warning -nostdin -rw_timeout 15000000 -i "$SRC" -c copy -f flv "$PUSH_URL"
  echo "$(date '+%F %T') relay: stopped, retrying in 5 s"; sleep 5
done
