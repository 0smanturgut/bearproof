-- BEARPROOF / Proof: initial schema.
-- Builds and devlog entries live in git (builds/builds.json, devlog/*.md) so they are auditable.
-- D1 holds the dynamic, user-generated and on-chain-derived data.

-- Anonymous players. `id` is a random UUID generated in the browser. No email, no IP stored.
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

-- One row per (UTC date, player) that started at least one run. Powers "players today".
CREATE TABLE play_sessions (
    date TEXT NOT NULL,
    player_id TEXT NOT NULL,
    build INTEGER NOT NULL,
    first_at INTEGER NOT NULL,
    runs INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (date, player_id)
);

-- The daily challenge is pinned to the build that was live at 00:00 UTC.
CREATE TABLE daily_challenges (
    date TEXT PRIMARY KEY,
    build INTEGER NOT NULL,
    seed INTEGER NOT NULL,
    stage TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Submitted runs. Claimed numbers come from the client; verified numbers come from re-simulation.
CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('daily', 'free')),
    challenge_date TEXT,
    build INTEGER NOT NULL,
    seed INTEGER NOT NULL,
    claimed_score INTEGER NOT NULL,
    claimed_time_ms INTEGER NOT NULL,
    claimed_kills INTEGER NOT NULL,
    claimed_level INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    input_log BLOB,
    input_log_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected', 'unverifiable')),
    verified_score INTEGER,
    verified_at INTEGER,
    reject_reason TEXT,
    bot_check TEXT NOT NULL DEFAULT 'none' CHECK (bot_check IN ('none', 'passed', 'skipped')),
    created_at INTEGER NOT NULL
);
CREATE INDEX runs_daily_score ON runs (challenge_date, claimed_score DESC);
CREATE INDEX runs_build_score ON runs (build, claimed_score DESC);
CREATE INDEX runs_player ON runs (player_id, created_at DESC);

-- Verified #1 of each daily challenge and what happened with the prize.
CREATE TABLE daily_winners (
    date TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    payout_status TEXT NOT NULL DEFAULT 'none'
        CHECK (payout_status IN ('none', 'no_address', 'pending', 'paid', 'skipped', 'failed')),
    payout_token TEXT,
    payout_amount TEXT,
    payout_tx TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
);

-- Opt-in payout address. Stored only so a verified winner can be paid. Nothing else uses it.
CREATE TABLE payout_addresses (
    player_id TEXT PRIMARY KEY,
    sol_address TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Holder voting: the agent proposes, holders pick.
CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    poll_date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'agent',
    created_at INTEGER NOT NULL
);
CREATE INDEX proposals_poll ON proposals (poll_date);

CREATE TABLE votes (
    poll_date TEXT NOT NULL,
    wallet TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    weight INTEGER NOT NULL,
    balance_raw TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (poll_date, wallet)
);

-- Public ledger. Every row links to a transaction or states that it is an off-chain measurement.
CREATE TABLE ledger (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    category TEXT NOT NULL
        CHECK (category IN ('creator_fees', 'compute', 'hosting', 'prize', 'sweep', 'launch', 'other')),
    amount_lamports INTEGER,
    token_mint TEXT,
    token_amount TEXT,
    usd_estimate REAL,
    memo TEXT,
    tx_signature TEXT,
    source TEXT NOT NULL CHECK (source IN ('chain', 'agent', 'operator')),
    measured INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX ledger_ts ON ledger (ts DESC);

-- Off-chain costs measured per agent run (API usage, hosting invoices). `reimbursed_tx` links the on-chain repayment.
CREATE TABLE compute_costs (
    id TEXT PRIMARY KEY,
    build INTEGER,
    ts INTEGER NOT NULL,
    provider TEXT NOT NULL,
    usd REAL NOT NULL,
    measured INTEGER NOT NULL,
    detail TEXT,
    reimbursed_tx TEXT
);

CREATE TABLE treasury_snapshots (
    ts INTEGER NOT NULL,
    wallet TEXT NOT NULL,
    lamports INTEGER NOT NULL,
    ansem_raw TEXT,
    token_raw TEXT,
    PRIMARY KEY (ts, wallet)
);
