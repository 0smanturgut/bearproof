#!/usr/bin/env bash
# The stream itself: a virtual screen (Xvfb), Chrome in kiosk mode on the control room's TV page, and ffmpeg
# sending that screen to X over RTMP. systemd restarts the whole thing if any part stops.
set -euo pipefail

W=${WIDTH:-1280}
H=${HEIGHT:-720}
FPS=${FPS:-30}
BITRATE=${BITRATE:-4500k}
PAGE=${PAGE:-https://bearproof.app/live?tv=1}
: "${RTMP_URL:?missing, run set-key.sh}" "${STREAM_KEY:?missing, run set-key.sh}"
export DISPLAY=:99

Xvfb :99 -screen 0 "${W}x${H}x24" -nolisten tcp &
sleep 2

PROFILE=$(mktemp -d)
google-chrome --kiosk --incognito --no-first-run --no-default-browser-check --noerrdialogs --disable-infobars \
    --disable-translate --disable-features=Translate --disable-dev-shm-usage --hide-scrollbars \
    --autoplay-policy=no-user-gesture-required --window-position=0,0 --window-size="${W},${H}" \
    --user-data-dir="$PROFILE" "$PAGE" >/dev/null 2>&1 &
sleep 12

# X wants an audio track: send silence. The key is scrubbed from anything ffmpeg prints.
ffmpeg -hide_banner -loglevel warning -nostats \
    -f x11grab -draw_mouse 0 -video_size "${W}x${H}" -framerate "$FPS" -i :99 \
    -f lavfi -i anullsrc=r=44100:cl=stereo \
    -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -b:v "$BITRATE" -maxrate "$BITRATE" \
    -bufsize 9000k -g $((FPS * 3)) -keyint_min $((FPS * 3)) -c:a aac -b:a 128k -ar 44100 \
    -f flv "${RTMP_URL}/${STREAM_KEY}" \
    2> >(perl -pe 'BEGIN { $| = 1; $k = $ENV{STREAM_KEY} } s/\Q$k\E/****/g' >&2) &

wait -n
echo "a part of the stream stopped; systemd restarts it" >&2
exit 1
