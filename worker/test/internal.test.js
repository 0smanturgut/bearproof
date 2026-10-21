import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../src/routes/internal.js';

const req = (auth) =>
    new Request('https://x/api/internal/runs/pending', {
        headers: auth ? { authorization: auth } : {}
    });

test('internal endpoints need the exact bearer token', () => {
    const env = { INGEST_TOKEN: 'secret-token' };
    assert.equal(authorized(req('Bearer secret-token'), env), true);
    assert.equal(authorized(req('Bearer secret-tokeN'), env), false);
    assert.equal(authorized(req('Bearer secret-token-extra'), env), false);
    assert.equal(authorized(req('secret-token'), env), false);
    assert.equal(authorized(req(null), env), false);
    assert.equal(authorized(req('Bearer '), env), false);
    assert.equal(authorized(req('Bearer x'), {}), false, 'no token configured = closed');
});

// --- Copies of another player's Daily run (D83) --------------------------------------------------------------

async function copyEnv() {
    const { fakeD1 } = await import('./helpers/d1.js');
    const DB = fakeD1();
    const env = { DB, INGEST_TOKEN: 'secret-token' };
    const add = (
        id,
        player,
        at,
        {
            log = [1, 2, 3, 4],
            score = 400000,
            time = 1194000,
            date = '2026-10-19',
            mode = 'daily'
        } = {}
    ) =>
        DB.db
            .prepare(
                `INSERT INTO runs (id, player_id, mode, challenge_date, build, seed, claimed_score, claimed_time_ms,
                   claimed_kills, claimed_level, duration_ms, input_log, input_log_bytes, status, bot_check, created_at)
                 VALUES (?, ?, ?, ?, 27, 1, ?, ?, 13000, 36, ?, ?, ?, 'pending', 'passed', ?)`
            )
            .run(id, player, mode, date, score, time, time, new Uint8Array(log), log.length, at);
    const say = async (id, status = 'verified') => {
        const { verdict } = await import('../src/routes/internal.js');
        const res = await verdict(
            new Request(`https://x/api/internal/runs/${id}/verdict`, {
                method: 'POST',
                headers: {
                    authorization: 'Bearer secret-token',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ status, verifiedScore: 400000 })
            }),
            env,
            id
        );
        return res.json();
    };
    const row = (id) =>
        DB.db.prepare('SELECT status, reject_reason FROM runs WHERE id = ?').get(id);
    return { env, add, say, row };
}

test('verdict: a later copy of another player’s Daily run is rejected, whichever is verified first', async () => {
    const { add, say, row } = await copyEnv();
    add('0original00001000', 'valthera', 1000);
    add('0copy000000001000', 'raidan', 2000);
    add('0samepl0000001000', 'valthera', 3000); // the same player sending their run again: not a copy
    assert.equal((await say('0copy000000001000')).status, 'rejected', 'the copy reached first');
    assert.match(
        row('0copy000000001000').reject_reason,
        /same run as 0original00001000, sent earlier by another player/
    );
    assert.equal((await say('0original00001000')).status, 'verified', 'the original keeps it');
    assert.equal((await say('0samepl0000001000')).status, 'verified');
});

test('verdict: a tweaked copy with the same score, time, kills and level is a copy too; short runs and other days are not', async () => {
    const { add, say } = await copyEnv();
    add('0original00002000', 'malik', 1000, { log: [9, 9, 9] });
    add('0tweaked000002000', 'borara', 2000, { log: [9, 9, 8] });
    add('0otherday00002000', 'asuna', 3000, { date: '2026-10-20' });
    add('0short0a000002000', 'p1', 1000, { log: [0], score: 120, time: 7000 });
    add('0short0b000002000', 'p2', 2000, { log: [5], score: 120, time: 7000 });
    add('0free000000020000', 'p3', 4000, { mode: 'free', date: null });
    add('0free000000030000', 'p4', 5000, { mode: 'free', date: null });
    assert.equal((await say('0tweaked000002000')).status, 'rejected');
    assert.equal(
        (await say('0otherday00002000')).status,
        'verified',
        'another day is another seed'
    );
    assert.equal(
        (await say('0short0b000002000')).status,
        'verified',
        'two idle runs can end alike'
    );
    assert.equal(
        (await say('0free000000030000')).status,
        'verified',
        'free play has no board to take'
    );
    assert.equal(
        (await say('0original00002000', 'rejected')).status,
        'rejected',
        'other verdicts pass through'
    );
});
