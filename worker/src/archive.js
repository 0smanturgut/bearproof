/**
 * The permanent archive on Irys (D81). Every 15 minutes, beside the money steps (like SQD and the Telegram tick),
 * the cron stores what isn't stored yet, oldest first:
 *
 *   - every live build, playable: its files plus that night's devlog under one Irys path manifest whose index is
 *     the game's own index.html, so https://gateway.irys.xyz/<manifest>/ runs the build with no server of ours.
 *     Files are stored once by SHA-256: a file no build changed is shared, not uploaded again. A build updated in
 *     place later (D47, D80) gets a new revision; the earlier one stays where it was.
 *   - every settled Daily Challenge: its leaderboard and payouts exactly as /api/leaderboard and /api/winners
 *     serve them, so nothing private goes out, plus the SHA-256 of the top verified replays. Replays themselves
 *     stay private (anyone holding one could resubmit it); the hash lets a replay shown later be matched to the
 *     one that was verified.
 *
 * Items are signed by the storage wallet (secret IRYS_WALLET_KEY). It holds no SOL: every item so far is under the
 * size Irys stores without a balance. If one isn't, the bundler answers 402, the archive stops there and the
 * public view says it needs funding. State: CONFIG `irys:state`. Kill switch: CONFIG `irys:enabled` = "false".
 * Public view: GET /api/archive. Each item carries the tags App-Name=BEARPROOF and Type, so the whole archive can
 * also be listed from Irys itself by the storage wallet's address.
 */
import { all } from './lib/db.js';
import { utcDate } from './lib/daily.js';
import { json } from './lib/http.js';
import {
    IRYS_GATEWAY,
    IRYS_NODE,
    contentType,
    createDataItem,
    sha256Hex,
    upload
} from './lib/irys.js';
import { signerFromSecret } from './lib/solana.js';
import { winners } from './routes/winners.js';

const STATE_KEY = 'irys:state';
const LOCK_KEY = 'irys:lock';
const DAY = 86400000;
const enc = new TextEncoder();
const APP = [
    { name: 'App-Name', value: 'BEARPROOF' },
    { name: 'App-Version', value: '1' }
];
// Under 100 KiB is what Irys stores without a balance; a day record is trimmed to stay below it.
const ITEM_MAX = 100 * 1024 - 2048;
const REPLAY_HASHES = 3;

/** Thrown by `put` when this run's upload or time budget is spent: stop quietly, the next run goes on. */
class Spent extends Error {}

export async function loadState(env) {
    let s = null;
    try {
        s = JSON.parse((await env.CONFIG.get(STATE_KEY)) || 'null');
    } catch {
        s = null;
    }
    return {
        v: 1,
        wallet: null,
        files: {},
        builds: {},
        days: {},
        uploads: 0,
        bytes: 0,
        status: null,
        lastError: null,
        runAt: null,
        ...(s && typeof s === 'object' ? s : {})
    };
}

async function assetJson(env, path) {
    const r = await env.ASSETS.fetch(
        new Request(new URL(path, env.SITE_URL || 'https://bearproof.app'))
    );
    if (!r.ok) throw new Error(`asset ${path}: ${r.status}`);
    return r.json();
}

async function assetBytes(env, path) {
    const r = await env.ASSETS.fetch(
        new Request(new URL(path, env.SITE_URL || 'https://bearproof.app'))
    );
    if (!r.ok) throw new Error(`asset ${path}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
}

/** The devlog as a plain text page: a header line with the numbers, then the agent's own words. */
export function devlogText(entry, build, repoUrl) {
    const cost =
        entry.costUsd == null
            ? null
            : `$${Number(entry.costUsd).toFixed(2)} (${entry.costMeasured ? 'measured' : 'estimate'})`;
    const commit = entry.commit || build.commit;
    return [
        `# Build #${build.n}: ${entry.title || build.title}`,
        '',
        [
            entry.date && `Date: ${entry.date}`,
            entry.mode && `Mode: ${entry.mode}`,
            entry.chosenBy && `Chosen by: ${entry.chosenBy}`,
            cost && `Cost: ${cost}`,
            entry.status && `Status: ${entry.status}`
        ]
            .filter(Boolean)
            .join(' · '),
        commit && repoUrl ? `Commit: ${repoUrl}/commit/${commit}` : null,
        '',
        String(entry.body || entry.summary || '').trim(),
        '',
        'BEARPROOF: an AI builds a game on its own budget and ships a new version every day. https://bearproof.app'
    ]
        .filter((l) => l !== null)
        .join('\n');
}

/** The irys/paths manifest that makes a build a site on the gateway. */
export function buildManifest(paths) {
    return {
        manifest: 'irys/paths',
        version: '0.1.0',
        ...(paths['index.html'] ? { index: { path: 'index.html' } } : {}),
        paths
    };
}

