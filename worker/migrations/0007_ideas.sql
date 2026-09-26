-- The ideas box: anyone can suggest a feature, no wallet. The Build Agent reads the last day's ideas before it
-- writes the next ballot; holders still decide by vote. ip_key is a hashed IP (lib/guard ipKey), kept only for the
-- per-IP daily cap. The operator can hide an idea: UPDATE ideas SET hidden = 1 WHERE id = '...'.
CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    text TEXT NOT NULL,
    ip_key TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ideas_ts ON ideas (ts DESC);
CREATE INDEX ideas_day_ip ON ideas (day, ip_key);
