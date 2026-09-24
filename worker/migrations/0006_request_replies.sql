-- The AI's take on each holder request, shown under it on the ballot: can it ship in a day, and one sentence why.
ALTER TABLE feature_requests ADD COLUMN ai_verdict TEXT;
ALTER TABLE feature_requests ADD COLUMN ai_reply TEXT;
ALTER TABLE feature_requests ADD COLUMN ai_at INTEGER;