/** A day's board exactly as GET /api/leaderboard serves it. Loaded lazily: routes/runs.js needs the built manifest. */
async function publicBoard(env, date) {
    const { leaderboard } = await import('./routes/runs.js');
    const site = env.SITE_URL || 'https://bearproof.app';
    return (await leaderboard(new Request(`${site}/api/leaderboard?date=${date}`), env)).json();
}

/** One settled day, from the public endpoints, plus the hashes of its best verified replays. */
async function dayRecord(env, day, now, readBoard = publicBoard) {
    const site = env.SITE_URL || 'https://bearproof.app';
    const board = await readBoard(env, day.date);
    if (board.error) throw new Error(`leaderboard ${day.date}: ${board.error.code || 'error'}`);
    const paid = await (await winners(env, { date: day.date })).json();
    const top = (board.rows || []).filter((r) => r.status === 'verified').slice(0, REPLAY_HASHES);
    const replays = [];
    if (top.length) {
        const logs =
            (await all(
                env,
                `SELECT id, input_log FROM runs WHERE id IN (${top.map(() => '?').join(',')})`,
                ...top.map((r) => r.runId)
            )) || [];
        for (const r of top) {
            const log = logs.find((l) => l.id === r.runId)?.input_log;
            if (log)
                replays.push({
                    rank: r.rank,
                    runId: r.runId,
                    sha256: await sha256Hex(new Uint8Array(log))
                });
        }
    }
    const { generatedAt: _g, ...lb } = board;
    void _g;
    const record = {
        project: 'BEARPROOF',
        kind: 'daily-result',
        date: day.date,
        build: day.build,
        seed: day.seed,
        stage: day.stage,
        leaderboard: lb,
        payouts: paid.winners || [],
        replays,
        replayNote:
            'Replays stay private so nobody can resubmit them; each sha256 is of the exact replay the verifier re-simulated.',
        source: `${site}/api/leaderboard?date=${day.date}`,
        archivedAt: new Date(now).toISOString()
    };
    let text = JSON.stringify(record);
    while (enc.encode(text).byteLength > ITEM_MAX && record.leaderboard.rows?.length > 10) {
        record.leaderboard.rows = record.leaderboard.rows.slice(
            0,
            Math.floor(record.leaderboard.rows.length * 0.7)
        );
        record.leaderboard.trimmed = true;
        text = JSON.stringify(record);
    }
    return text;
}

async function archiveBuilds(env, state, put, now) {
    const archive = await assetJson(env, '/archive.json');
    let devlog = { entries: [] };
    try {
        devlog = await assetJson(env, '/devlog.json');
    } catch {
        devlog = { entries: [] };
    }
    for (const b of archive.builds || []) {
        if (!(Date.parse(b.activatesAt) <= now)) continue; // queued for tonight: stored once it's live
        const digest = await sha256Hex(
            enc.encode(JSON.stringify(b.files.map((f) => [f.p, f.sha256])))
        );
        const revs = state.builds[b.n] || [];
        if (revs.length && revs[revs.length - 1].digest === digest) continue;
        const paths = {};
        let fresh = 0;
        for (const f of b.files) {
            let id = state.files[f.sha256];
            if (!id) {
                const bytes = await assetBytes(env, `/b/${b.n}/${f.p}`);
                if ((await sha256Hex(bytes)) !== f.sha256)
                    throw new Error(`build ${b.n}: ${f.p} differs from archive.json`);
                id = await put(bytes, [
                    { name: 'Content-Type', value: contentType(f.p) },
                    { name: 'Type', value: 'file' },
                    { name: 'SHA-256', value: f.sha256 }
                ]);
                state.files[f.sha256] = id;
                fresh++;
            }
            paths[f.p] = { id };
        }
        // The devlog of the night it shipped; a later revision of the build keeps pointing at the same one.
        let devlogId = revs.find((r) => r.devlog)?.devlog || null;
        const entry = (devlog.entries || []).find((e) => e.build === b.n);
        if (!devlogId && entry) {
            devlogId = await put(devlogText(entry, b, env.REPO_URL), [
                { name: 'Content-Type', value: 'text/plain; charset=utf-8' },
                { name: 'Type', value: 'devlog' },
                { name: 'Build', value: String(b.n) }
            ]);
        }
        if (devlogId) paths['devlog.md'] = { id: devlogId };
        const id = await put(JSON.stringify(buildManifest(paths)), [
            { name: 'Content-Type', value: 'application/x.irys-manifest+json' },
            { name: 'Type', value: 'manifest' },
            { name: 'Build', value: String(b.n) },
            { name: 'Revision', value: String(revs.length + 1) },
            { name: 'Title', value: String(b.title || '').slice(0, 200) || `Build #${b.n}` },
            ...(b.commit ? [{ name: 'Commit', value: b.commit }] : [])
        ]);
        state.builds[b.n] = [
            ...revs,
            {
                id,
                digest,
                devlog: devlogId,
                commit: b.commit || null,
                files: b.files.length,
                fresh,
                bytes: b.files.reduce((n, f) => n + f.bytes, 0),
                at: new Date(now).toISOString()
            }
        ];
    }
}

