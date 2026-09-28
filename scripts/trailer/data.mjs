// Everything the trailer says comes from here: a snapshot of the live API and the git history, taken when the
// render starts. Nothing is typed in by hand, so a re-render tomorrow tells tomorrow's story.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://bearproof.app';

async function get(p) {
    const r = await fetch(API + p, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
}

function git(root, ...a) {
    return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
}

/** Front matter of devlog/build-<n>.md (the same keys scripts/devlog.mjs reads). */
function devlog(root, n) {
    const file = path.join(root, 'devlog', `build-${n}.md`);
    if (!fs.existsSync(file)) return null;
    const src = fs.readFileSync(file, 'utf8');
    const fm = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] || '';
    const o = {};
    for (const line of fm.split('\n')) {
        const m = /^(\w+):\s*(.*?)(\s+#\s.*)?$/.exec(line);
        if (m) o[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
    return o;
}

export async function snapshot(root) {
    const [stats, builds, ledger, winners, vote, board, activity, agent, daily] = await Promise.all(
        [
            get('/api/stats'),
            get('/api/builds'),
            get('/api/ledger'),
            get('/api/winners'),
            get('/api/vote'),
            get('/api/leaderboard'),
            get('/api/activity'),
            get('/api/agent/live'),
            get('/api/daily')
        ]
    );

    const gameDiff = git(root, 'diff', '--shortstat', 'day-0..main', '--', 'game/');
    const ins = Number(/(\d+) insertions?/.exec(gameDiff)?.[1] || 0);
    const files = Number(/(\d+) files? changed/.exec(gameDiff)?.[1] || 0);
    const commits = Number(git(root, 'rev-list', '--count', 'day-0..main'));

    const shipped = builds.builds.filter((b) => !b.revoked);
    const buildRows = shipped.map((b) => {
        const d = b.n ? devlog(root, b.n) : null;
        return {
            n: b.n,
            title: b.title,
            mode: b.mode,
            date: (d?.date || b.activatesAt).slice(0, 10),
            costUsd: b.costUsd,
            chosenBy: d?.chosenBy || null
        };
    });

    const entries = ledger.entries;
    const fees = entries.filter((e) => e.category === 'creator_fees');
    const prizes = entries.filter((e) => e.category === 'prize' && e.memo?.endsWith(':send'));
    const compute = entries.filter((e) => e.category === 'compute');

    // The Build Agent's session for the live build: when it started, when it merged, what it said.
    const ev = agent.events || [];
    const first = ev.find((e) => e.type === 'start');
    const merged = ev.find((e) => e.type === 'ship' && /merged/i.test(e.text));
    const tests = [...ev].reverse().find((e) => e.type === 'test' && /^Tests:/.test(e.text));
    const cost = ev.find((e) => e.type === 'cost');

    return {
        fetchedAt: new Date().toISOString(),
        day: stats.day,
        buildsShipped: stats.buildsShipped,
        liveBuild: stats.liveBuild,
        nextBuildAt: stats.nextBuildAt,
        treasury: stats.treasury,
        token: stats.token,
        computeSpentUsd: stats.computeSpentUsd,
        playersToday: stats.playersToday,
        topScoreToday: stats.topScoreToday,
        builds: buildRows,
        git: { gameInsertions: ins, gameFiles: files, commits },
        ledger: {
            wallets: ledger.wallets,
            feeClaims: fees.length,
            feesSol: fees.reduce((s, e) => s + (e.amountSol || 0), 0),
            prizes: prizes.map((e) => ({
                ts: e.ts,
                day: /prize:(\d{4}-\d{2}-\d{2})/.exec(e.memo)?.[1],
                ansem: Number(e.tokenAmount),
                tx: e.tx
            })),
            compute: compute.map((e) => ({ ts: e.ts, sol: e.amountSol, tx: e.tx, memo: e.memo })),
            rows: entries.slice(0, 40).map((e) => ({
                ts: e.ts,
                dir: e.direction,
                cat: e.category,
                sol: e.amountSol,
                token: e.tokenAmount,
                memo: e.memo,
                tx: e.tx
            }))
        },
        winners: winners.winners.slice(0, 5).map((w) => ({
            date: w.date,
            name: w.name,
            score: w.score,
            status: w.status,
            tx: w.tx
        })),
        prizeRule: winners.rule?.text || null,
        vote: {
            forBuild: vote.forBuild,
            status: vote.status,
            closesAt: vote.closesAt,
            rule: vote.rule,
            proposals: vote.proposals.map((p) => ({
                id: p.id,
                title: p.title,
                description: p.description
            }))
        },
        board: board.rows.slice(0, 5),
        daily: {
            date: daily.date,
            build: daily.build,
            seed: daily.seed,
            stage: daily.stage,
            stageName: daily.stageName,
            twist: daily.twist
        },
        activity: activity.items
            .filter((i) => i.kind === 'verified' || i.kind === 'rejected')
            .slice(0, 16)
            .map((i) => ({ ts: i.ts, kind: i.kind, text: i.text })),
        agent: {
            build: agent.build,
            status: agent.status,
            startedAt: first?.ts || agent.startedAt,
            mergedAt: merged?.ts || null,
            tests: tests?.text || null,
            cost: cost?.text || null,
            events: ev.map((e) => ({ ts: e.ts, type: e.type, text: e.text }))
        }
    };
}
