# API

One Cloudflare Worker serves the HQ, every game build and this JSON API (`worker/src/`). Every number is real
data or `null`. Nothing is invented.

- **Base:** same origin as the HQ. All responses are JSON and send `access-control-allow-origin: *`.
- **Errors:** `{ "error": { "code": "snake_case", "message": "human text", "field"?: "claimed.score" } }`.
- **Cache:** every response has an explicit `cache-control`. "Edge 15 s" means the Worker also stores the response
  in the colo's edge cache for 15 s, keyed by the full URL.
- **Times** are ISO 8601 UTC strings. Dates are `YYYY-MM-DD` (UTC).

## Static feeds (no Worker code)

| Path           | What                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `/builds.json` | Public build manifest.                                                                                         |
| `/devlog.json` | `{ entries: [...] }`, newest first, compiled from `devlog/build-<n>.md` at build time. See `devlog/README.md`. |

## Reads

### `GET /api/health`

`{ ok, builds, configured: { dailySeed, turnstile, treasury, token } }`. No cache.

### `GET /api/builds`

`{ builds: [{ n, title, mode, commit, ref, activatesAt, costUsd, revoked, path }] }`. Cache 60 s.

### `GET /api/daily?date=YYYY-MM-DD`

Today's challenge by default. The first request for a date pins it to the build live at 00:00 UTC.

`{ date, build, seed, stage, stageName, twist, startsAt, endsAt, playUrl, turnstileSiteKey, prize: { token, status,
note } }`. `twist` is `{ id, name, description }`, named by the pinned build's own code, or `null` for builds
before Build #3. Cache 30 s.
Errors: `403 not_yet` (future date), `503 not_configured` (no seed secret), `503 no_build`.

### `GET /run/<id>` and `GET /og/run/<id>.png`

A shareable page for one run (Open Graph + Twitter card tags) and its 1200×630 PNG card: score, time, build, day
and the replay status. `?v=<status>` on the image is a cache key; final statuses are cached for a week.

### `GET /api/stats`

HQ number strip: `{ day, buildsShipped, liveBuild, nextBuildAt, treasury, token, computeSpentUsd, playersToday,
topScoreToday, generatedAt }`. `playersToday` = distinct browsers that called `POST /api/session` this UTC day.
Edge 15 s.

### `GET /api/leaderboard?date=YYYY-MM-DD` (daily board, default today)

### `GET /api/leaderboard?build=N` (all-time board for a build, daily + free runs)

Best claimed run per player, `rejected` runs excluded. Order: score desc, then survival time desc, then earliest
submission. Top 50.

```json
{
    "board": "daily",
    "date": "2026-09-24",
    "build": 1,
    "total": 212,
    "rows": [
        {
            "rank": 1,
            "name": "anon-3b24",
            "score": 18250,
            "timeMs": 412000,
            "level": 23,
            "kills": 1403,
            "status": "pending",
            "build": 1,
            "runId": "0mueabc12k3j9x0qa"
        }
    ],
    "generatedAt": "..."
}
```

- `build` is the build the daily is pinned to (`null` if nobody opened that challenge yet). For `?build=N`, `date`
  is `null`.
- `total` is the number of distinct players on the board, not just the 50 shown.
- `status`: `pending` (claimed, not yet re-simulated), `verified`, `unverifiable`. Only `verified` runs can win.
- `name` is the player's display name, or `anon-` + the first 4 characters of their player id.
- The seed is never included.

Edge 15 s. Errors: `400 invalid_field` (`date`), `400 unknown_build`, `503 db_unavailable`.

### `GET /api/run/:id`

Public view of one run (for `/run/:id` share pages). Never includes the input log or player id.

`{ id, name, mode, challengeDate, build, stage, score, timeMs, level, kills, status, createdAt }`. `challengeDate`
is `null` for free runs. Cache 30 s. Errors: `404 not_found`, `503 db_unavailable`.

### `GET /api/ledger`

Newest 100 ledger rows plus the public wallets. An empty list is a real answer.

