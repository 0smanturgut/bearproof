// One clock for picture and sound: 120 BPM, so a beat is 30 frames and a bar is 2 seconds. Scenes, cues and
// footage are placed in beats; the composer draws from this list and the soundtrack is arranged from it.

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const FPS = 60;

/** What the music does in each bar (32 bars, 64 s). */
export const SECTIONS = [
    ...'intro intro intro riser'.split(' '), //         0-3   the one-liner
    'dropA', //                                         4     title
    ...'grooveA grooveA grooveA'.split(' '), //         5-7   the Build Agent's night
    ...'evo0 evo1 evo2 evo3 evo4 evo5'.split(' '), //   8-13  Day 0 → today
    'riser2', //                                        14    the diff
    ...'dropB dropB dropB dropB'.split(' '), //         15-18 the game
    ...'boss0 boss1 boss2'.split(' '), //               19-21 bosses
    ...'loop loop loop loop loop loop'.split(' '), //   22-27 fund / steer / play / receipts
    'riser3', //                                        28    tonight
    ...'dropC dropC outro'.split(' ') //                29-31 end card
];

export const DURATION = SECTIONS.length * BAR;

// When the Build Agent's log lines land (beats into the 'agent' scene): unhurried, then faster and faster.
export const AGENT_BEATS = [
    0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.25, 5.5, 5.75, 6, 6.25, 6.5, 6.75, 7, 7.25
];

/** The feature clips (real play on the live build, recorded for the posts of 15 to 17 Oct): night, label, line. */
export const FEATURES = [
    { n: 6, name: 'THE RUG LORD', line: 'The first big boss walks in.', from: 0.1 },
    { n: 9, name: 'BOSS JACKPOT', line: 'Kill a boss, score triple.', from: 0.38 },
    { n: 12, name: 'GOD CANDLE', line: 'One pickup clears the screen.', from: 0.32 },
    { n: 15, name: 'EXIT SCAM', line: 'A thief steals your XP. Catch it.', from: 0.85 },
    { n: 16, name: 'BEAR SPRAY', line: 'Breaks a grizzly shield in one hit.', from: 0.36 },
    { n: 20, name: 'WITHDRAWAL FREEZE', line: 'An ice boss that freezes your XP.', from: 0.02 },
    { n: 23, name: 'MOON ROCKET', line: 'Four seconds. Ram everything.', from: 4.36 },
    { n: 24, name: 'HONEY TRAP', line: 'Grizzlies sit down and eat.', from: 0.73 }
];

const shortTx = (tx) => (tx ? `${tx.slice(0, 4)}…${tx.slice(-4)}` : '');

/** The lines of the Build Agent's real session shown on screen, in order, picked by rule. */
export function agentLines(D) {
    const ev = D.agent.events;
    const pick = [];
    const seen = new Set();
    // A rule can find nothing in a night's log: skip it (the default for `text` must not read a missing event).
    const add = (e, text) => {
        if (!e || seen.has(e)) return;
        seen.add(e);
        pick.push({ ts: e.ts, type: e.type, text: (text ?? e.text).replace(/\s+/g, ' ').trim() });
    };
    const first = (re, type) => ev.find((e) => (!type || e.type === type) && re.test(e.text));
    add(ev.find((e) => e.type === 'start'));
    add(first(/context file|Starting tonight|reading the context/i, 'say'));
    add(first(/Reading .*OPERATOR/i, 'tool'));
    add(first(/playtest/i, 'test'));
    add(first(/Writing the plan|plan before/i, 'say'));
    for (const e of ev.filter(
        (e) => e.type === 'tool' && /^(Writing|Editing) (game|devlog)\//.test(e.text)
    ))
        if (
            pick.filter((p) => p.type === 'tool').length < 6 &&
            !pick.some((p) => p.text === e.text)
        )
            add(e);
    // the full suite, not a single test file: the run with the most tests
    add(
        ev
            .filter((e) => e.type === 'test' && /^Tests: \d+ passed/.test(e.text))
            .sort((a, b) => Number(/\d+/.exec(b.text)[0]) - Number(/\d+/.exec(a.text)[0]))[0]
    );
    add(first(/^Smoke test: OK/, 'test'));
    add(ev.find((e) => e.type === 'review'));
    add(ev.find((e) => e.type === 'review' && /collid|overlap|bug|wrong|broke|fix/i.test(e.text)));
    add(ev.find((e) => e.type === 'review' && /^Fixed/i.test(e.text)));
    add(ev.find((e) => e.type === 'gate'));
    add(ev.find((e) => e.type === 'cost'));
    add(ev.find((e) => e.type === 'ship' && /merged/i.test(e.text)));
    pick.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return pick.slice(0, AGENT_BEATS.length);
}

