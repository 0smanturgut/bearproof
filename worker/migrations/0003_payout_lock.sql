-- Row-level claim for payouts: a cron run owns a day's payout while lock_until is in the future.
-- (KV is eventually consistent, so it can't be the lock for money.)
ALTER TABLE daily_winners ADD COLUMN lock_until INTEGER;
