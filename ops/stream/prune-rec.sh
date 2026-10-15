#!/usr/bin/env bash
# Keep the nightly recordings from filling the disk. Runs every day at 20:40 UTC (bearproof-prune.timer), before the
# night's recording starts at 20:55, and deletes:
#   - raw video (<night>/*.mkv) older than the last KEEP_VIDEO_NIGHTS nights (default 7);
#   - a whole night's folder (its one-a-minute screenshots) after KEEP_SHOTS_DAYS days (default 60);
#   - clips cut on the server (cuts-<night>/) after KEEP_CUTS_DAYS days (default 30);
#   - then, while the disk has less than MIN_FREE_GB free (default 10), the raw video of the oldest night left,
#     never the newest two.
# Only the names record.sh and the clip workflow write are touched: <YYYY-MM-DD>/ and cuts-<YYYY-MM-DD>/.
# DRY_RUN=1 lists what it would delete and deletes nothing.
set -euo pipefail
shopt -s nullglob

DIR="${REC_DIR:-/var/lib/bearproof-rec}"
KEEP_VIDEO_NIGHTS="${KEEP_VIDEO_NIGHTS:-7}"
KEEP_SHOTS_DAYS="${KEEP_SHOTS_DAYS:-60}"
KEEP_CUTS_DAYS="${KEEP_CUTS_DAYS:-30}"
MIN_FREE_GB="${MIN_FREE_GB:-10}"
DRY_RUN="${DRY_RUN:-0}"

[ -d "$DIR" ] || exit 0
cd "$DIR"

DAY_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
video_cut=$(date -u -d "-$KEEP_VIDEO_NIGHTS days" +%F)
shots_cut=$(date -u -d "-$KEEP_SHOTS_DAYS days" +%F)
cuts_cut=$(date -u -d "-$KEEP_CUTS_DAYS days" +%F)

del() {
    if [ "$DRY_RUN" = 1 ]; then
        echo "would delete: $*"
    else
        echo "delete: $*"
        rm -rf -- "$@"
    fi
}

# Delete one night's raw video; the screenshots stay.
del_video() {
    local f files=()
    for f in "$1"/*.mkv; do files+=("$f"); done
    [ "${#files[@]}" -eq 0 ] || del "${files[@]}"
}

for d in */; do
    n=${d%/}
    if [[ $n =~ $DAY_RE ]]; then
        if [[ $n < $shots_cut ]]; then
            del "$n"
        elif [[ $n < $video_cut ]]; then
            del_video "$n"
        fi
    elif [[ $n =~ ^cuts-([0-9]{4}-[0-9]{2}-[0-9]{2})$ ]] && [[ ${BASH_REMATCH[1]} < $cuts_cut ]]; then
        del "$n"
    fi
done

# Still short of space: the oldest nights' raw video goes first, the newest two nights always stay.
free_gb() { df -P -BG "$DIR" | awk 'NR == 2 { sub(/G$/, "", $4); print $4 }'; }
nights=()
for d in */; do [[ ${d%/} =~ $DAY_RE ]] && nights+=("${d%/}"); done
for ((i = 0; i < ${#nights[@]} - 2; i++)); do
    [ "$(free_gb)" -lt "$MIN_FREE_GB" ] || break
    del_video "${nights[$i]}"
done

echo "free: $(free_gb) GB"
