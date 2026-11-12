# One channel's capture: a hidden browser opens the channel's output address, and ffmpeg records
# its picture and sound and sends them to the media server. (The same image runs relay.sh, which
# passes a stream on to a platform's RTMP ingest.)
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium xvfb pulseaudio pulseaudio-utils ffmpeg \
      fonts-noto-core fonts-noto-color-emoji ca-certificates tini tzdata procps \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m tv \
 && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
COPY capture.sh relay.sh /
RUN chmod 755 /capture.sh /relay.sh
USER tv
ENV TZ=Asia/Kolkata
ENTRYPOINT ["tini", "--", "/capture.sh"]
