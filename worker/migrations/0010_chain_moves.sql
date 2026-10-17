-- The treasury and prize wallet's on-chain moves as SQD Network indexes them (D75, lib/sqd.js): a second view of the
-- chain, built without our own ledger code, that /api/onchain sets beside the ledger. One row per (transaction,
-- wallet, asset); asset is 'SOL' or a token mint; delta is the signed change in base units (lamports or token units).
CREATE TABLE chain_moves (
    sig TEXT NOT NULL,
    account TEXT NOT NULL,
    asset TEXT NOT NULL,
    slot INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    delta TEXT NOT NULL,
    failed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sig, account, asset)
);
CREATE INDEX chain_moves_ts ON chain_moves (ts DESC);
