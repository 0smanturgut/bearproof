-- Open voting (D74): from the 18 Oct 2026 poll anyone votes, no wallet. A vote's `wallet` is then 'v:<device id>'
-- (a random id the page keeps in localStorage) and every vote counts as 1. ip_key is a hashed IP (lib/guard ipKey),
-- kept only for the per-IP cap on one poll. Wallet votes from before leave it NULL.
ALTER TABLE votes ADD COLUMN ip_key TEXT;
CREATE INDEX votes_poll_ip ON votes (poll_date, ip_key);
