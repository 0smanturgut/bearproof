#!/usr/bin/env bash
# Record the streamed screen to disk during the nightly build (for clips and screenshots for X). A second ffmpeg
# reads the same virtual screen the stream shows; it never touches the stream itself. Runs at the lowest CPU
# priority, so if the box gets busy the recording drops frames, not the stream.
#
# Output: /var/lib/bearproof-rec/<night's UTC date>/HHMMSS.mkv (15-minute pieces) and shots/HHMMSS.png (one a
# minute). Stops by itself at 00:35 UTC, after the 00:00 switch to the new build.
set -euo pipefail

export DISPLAY=:99

# The night belongs to the date it started on, also when systemd restarts us after midnight.
NOW=$(date -u +%s)
if [ "$(date -u +%H)" -lt 12 ]; then
    NIGHT=$(date -u -d yesterday +%F)
    END=$(date -u -d "$(date -u +%F) 00:35" +%s)
else
    NIGHT=$(date -u +%F)
    END=$(date -u -d "tomorrow 00:35" +%s)
fi
LEFT=$((END - NOW))
[ "$LEFT" -gt 0 ] || exit 0

# No screen means no stream, so nothing to record.
for _ in $(seq 30); do xdpyinfo >/dev/null 2>&1 && break || sleep 2; done
SIZE=$(xdpyinfo 2>/dev/null | awk '/dimensions:/ { print $2 }')
[ -n "$SIZE" ] || { echo "no screen on $DISPLAY, the stream is off: not recording" >&2; exit 0; }

OUT="${STATE_DIRECTORY:-/var/lib/bearproof-rec}/$NIGHT"
mkdir -p "$OUT/shots"

# timeout exits 124 when the night is over (the unit counts that as success).
exec timeout -s INT "$LEFT" ffmpeg -hide_banner -loglevel warning -nostats \
    -thread_queue_size 512 -f x11grab -draw_mouse 0 -video_size "$SIZE" -framerate 30 -i :99 \
    -map 0:v -c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuv420p -g 60 \
    -f segment -segment_time 900 -reset_timestamps 1 -strftime 1 "$OUT/%H%M%S.mkv" \
    -map 0:v -vf fps=1/60 -strftime 1 "$OUT/shots/%H%M%S.png"
