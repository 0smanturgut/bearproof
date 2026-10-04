-- The Telegram group (docs/DECISIONS.md D62). The bot stores what is said in the one public group it serves, so
-- the nightly digest can tell the Build Agent what players said and the bot can follow a conversation.
-- Rows are deleted after 14 days by the cron. user_id is Telegram's numeric id and name the first name: no
-- @handle, no phone number, no email, and nothing from private chats.
CREATE TABLE tg_messages (
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    name TEXT,
    text TEXT NOT NULL,
    reply_to INTEGER,
    -- chat: a member's message · bug: sent with /bug · bot: the bot's own reply (to_user = who it answered)
    kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'bug', 'bot')),
    to_user INTEGER,
    PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX tg_messages_ts ON tg_messages (ts);
CREATE INDEX tg_messages_bot ON tg_messages (day, kind, to_user);

-- What the bot has announced, so the 15-minute cron never posts the same thing twice.
CREATE TABLE tg_announcements (
    key TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    message_id INTEGER
);

-- The bot's Claude usage per UTC day, from the API's own usage report (replies and the nightly digest). The same
-- total is kept in compute_costs (id 'tg-<day>'), so "Spent on compute" covers it.
CREATE TABLE tg_usage (
    day TEXT PRIMARY KEY,
    replies INTEGER NOT NULL DEFAULT 0,
    digests INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    usd REAL NOT NULL DEFAULT 0
);

-- The nightly digest of the chat: one Claude call at 20:30 UTC, public at /api/feedback, read by the Build Agent
-- at 21:00 UTC as untrusted player feedback. `since` is where the window starts (the previous digest).
CREATE TABLE feedback_digests (
    day TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    since INTEGER NOT NULL,
    messages INTEGER NOT NULL,
    people INTEGER NOT NULL,
    items TEXT NOT NULL,
    model TEXT
);

-- An idea sent with /idea in the group lands in the same box as the site's.
ALTER TABLE ideas ADD COLUMN source TEXT NOT NULL DEFAULT 'web';
