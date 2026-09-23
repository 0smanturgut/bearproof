#!/usr/bin/env bash
# End-to-end smoke test of the run / leaderboard / session / ledger API against a running Worker.
# It writes fake players and runs, so it refuses non-local targets unless ALLOW_REMOTE=1.
#
#   cp .dev.vars.example .dev.vars && npm run build
#   npx wrangler d1 migrations apply bullrun-db --local
#   npx wrangler dev --port 8799 --local
#   bash worker/test/smoke-api.sh http://localhost:8799
#
# Each pass uses 8 of the 12/min submit slots per IP, so wait a minute between passes. RL=1 also checks that
# the limit trips (it exhausts it).
# Needs curl, jq and node. Works with macOS bash 3.2.
set -euo pipefail

BASE="${1:-http://localhost:8799}"
case "$BASE" in
http://localhost:* | http://127.0.0.1:*) ;;
*) [ "${ALLOW_REMOTE:-}" = 1 ] || {
    echo "refusing to write test data to $BASE (set ALLOW_REMOTE=1)"
    exit 2
} ;;
esac

PASS=0
FAIL=0
TOKEN='XXXX.DUMMY.TOKEN.XXXX' # Cloudflare's Turnstile test token (pairs with the always-pass test secret)
LOG=$(printf 'smoke-test-input-log' | base64 | tr '+/' '-_' | tr -d '=')
nonce() { echo "$(date +%s)$RANDOM$RANDOM"; }
uuid() { node -e 'console.log(crypto.randomUUID())'; }

