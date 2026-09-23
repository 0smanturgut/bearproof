# Devlog

One Markdown file per build: `devlog/build-<n>.md`, where `<n>` is the build number. `npm run build` compiles
every file into `dist/devlog.json` (newest first), which the HQ fetches as a static file. Nothing here goes
through the Worker or the database, so the devlog is exactly what is in git.

## Format

```md
---
build: 1
date: 2026-09-24
title: The bull-vs-bear rebuild
mode: bootstrap # agent | bootstrap | human
chosenBy: agent # agent | holders
commit: 3f2c1ab
costUsd: 0.00 # number, or leave empty
costMeasured: true # true = measured, false = estimate
status: shipped # shipped | failed
---

First paragraph is the summary shown on the HQ timeline and in share cards.

The rest is free Markdown: what shipped, why, what broke, what it cost, what is next.
```

| Key            | Required | Values                                                                                              |
| -------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `build`        | yes      | Integer. Must match the file name.                                                                  |
| `date`         | yes      | `YYYY-MM-DD`, the UTC day the build went live (or was meant to).                                    |
| `title`        | yes      | One line. Quote it (`"..."`) if it has a `#` after a space.                                         |
| `mode`         | yes      | `agent` (scheduled Build Agent), `bootstrap` (Claude Code in an operator session), `human` (Osman). |
| `chosenBy`     | no       | `agent` (default) or `holders` (won the holder vote).                                               |
| `commit`       | no       | Commit SHA of the build. Empty = `null`.                                                            |
| `costUsd`      | no       | Non-negative number. Empty = `null` (unknown, shown as unknown).                                    |
| `costMeasured` | if cost  | `true` = measured (e.g. Claude Code `total_cost_usd`), `false` = estimate.                          |
| `status`       | yes      | `shipped` or `failed`. A failed day gets an honest entry too.                                       |

Rules:

- Comments start with ` #` (space, hash, space). A `#` inside a word, like `Build #7`, is kept.
- Unknown keys, bad values, a duplicate build or a cost without `costMeasured` fail the build. That is on
  purpose: a typo must never publish an estimate as a measured number.
- `summary` in the JSON is the first prose paragraph as plain text, cut to 280 characters. Headings are skipped.

## Output

```json
{
    "entries": [
        {
            "build": 1,
            "date": "2026-09-24",
            "title": "The bull-vs-bear rebuild",
            "mode": "bootstrap",
            "chosenBy": "agent",
            "commit": "3f2c1ab",
            "costUsd": 0,
            "costMeasured": true,
            "status": "shipped",
            "summary": "First paragraph is the summary shown on the HQ timeline and in share cards.",
            "body": "First paragraph is ... (raw Markdown)"
        }
    ]
}
```

The compiler is `scripts/devlog.mjs` (no dependencies). Tests: `worker/test/devlog.test.js`.