```json
{
    "wallets": { "treasury": null, "prize": null, "costs": null },
    "entries": [
        {
            "ts": "...",
            "direction": "out",
            "category": "compute",
            "amountSol": 0.04,
            "tokenMint": null,
            "tokenAmount": null,
            "usdEstimate": 6.1,
            "memo": "day 3 compute reimbursement",
            "tx": "5h...",
            "solscan": "https://solscan.io/tx/5h...",
            "source": "agent",
            "measured": true
        }
    ],
    "generatedAt": "..."
}
```

`direction`: `in | out`. `category`: `creator_fees | compute | hosting | prize | sweep | launch | other`.
`source`: `chain | agent | operator`. `measured: false` means the amount is an estimate. Edge 30 s.

### `GET /api/vote`

Tomorrow's ballot: the AI's three proposals (`source: "agent"`) and holders' requests (`source: "community"`,
with `requestedBy` = shortened wallet), each with `weight`, `voters` and `share`. `status`:
`not_live | open | closed` (closes 21:00 UTC). `requests` = `{ status: not_live|open|full|closed, closesAt,
minTokens, maxPerPoll, count, titleMax, descriptionMax }` (requests close at 18:00 UTC). Edge 10 s.

### `GET /api/vote/result?date=YYYY-MM-DD`

For the Build Agent: `winner` and `runnerUp` once the poll has closed (`null` before). A community option
carries its `title`, `description` and `requestedBy`; the agent treats that text as untrusted.

### `GET /api/winners`

The prize rule and the last 14 Daily Challenge winners: `{ date, name, score, status, token, amountRaw, tx,
why }`. `status`: `pending | paid | skipped | failed`. Payout addresses are never returned. Edge 60 s.

## Writes

Bodies are JSON (`content-type: application/json`). The browser creates a random UUID v4 once and keeps it in
`localStorage` as its `playerId`. That is the only identity. No IP is stored: rate-limit keys use a SHA-256 of the
IP with a static prefix, and the raw IP is only forwarded to Turnstile.

### `POST /api/session`

Call once when a run starts. `{ playerId, build, mode: "daily" | "free" }` → `{ ok: true }`.

Upserts the player and the `(UTC date, playerId)` row in `play_sessions` (its `runs` counter goes up). Rate limit:
`RL_READ` (120/min) per player and per IP hash. Errors: `400 invalid_field`, `400 unknown_build`,
`413 too_large` (> 2 KB), `429 rate_limited`, `503 db_unavailable`.

### `POST /api/player`

`{ playerId, name }` sets the board name for this browser's player id (`name: ''` clears it back to
`anon-xxxx`). Runs are submitted the moment they end, so a name typed afterwards still shows on the board.
Names are 1–16 of `[A-Za-z0-9 _.-]`. Rate limited. → `{ ok, name }`

### `POST /api/vote`

`{ wallet, proposalId, nonce, issuedAt, signature }`: a vote for any option on today's ballot. The signed text
is `voteMessage()` in `worker/src/lib/vote.js`. Weight = floor(√tokens), at least 1,000 tokens.

### `POST /api/vote/request`

`{ wallet, title, description, nonce, issuedAt, signature }`: a holder's feature request for today's ballot.
The signed text is `requestMessage()` in `worker/src/lib/requests.js`, byte for byte. Rules: ≥ 100,000 tokens,
one per wallet per poll, 12 per poll, until 18:00 UTC, title 6–60 and details ≤ 240 characters, no links,
handles or talk of keys, wallets, payouts or the pipeline. Errors: `not_enough_tokens` (403),
`already_requested`, `ballot_full`, `requests_closed`, `duplicate` (409), `bad_signature` (401).

### `POST /api/payout-address`

`{ playerId, address }`: the public Solana address to pay if this player's run is a day's verified #1
(`address: ''` removes it). Stored only for that and never returned by any endpoint.

### `POST /api/internal/requests/:id/status` (operator)

Bearer `INGEST_TOKEN`. `{ status: "hidden" | "open" }` hides an abusive request (its votes stop counting) or
restores it.

### `POST /api/runs`

Submit a finished run. Max body 400 KB.