# req METHOD PATH [JSON] -> sets STATUS and BODY
req() {
    local out
    if [ $# -ge 3 ]; then
        out=$(curl -sS -X "$1" -H 'content-type: application/json' --data-binary @- \
            -w $'\n%{http_code}' "$BASE$2" <<<"$3")
    else
        out=$(curl -sS -X "$1" -w $'\n%{http_code}' "$BASE$2")
    fi
    STATUS=${out##*$'\n'}
    BODY=${out%$'\n'*}
}

# expect DESCRIPTION HTTP_STATUS [JQ_FILTER that must be true]
expect() {
    if [ "$STATUS" = "$2" ] && jq -e "${3:-true}" >/dev/null 2>&1 <<<"$BODY"; then
        PASS=$((PASS + 1))
        echo "ok    $1"
    else
        FAIL=$((FAIL + 1))
        echo "FAIL  $1 (HTTP $STATUS): $(head -c 400 <<<"$BODY")"
    fi
}

# run PLAYER_ID NAME MODE BUILD SEED SCORE TIME_MS [EXTRA_JQ] -> JSON submission body
run() {
    jq -nc --arg pid "$1" --arg name "$2" --arg mode "$3" --argjson build "$4" --argjson seed "$5" \
        --argjson score "$6" --argjson t "$7" --arg date "$DATE" --arg log "$LOG" --arg tok "$TOKEN" \
        '{v: 1, playerId: $pid, name: $name, mode: $mode, build: $build, seed: $seed, stage: "forest",
          claimed: {score: $score, timeMs: $t, kills: 42, level: 7}, durationMs: ($t + 5000),
          log: $log, turnstileToken: $tok}
         + (if $mode == "daily" then {challengeDate: $date} else {} end)' | jq -c "${8:-.}"
}

echo "== smoke-api against $BASE"

req GET /api/health
expect 'health' 200 '.ok == true'
req GET /api/daily
expect 'daily challenge exists' 200 '.seed > 0 and (.build | type) == "number"'
DATE=$(jq -r .date <<<"$BODY")
SEED=$(jq -r .seed <<<"$BODY")
BUILD=$(jq -r .build <<<"$BODY")
echo "      date=$DATE build=$BUILD"

A=$(uuid)
B=$(uuid)
C=$(uuid)
D=$(uuid)
# Scores grow with wall time so this run's players sit near the top of the board, above older runs' fake
# players. Checks below are relative to this run's own run ids, so a recent earlier run can't break them.
S=$(($(date +%s) % 400000 * 100 + 1000000))

req GET "/api/stats?nocache=$(nonce)"
PLAYERS_BEFORE=$(jq -r '.playersToday // 0' <<<"$BODY")
req GET "/api/leaderboard?date=$DATE&nocache=$(nonce)"
expect 'leaderboard before' 200 '.board == "daily" and (has("seed") | not)'
TOTAL_BEFORE=$(jq -r .total <<<"$BODY")

echo '-- sessions'
for p in "$A" "$A" "$B" "$C"; do
    req POST /api/session "{\"playerId\":\"$p\",\"build\":$BUILD,\"mode\":\"daily\"}"
    expect "session $p" 200 '.ok == true'
done
req POST /api/session '{"playerId":"nope","build":0,"mode":"daily"}'
expect 'session rejects a bad playerId' 400 '.error.field == "playerId"'
req GET "/api/stats?nocache=$(nonce)"
expect 'playersToday counted 3 new unique browsers' 200 ".playersToday == $PLAYERS_BEFORE + 3"

echo '-- valid runs'
req POST /api/runs "$(run "$A" Alice daily "$BUILD" "$SEED" $((S + 5000)) 60000)"
expect 'A run 1' 200 '.ok and .status == "pending" and (.rank | type) == "number"'
req POST /api/runs "$(run "$A" Alice daily "$BUILD" "$SEED" $((S + 8000)) 60000)"
expect 'A run 2 (A best)' 200 '.ok'
RUN_A=$(jq -r .id <<<"$BODY")
req POST /api/runs "$(run "$B" '' daily "$BUILD" "$SEED" $((S + 9000)) 90000 'del(.name)')"
expect 'B run 1 (B best, no name)' 200 '.ok and (.rank | type) == "number"'
RUN_B=$(jq -r .id <<<"$BODY")
RANK_B=$(jq -r .rank <<<"$BODY")
req POST /api/runs "$(run "$B" '' daily "$BUILD" "$SEED" $((S + 3000)) 30000 'del(.name)')"
expect 'B run 2 (worse, B keeps its rank)' 200 ".ok and .rank == $RANK_B"
RUN_B2=$(jq -r .id <<<"$BODY")
req POST /api/runs "$(run "$C" '  Carol  ' daily "$BUILD" "$SEED" $((S + 8000)) 70000)"
expect 'C run (ties A on score, survived longer)' 200 ".ok and .rank > $RANK_B"
RUN_C=$(jq -r .id <<<"$BODY")
RANK_C=$(jq -r .rank <<<"$BODY")
req POST /api/runs "$(run "$D" Dave free "$BUILD" 777 $((S + 9500)) 20000)"
expect 'D free run' 200 '.ok and .rank == null'
RUN_FREE=$(jq -r .id <<<"$BODY")

echo '-- invalid runs'
req POST /api/runs '{not json'
expect 'malformed JSON' 400 '.error.code == "invalid_json"'
req POST /api/runs "$(run nope x daily "$BUILD" "$SEED" 1 1000)"
expect 'bad playerId' 400 '.error.code == "invalid_field" and .error.field == "playerId"'
req POST /api/runs "$(run "$A" x daily "$BUILD" "$SEED" 50000001 1000)"
expect 'score over cap' 400 '.error.field == "claimed.score"'
req POST /api/runs "$(run "$A" x daily "$BUILD" "$SEED" 100 600000 '.durationMs = 1000')"
expect 'sim time > wall time' 400 '.error.code == "implausible_run"'
req POST /api/runs "$(run "$A" x daily 999 "$SEED" 100 1000)"
expect 'unknown build' 400 '.error.code == "unknown_build"'
req POST /api/runs "$(run "$A" x daily "$BUILD" "$SEED" 100 1000 '.challengeDate = "2020-01-01"')"
expect 'closed challenge' 400 '.error.code == "challenge_closed"'
req POST /api/runs "$(run "$A" x daily "$BUILD" $(((SEED + 1) % 4294967296)) 100 1000)"
expect 'wrong daily seed' 409 '.error.code == "challenge_mismatch"'
req POST /api/runs "$(run "$A" x daily "$BUILD" "$SEED" 100 1000 'del(.turnstileToken)')"
expect 'missing Turnstile token' 403 '.error.code == "bot_check_failed"'
STATUS=$(head -c 420000 /dev/zero | tr '\0' 'a' | curl -sS -o /dev/null -w '%{http_code}' \
    -X POST -H 'content-type: application/json' --data-binary @- "$BASE/api/runs" || true)
BODY='{}'
expect 'body over 400 KB' 413

echo '-- leaderboards'
req GET "/api/leaderboard?date=$DATE&nocache=$(nonce)"
expect 'daily board has 3 more players' 200 ".total == $TOTAL_BEFORE + 3"
expect 'daily board never exposes the seed' 200 'has("seed") | not'
expect 'daily board sorted by score desc' 200 '[.rows[].score] as $s | $s == ($s | sort | reverse)'
expect 'one row per player' 200 '[.rows[].runId] | length == (unique | length)'
# $r maps runId -> {rank, name, ...} for the rows on the board.
R='(.rows | map({key: .runId, value: .}) | from_entries) as $r'
expect 'B keeps its best run, not its later worse one' 200 "$R | (\$r | has(\"$RUN_B\")) and (\$r | has(\"$RUN_B2\") | not)"
expect 'B is shown as anon-xxxx' 200 "$R | \$r[\"$RUN_B\"].name == \"anon-${B:0:4}\""
expect 'Carol was trimmed' 200 "$R | \$r[\"$RUN_C\"].name == \"Carol\""
expect 'ranks match the submit responses' 200 \
    "$R | \$r[\"$RUN_B\"].rank == $RANK_B and \$r[\"$RUN_C\"].rank == $RANK_C"
expect 'Carol (longer time) sits right above Alice on a tied score' 200 \
    "$R | \$r[\"$RUN_A\"].rank == $RANK_C + 1"
expect 'rows carry status/build/runId' 200 \
    "$R | \$r[\"$RUN_A\"] | .status == \"pending\" and .build == $BUILD and .runId == \"$RUN_A\""
req GET "/api/leaderboard?build=$BUILD&nocache=$(nonce)"
expect 'build board includes free runs' 200 ".board == \"build\" and any(.rows[]; .runId == \"$RUN_FREE\")"
req GET '/api/leaderboard?date=bad'
expect 'bad date param' 400 '.error.field == "date"'
req GET '/api/leaderboard?build=999'
expect 'unknown build board' 400 '.error.code == "unknown_build"'

echo '-- run view, ledger, devlog'
req GET "/api/run/$RUN_A"
expect 'run view' 200 ".id == \"$RUN_A\" and .name == \"Alice\" and .score == $((S + 8000)) and .stage == \"forest\" and .challengeDate == \"$DATE\""
expect 'run view hides playerId and input log' 200 'has("playerId") or has("log") or has("input_log") | not'
req GET /api/run/doesnotexist00000
expect 'missing run' 404 '.error.code == "not_found"'
req GET "/api/ledger?nocache=$(nonce)"
expect 'ledger' 200 '(.entries | type) == "array" and (.wallets | has("treasury") and has("prize") and has("costs"))'
req GET /devlog.json
expect 'devlog feed' 200 '(.entries | type) == "array"'

if [ "${RL:-}" = 1 ]; then
    echo '-- rate limit'
    for _ in $(seq 1 14); do
        req POST /api/runs "$(run "$C" Carol free "$BUILD" 1 10 1000)"
        [ "$STATUS" = 429 ] && break
    done
    expect 'submit rate limit trips' 429 '.error.code == "rate_limited"'
fi

echo "== $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