/** Replay verdicts from the activity feed: lead with the day's best verified run, show a rejection if any. */
export function verifyRows(D) {
    const a = D.activity || [];
    const ver = a.filter((x) => x.kind === 'verified');
    const rej = a.filter((x) => x.kind === 'rejected');
    const score = (x) =>
        Number(
            (/([\d,]+) from/.exec(x.text) || /a ([\d,]+) claim/.exec(x.text) || [])[1]?.replace(
                /,/g,
                ''
            ) || 0
        );
    const best = [...ver].sort((x, y) => score(y) - score(x));
    const rows = [];
    if (best[0]) rows.push(best[0]);
    if (rej[0]) rows.push(rej[0]);
    for (const x of best.slice(1))
        if (rows.length < 4 && !rows.some((r) => r.text === x.text)) rows.push(x);
    if (rej[1] && rows.length < 5) rows.push(rej[1]);
    for (const x of best)
        if (rows.length < 5 && !rows.includes(x) && !rows.some((r) => r.text === x.text))
            rows.push(x);
    return rows.slice(0, 5);
}

/** Ledger rows as the receipts scene shows them. */
export function ledgerRows(D) {
    const label = (r) => {
        if (r.cat === 'creator_fees') return 'creator fees';
        if (r.cat === 'prize') {
            if (/:buy$/.test(r.memo)) return 'prize: buy $ANSEM';
            // A day paid in SOL (the published fallback when the $ANSEM swap fails twice) has no token amount.
            return r.token == null && r.sol != null ? 'prize: SOL sent' : 'prize: $ANSEM sent';
        }
        if (r.cat === 'compute') return 'compute paid back';
        if (r.cat === 'launch')
            return /locked/i.test(r.memo)
                ? 'founder tokens locked (Streamflow)'
                : 'coin launch (ClawPump)';
        // The ledger's own words, without its dated notes; one known case said plainly.
        if (/compute reimbursement/i.test(r.memo || '') && /mix-up/i.test(r.memo || ''))
            return 'compute payback sent to the wrong wallet (see ledger)';
        const base = (r.memo || r.cat).split(' [')[0].trim();
        return base.length > 52 ? `${base.slice(0, 51)}…` : base;
    };
    return D.ledger.rows.map((r) => ({
        ts: r.ts,
        dir: r.dir,
        what: label(r),
        amount:
            r.sol != null
                ? `${r.dir === 'in' ? '+' : '−'}${r.sol.toFixed(4)} SOL`
                : `${Number(r.token).toFixed(2)} $ANSEM`,
        tx: shortTx(r.tx),
        cat: r.cat
    }));
}

export { shortTx };

/**
 * The scenes, in order. Times inside a scene are in beats from its start.
 *   footage: [{ shot, at, dur, from (s into the shot) | align: { sfx, b }, rate }]
 *   cues:    [{ b, type, v, p }]  sound effects the soundtrack plays in sync with the picture
 */
