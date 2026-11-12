#!/bin/bash
# Records one channel: a virtual screen (Xvfb) and a virtual sound card (PulseAudio), Chromium full
# screen on the channel's output address, and ffmpeg encoding them to H.264/AAC for the media
# server. Each part restarts by itself if it stops. The browser is also restarted once a day
# (RESTART_AT, India time) so it never runs for weeks.
set -u
: "${URL:?the channel output address}" "${OUT:?the media server address}"
W=${WIDTH:-1280} H=${HEIGHT:-720} FPS=${FPS:-30}
VB=${VIDEO_BITRATE:-3000k} AB=${AUDIO_BITRATE:-128k} PRESET=${PRESET:-veryfast}
RESTART_AT=${RESTART_AT:-04:00}
export DISPLAY=:99
log() { echo "$(date '+%F %T') $*"; }

Xvfb :99 -screen 0 "${W}x${H}x24" -nolisten tcp -nocursor &
pulseaudio --daemonize=no --exit-idle-time=-1 -n \
  --load="module-native-protocol-unix" --load="module-null-sink sink_name=tv rate=48000" \
  --load="module-always-sink" &
for _ in $(seq 1 40); do [ -e /tmp/.X11-unix/X99 ] && pactl info >/dev/null 2>&1 && break; sleep 0.5; done
pactl set-default-sink tv

browser() {
  while true; do
    log "browser: start"
    rm -rf "$HOME/profile"; mkdir -p "$HOME/profile/Default"
    # No "translate this page?" bubble on the picture.
    echo '{"translate":{"enabled":false},"translate_blocked_languages":["bn","en","hi"]}' > "$HOME/profile/Default/Preferences"
    chromium --no-sandbox --kiosk --start-fullscreen --window-position=0,0 --window-size="$W,$H" \
      --user-data-dir="$HOME/profile" --autoplay-policy=no-user-gesture-required \
      --no-first-run --no-default-browser-check --noerrdialogs --disable-infobars \
      --disable-session-crashed-bubble --disable-features=Translate,MediaRouter,InfiniteSessionRestore \
      --disable-dev-shm-usage --hide-scrollbars --lang=bn-IN \
      --check-for-update-interval=31536000 "$URL" >/dev/null 2>&1
    log "browser: stopped, restarting"; sleep 2
  done
}

encoder() {
  local gop=$((FPS * 2))
  while true; do
    log "encoder: start"
    ffmpeg -hide_banner -loglevel warning -nostdin \
      -thread_queue_size 1024 -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size "${W}x${H}" -i :99 \
      -thread_queue_size 1024 -f pulse -ac 2 -i tv.monitor \
      -c:v libx264 -preset "$PRESET" -profile:v high -pix_fmt yuv420p \
      -b:v "$VB" -maxrate "$VB" -bufsize "$(( ${VB%k} * 2 ))k" -g "$gop" -keyint_min "$gop" -sc_threshold 0 \
      -c:a aac -b:a "$AB" -ar 48000 -f flv "$OUT"
    log "encoder: stopped, restarting"; sleep 2
  done
}

browser & sleep 6
encoder &
while true; do
  sleep 30
  [ "$(date +%H:%M)" = "$RESTART_AT" ] && { log "daily browser restart"; pkill -f "chromium.*--kiosk" ; sleep 60; }
done
