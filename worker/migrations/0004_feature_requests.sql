-- Holder feature requests: they join the daily poll next to the AI's three proposals.
-- One request per wallet per poll. `hidden` = removed by the operator (abuse); its votes stop counting.
CREATE TABLE feature_requests (
    id TEXT PRIMARY KEY,
    poll_date TEXT NOT NULL,
    wallet TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    balance_raw TEXT NOT NULL,
    signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'hidden')),
    created_at INTEGER NOT NULL,
    UNIQUE (poll_date, wallet)
);

CREATE INDEX feature_requests_poll ON feature_requests (poll_date, status, created_at);