export function buildScenes(D) {
    const list = [];
    let bar = 0;
    const add = (id, bars, o = {}) => {
        list.push({
            id,
            bar,
            bars,
            t0: bar * BAR,
            t1: (bar + bars) * BAR,
            cues: [],
            footage: [],
            ...o
        });
        bar += bars;
    };

    add('hook1', 1, {
        footage: [{ shot: 'chaos2', from: 0.2 }],
        words: [
            { s: 'AN AI', b: 0 },
            { s: 'IS BUILDING', b: 1 },
            { s: 'A GAME', b: 2 }
        ],
        cues: [
            { b: 0, type: 'slam', v: 0.8 },
            { b: 1, type: 'slam', v: 0.8 },
            { b: 2, type: 'slam', v: 0.9 }
        ]
    });
    add('hook2', 1, {
        footage: [{ shot: 'pepe', from: 0.3 }],
        words: [{ s: 'IN PUBLIC.', b: 0, green: true, big: true }],
        sub: { b: 1.25, s: 'Every night it writes, tests and ships a new version of it.' },
        cues: [
            { b: 0, type: 'slamBig', v: 1 },
            { b: 1.25, type: 'type', p: 1, v: 0.5 }
        ]
    });
    const nights = D.buildsShipped;
    add('hook3', 1, {
        footage: [{ shot: 'chaos3', from: 0.2 }],
        words: [
            { s: `${nights} NIGHTS.`, b: 0 },
            { s: `${nights} BUILDS.`, b: 1 },
            { s: '0 SKIPPED.', b: 2, green: true, big: true }
        ],
        cues: [
            { b: 0, type: 'slam', v: 0.8 },
            { b: 1, type: 'slam', v: 0.85 },
            { b: 2, type: 'slamBig', v: 1 }
        ]
    });
    add('clock', 1, {
        cues: [
            { b: 0, type: 'tick' },
            { b: 1, type: 'tick' },
            { b: 2, type: 'tick' },
            { b: 3, type: 'zap', v: 1 }
        ]
    });
    add('title', 1, {
        cues: [
            { b: 0, type: 'impact', v: 1 },
            { b: 0.25, type: 'whoosh', v: 0.6 },
            { b: 1.5, type: 'type', p: 1.2, v: 0.35 }
        ]
    });

    const lines = agentLines(D);
    const lineCue = (l) =>
        l.type === 'test' || l.type === 'gate'
            ? { type: 'ok', v: 0.5 }
            : l.type === 'cost'
              ? { type: 'coin', v: 0.55 }
              : l.type === 'ship'
                ? { type: 'ok', v: 0.8 }
                : { type: 'blip', v: 0.3, p: l.type === 'tool' ? 4 : 7 };
    add('agent', 2, {
        lines,
        cues: [
            { b: 0, type: 'slam', v: 0.6 },
            ...lines.map((l, i) => ({ b: AGENT_BEATS[i], ...lineCue(l) }))
        ]
    });
    add('stats', 1, {
        cues: [
            { b: 0, type: 'slam', v: 0.9 },
            { b: 0.5, type: 'slam', v: 0.9 },
            { b: 1, type: 'ok', v: 0.9 },
            { b: 1.5, type: 'coin', v: 0.8 }
        ]
    });

    // Day 0, then every night on one wall, then one beat-pair per feature, in real play on the live build.
    add('b0', 1, {
        kind: 'evo',
        build: D.builds[0],
        live: false,
        footage: [{ shot: 'b0', from: 0.35 }],
        cues: [
            { b: 0, type: 'blip', v: 0.8, p: 0 },
            { b: 0.5, type: 'blip', v: 0.45, p: 5 }
        ]
    });
    const night = D.builds.filter((b) => b.n > 0);
    add('wall', 1, {
        builds: night,
        preload: [{ shot: 'wall', frames: night.map((_, i) => i) }],
        cues: [
            ...night.map((_, i) => ({
                b: 0.2 + (i * 2.6) / night.length,
                type: 'blip',
                v: 0.32,
                p: 4 + (i % 8)
            })),
            { b: 3, type: 'slam', v: 0.9 }
        ]
    });
    for (const f of FEATURES) {
        const b = D.builds.find((x) => x.n === f.n);
        if (!b) continue;
        add(`f${f.n}`, 0.5, {
            kind: 'feature',
            build: b,
            feature: f,
            footage: [{ shot: `f${f.n}`, from: f.from }],
            cues: [
                { b: 0, type: 'glitch', v: 0.7, p: f.n },
                { b: 0.5, type: 'blip', v: 0.4, p: 6 }
            ]
        });
    }
    add('diff', 1, {
        cues: [
            { b: 0, type: 'type', p: 0.8, v: 0.6 },
            { b: 0.9, type: 'blip', v: 0.6, p: 12 },
            { b: 1.0, type: 'count', p: 1.6, v: 0.6 }
        ]
    });
    add('bull', 1, {
        footage: [{ shot: 'bell', from: 0 }],
        cues: [{ b: 0, type: 'impact', v: 1 }]
    });
    add('bears', 1, {
        cast: [
            'red_candle',
            'paper_hands',
            'rug_puller',
            'fud_cloud',
            'ponzi',
            'grizzly',
            'doomposter'
        ],
        cues: [
            { b: 0, type: 'slam', v: 0.9 },
            ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ b: 0.5 + i * 0.375, type: 'pop', p: i, v: 0.7 }))
        ]
    });
    add('market', 1, {
        cues: [
            { b: 0, type: 'slamBig', v: 0.9 },
            ...[0, 1, 2, 3].map((i) => ({ b: 1 + i * 0.5, type: 'coin', v: 0.5 }))
        ]
    });
    add('brrr', 1, {
        footage: [
            { shot: 'crate', at: 0, dur: 3, align: { sfx: 'crate', b: 1.5 } },
            { shot: 'levelup', at: 3, dur: 1, from: 0.9 }
        ],
        cues: [{ b: 3, type: 'glitch', v: 0.5, p: 3 }]
    });
    add('boss0', 1, {
        footage: [{ shot: 'rug', at: 1.5, dur: 2.5, align: { sfx: 'bossSpawn', b: 2 } }],
        cues: [
            { b: 0, type: 'alarm', v: 1 },
            { b: 2, type: 'impact', v: 0.9 }
        ]
    });
    add('boss1', 1, {
        footage: [
            { shot: 'chaos', at: 0, dur: 2, align: { sfx: 'bossSpawn', b: 0.1 } },
            { shot: 'liq', at: 2, dur: 2, align: { sfx: 'bossSpawn', b: 2.1 } }
        ],
        cues: [
            { b: 0, type: 'impact', v: 0.8 },
            { b: 2, type: 'impact', v: 0.8 }
        ]
    });
    add('boss2', 1, {
        footage: [{ shot: 'bm', at: 0, dur: 4, align: { sfx: 'bossSpawn', b: 0.1 } }],
        cues: [
            { b: 0, type: 'impact', v: 1 },
            { b: 3.5, type: 'zap', v: 1 }
        ]
    });
    add('fund', 1, {
        cues: [
            { b: 0, type: 'slamBig', v: 0.9 },
            ...[0.75, 1, 1.25, 1.5].map((b) => ({ b, type: 'coin', v: 0.28 }))
        ]
    });
    add('steer', 1, {
        cues: [
            { b: 0, type: 'slamBig', v: 0.9 },
            { b: 0.5, type: 'whoosh', v: 0.45 },
            { b: 0.75, type: 'whoosh', v: 0.45 },
            { b: 1, type: 'whoosh', v: 0.45 },
            { b: 1.75, type: 'type', p: 0.9, v: 0.35 }
        ]
    });
    add('play', 1, {
        footage: [{ shot: 'phoneTitle', from: 0.5 }],
        cues: [
            { b: 0, type: 'slamBig', v: 0.9 },
            { b: 0.25, type: 'whoosh', v: 0.6 },
            { b: 1, type: 'blip', v: 0.5, p: 5 },
            { b: 1.25, type: 'blip', v: 0.5, p: 7 },
            { b: 1.5, type: 'blip', v: 0.5, p: 9 }
        ]
    });
    const vrows = verifyRows(D);
    add('verify', 1, {
        rows: vrows,
        cues: [
            { b: 0, type: 'slam', v: 0.8 },
            ...vrows.map((r, i) => ({
                b: 0.75 + i * 0.25,
                type: r.kind === 'rejected' ? 'err' : 'ok',
                v: 0.6
            }))
        ]
    });
    // the #1 of each of the latest days first; bounty shares only if there aren't three
    const firsts = D.ledger.prizes.filter((p) => p.kind === '1');
    const prizes = [...firsts, ...D.ledger.prizes.filter((p) => p.kind !== '1')].slice(0, 3);
    add('prize', 1, {
        prizes,
        cues: [
            { b: 0, type: 'slam', v: 0.8 },
            ...prizes.map((p, i) => ({ b: 0.75 + i * 0.5, type: 'coin', v: 0.75 }))
        ]
    });
    add('road', 1, {
        cues: [
            { b: 0, type: 'slam', v: 0.9 },
            ...[0.5, 0.85, 1.2, 1.55].map((b) => ({ b, type: 'ok', v: 0.45 })),
            { b: 2.25, type: 'slamBig', v: 0.9 },
            ...[2.6, 2.9, 3.2].map((b) => ({ b, type: 'whoosh', v: 0.5 }))
        ]
    });
    add('tonight', 1, {
        cues: [
            { b: 0, type: 'slam', v: 0.9 },
            { b: 0.75, type: 'slam', v: 0.8 },
            { b: 1.25, type: 'type', p: 1.2, v: 0.4 }
        ]
    });
    add('end', 3, {
        footage: [{ shot: 'chaos2', from: 0.5, rate: 0.5 }],
        cues: [
            { b: 0, type: 'impact', v: 1 },
            { b: 2, type: 'slam', v: 0.8 },
            { b: 4, type: 'slam', v: 0.9 }
        ]
    });
    if (bar !== SECTIONS.length)
        throw new Error(`timeline has ${bar} bars, the music has ${SECTIONS.length}`);
    return list;
}