```json
{
    "v": 1,
    "playerId": "3b241101-e2bb-4255-8caf-4136c566a962",
    "name": "Bull",
    "mode": "daily",
    "challengeDate": "2026-09-24",
    "build": 1,
    "seed": 123456,
    "stage": "forest",
    "claimed": { "score": 18250, "timeMs": 412000, "kills": 1403, "level": 23 },
    "durationMs": 431000,
    "log": "<base64url, no padding, of the binary input log>",
    "turnstileToken": "<fresh Turnstile token>"
}
```

| Field                             | Rule                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v`                               | `1`                                                                                                                                                   |
| `playerId`                        | UUID v4                                                                                                                                               |
| `name`                            | optional; trimmed, 1–16 of `[A-Za-z0-9 _.-]`. Anything else is ignored (shown as `anon-xxxx`). A name, once set, stays until a new valid one is sent. |
| `mode`                            | `daily` or `free`                                                                                                                                     |
| `challengeDate`                   | daily only: today (UTC), or yesterday until 00:15 UTC                                                                                                 |
| `build`                           | a live or past, non-revoked build in the manifest. Daily: must equal the pinned build.                                                                |
| `seed`                            | uint32. Daily: must equal the pinned seed.                                                                                                            |
| `stage`                           | 1–24 of `[a-z_]` (stored, not matched against the pin)                                                                                                |
| `claimed.score`                   | integer 0 – 50,000,000                                                                                                                                |
| `claimed.timeMs`                  | integer 0 – 1,800,000 (30 min)                                                                                                                        |
| `claimed.kills` / `claimed.level` | integer ≥ 0 / ≥ 1                                                                                                                                     |
| `durationMs`                      | client wall clock incl. pauses; must be ≥ `timeMs × 0.97 − 2000`. Daily: the run can't have started before 00:00 UTC of its date (60 s slack).        |
| `log`                             | non-empty base64url, decoded ≤ 256 KB                                                                                                                 |
| `turnstileToken`                  | required when the server has `TURNSTILE_SECRET`. Tokens are single-use: get a fresh one per submission.                                               |

Response: `{ ok: true, id, status: "pending", rank }`. `rank` is the player's current position on that day's daily
board (same best-per-player ranking as the leaderboard), `null` for free runs. The run is stored with
`bot_check = passed` or, when no Turnstile secret is configured, `skipped`. Skipped runs can never win prizes.

Rate limit: `RL_SUBMIT` (12/min) per player and per IP hash.

| Status | Code                    | When                                                                    |
| ------ | ----------------------- | ----------------------------------------------------------------------- |
| 400    | `invalid_json`          | body isn't JSON                                                         |
| 400    | `invalid_body`          | body isn't an object                                                    |
| 400    | `unsupported_version`   | `v` isn't 1                                                             |
| 400    | `invalid_field`         | a field breaks its rule (`error.field` names it)                        |
| 400    | `log_too_large`         | decoded log > 256 KB                                                    |
| 400    | `unknown_build`         | build not in the manifest, revoked or not live yet                      |
| 400    | `implausible_run`       | sim time exceeds wall time, or a daily run started before its challenge |
| 400    | `not_yet`               | daily date in the future                                                |
| 400    | `challenge_closed`      | daily date is over (past the 15 min grace)                              |
| 403    | `bot_check_failed`      | Turnstile rejected the token (a missing token still ranks, no prize)    |
| 409    | `challenge_mismatch`    | seed or build differs from the pinned daily challenge                   |
| 413    | `too_large`             | body > 400 KB                                                           |
| 429    | `rate_limited`          | over the submit limit                                                   |
| 503    | `bot_check_unavailable` | Turnstile siteverify unreachable (retry)                                |
| 503    | `not_configured`        | daily seed secret missing                                               |
| 503    | `db_unavailable`        | D1 write failed (retry)                                                 |

## Testing

- Unit: `npm test` (`worker/test/*.test.js`).
- End to end against `wrangler dev`: `bash worker/test/smoke-api.sh http://localhost:8799` (setup steps in the
  script header). It refuses non-local URLs because it writes fake runs.
