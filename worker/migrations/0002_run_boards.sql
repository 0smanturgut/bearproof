-- Run submission + leaderboards.

-- The stage a run was played on (shown on /api/run/:id, needed by the replay verifier).
ALTER TABLE runs ADD COLUMN stage TEXT;

-- Covering indexes for the best-run-per-player boards. Their column order matches the
-- ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY score DESC, time DESC, created_at) window, so the
-- board needs no sort, and they hold every column the board reads, so a board query never touches the
-- runs rows themselves (which carry the input-log BLOB, often spilling into overflow pages).
CREATE INDEX runs_daily_board ON runs (
    challenge_date, player_id, claimed_score DESC, claimed_time_ms DESC, created_at,
    status, id, build, claimed_level, claimed_kills
);
CREATE INDEX runs_build_board ON runs (
    build, player_id, claimed_score DESC, claimed_time_ms DESC, created_at,
    status, id, claimed_level, claimed_kills
);