async function archiveDays(env, state, put, now, board) {
    const today = utcDate(now);
    const rows = await all(
        env,
        `SELECT c.date, c.build, c.seed, c.stage,
                (SELECT payout_status FROM daily_winners w WHERE w.date = c.date) AS st
           FROM daily_challenges c WHERE c.date < ?1 ORDER BY c.date`,
        today
    );
    if (!rows) throw new Error('daily_challenges unreadable');
    for (const d of rows) {
        if (state.days[d.date]) continue;
        const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.date}T00:00:00Z`)) / DAY;
        // Final once settled: a payout still moving waits (up to a week), a day nobody settled waits two days.
        if ((d.st === 'pending' && age < 7) || (d.st == null && age < 2)) continue;
        const id = await put(await dayRecord(env, d, now, board), [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Type', value: 'daily-result' },
            { name: 'Date', value: d.date },
            { name: 'Build', value: String(d.build) }
        ]);
        state.days[d.date] = { id, build: d.build, at: new Date(now).toISOString() };
    }
}

/**
 * One archive step. `maxUploads` and `budgetMs` bound a run so the cron's other work keeps its share of the
 * invocation; an internal call (POST /api/internal/archive/tick) can pass larger numbers for a backfill. `board`
 * reads a day's public leaderboard (tests pass their own).
 */
export async function archiveTick(
    env,
    { now = Date.now(), maxUploads = 60, budgetMs = 90000, board = publicBoard } = {}
) {
    if (!env.IRYS_WALLET_KEY) return { status: 'off' };
    if ((await env.CONFIG.get('irys:enabled')) === 'false') return { status: 'paused' };
    const held = Number(await env.CONFIG.get(LOCK_KEY));
    if (held > Date.now()) return { status: 'busy' };
    await env.CONFIG.put(LOCK_KEY, String(Date.now() + budgetMs + 60000), { expirationTtl: 900 });

    const t0 = Date.now();
    const state = await loadState(env);
    let uploads = 0;
    let finished = false;
    try {
        const signer = await signerFromSecret(env.IRYS_WALLET_KEY);
        const owner = { publicKey: signer.publicKey.toBytes(), sign: signer.sign };
        state.wallet = signer.publicKey.toBase58();
        const put = async (data, tags) => {
            if (uploads >= maxUploads || Date.now() - t0 > budgetMs) throw new Spent();
            const item = await createDataItem(data, [...tags, ...APP], owner);
            const { id } = await upload(item);
            uploads++;
            state.uploads += 1;
            state.bytes += item.bytes.byteLength;
            return id;
        };
        await archiveBuilds(env, state, put, now);
        await archiveDays(env, state, put, now, board);
        finished = true;
        state.status = 'live';
        state.lastError = null;
    } catch (err) {
        if (err instanceof Spent) state.status = 'live';
        else {
            state.status = err?.code === 'unfunded' ? 'needs_funding' : 'error';
            state.lastError = String(err?.message || err).slice(0, 200);
            console.warn('[archive]', state.lastError);
        }
    } finally {
        state.runAt = new Date().toISOString();
        await env.CONFIG.put(STATE_KEY, JSON.stringify(state));
        await env.CONFIG.delete(LOCK_KEY);
    }
    return { status: state.status, uploads, caughtUp: finished, error: state.lastError };
}

/** GET /api/archive: what is stored on Irys, newest first, with gateway links. */
export async function archiveView(env) {
    const s = await loadState(env);
    const builds = Object.entries(s.builds)
        .map(([n, revs]) => ({
            n: Number(n),
            revisions: revs.map((r, i) => ({
                revision: i + 1,
                id: r.id,
                play: `${IRYS_GATEWAY}/${r.id}/`,
                devlog: r.devlog ? `${IRYS_GATEWAY}/${r.devlog}` : null,
                commit: r.commit,
                files: r.files,
                newFiles: r.fresh,
                bytes: r.bytes,
                at: r.at
            }))
        }))
        .sort((a, b) => b.n - a.n);
    const days = Object.entries(s.days)
        .map(([date, d]) => ({
            date,
            build: d.build,
            id: d.id,
            url: `${IRYS_GATEWAY}/${d.id}`,
            at: d.at
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    return json(
        {
            status: !env.IRYS_WALLET_KEY
                ? 'off'
                : (await env.CONFIG.get('irys:enabled')) === 'false'
                  ? 'paused'
                  : s.status || 'starting',
            storage: 'Irys',
            wallet: s.wallet,
            gateway: IRYS_GATEWAY,
            bundler: IRYS_NODE,
            totals: {
                builds: builds.length,
                revisions: builds.reduce((n, b) => n + b.revisions.length, 0),
                files: Object.keys(s.files).length,
                days: days.length,
                items: s.uploads,
                bytes: s.bytes
            },
            builds,
            days,
            runAt: s.runAt,
            ...(s.lastError ? { lastError: s.lastError } : {})
        },
        { maxAge: 60 }
    );
}