/** Fill in `from` for footage aligned on one of the shot's own sounds (a crate opening, a boss arriving). */
export function resolveFootage(scenes, meta) {
    for (const s of scenes)
        for (const f of s.footage) {
            f.at ??= 0;
            f.dur ??= s.bars * 4 - f.at;
            f.rate ??= 1;
            if (f.align) {
                const ev = meta[f.shot]?.sfx.find((e) => e.n === f.align.sfx);
                const tEv = ev ? ev.f / FPS : 1;
                f.from = Math.max(0, tEv - (f.align.b - f.at) * BEAT * f.rate);
            }
            f.from ??= 0;
        }
    return scenes;
}

/** The footage frame a scene shows at scene-local time `lt` (seconds), or null. */
export function footageAt(scene, lt, meta) {
    const b = lt / BEAT;
    let use = null;
    for (const f of scene.footage) if (b >= f.at && b < f.at + f.dur) use = f;
    if (!use) return null;
    const m = meta[use.shot];
    if (!m) return null;
    const ts = use.from + (lt - use.at * BEAT) * use.rate;
    return {
        shot: use.shot,
        frame: Math.max(0, Math.min(m.frames - 1, Math.round(ts * FPS))),
        use
    };
}

/** Every sound the game itself made in the footage on screen, at video time. */
export function footageSfx(scenes, meta) {
    const out = [];
    for (const s of scenes)
        for (const f of s.footage) {
            const m = meta[f.shot];
            if (!m) continue;
            const a = f.from;
            const b = f.from + f.dur * BEAT * f.rate;
            for (const e of m.sfx) {
                const ts = e.f / FPS;
                if (ts >= a && ts < b)
                    out.push({ t: s.t0 + f.at * BEAT + (ts - a) / f.rate, n: e.n, shot: f.shot });
            }
        }
    return out.sort((x, y) => x.t - y.t);
}

/** Every cue, at video time. */
export function allCues(scenes) {
    const out = [];
    for (const s of scenes)
        for (const c of s.cues) out.push({ ...c, t: s.t0 + c.b * BEAT, scene: s.id });
    return out.sort((x, y) => x.t - y.t);
}
