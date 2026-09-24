-- What the verifier learned from re-playing a run (JSON: time, level, weapons, what the bull died to...).
-- Feeds GET /api/insights, which the Build Agent reads before it picks a feature.
ALTER TABLE runs ADD COLUMN stats TEXT;

-- The Build Agent's run, as it happens: steps, tool calls, tests, cost. Public on /live.
CREATE TABLE agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    build INTEGER,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    data TEXT
);

CREATE INDEX agent_events_run ON agent_events (run_id, id);
