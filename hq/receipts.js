/*
 * /receipts: the wallets, the whole ledger (GET /api/ledger, the newest 100 rows), and the Daily Pot's exact rules.
 * Every value is the API's; a failed fetch leaves the designed state.
 */

const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{43,90}$/;
const CATEGORY = {
    creator_fees: 'Creator fees',
    compute: 'AI compute',
    hosting: 'Hosting',
    prize: 'Daily prize',
    sweep: 'Prize wallet top-up',
    launch: 'Launch',
    marketing: 'Marketing',
    buyback: 'Buyback',
    reimbursement: 'Reimbursement',
    other: 'Other'
};

const $ = (s, r = document) => r.querySelector(s);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');
const usd = (n) =>
    `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props)
        for (const [k, v] of Object.entries(props)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') el.className = v;
            else el.setAttribute(k, String(v));
        }
    for (const k of kids.flat()) {
        if (k === null || k === undefined || k === false) continue;
        el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
}

async function getJSON(url) {
    try {
        const r = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-cache' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

let toastTimer = 0;
function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2000);
}

function wallet(key, addr, bal) {
    const el = $(`[data-wallet="${key}"]`);
    if (!el) return;
    if (isNum(bal)) $('.stat-v', el).innerHTML = `${bal.toFixed(3)}<small>SOL</small>`;
    if (!addr || !B58.test(addr)) return;
    $('.w-addr', el).textContent = addr;
    const go = $('.w-go', el);
    go.textContent = '';
    const copy = h('button', { class: 'ca-copy', type: 'button' }, 'Copy');
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(addr);
            toast('Address copied');
        } catch {
            toast('Copy failed. Select the address and copy it by hand.');
        }
    });
    go.append(
        copy,
        h(
            'a',
            { href: `https://solscan.io/account/${addr}`, rel: 'noopener', target: '_blank' },
            'Solscan ↗'
        )
    );
}

function amountText(r) {
    const parts = [];
    if (isNum(r.amountSol)) parts.push(`${+r.amountSol.toFixed(4)} SOL`);
    if (r.tokenAmount !== null && r.tokenAmount !== undefined && r.tokenAmount !== '') {
        const sym =
            r.tokenMint === ANSEM_MINT
                ? '$ANSEM'
                : r.tokenMint && B58.test(r.tokenMint)
                  ? short(r.tokenMint)
                  : 'tokens';
        parts.push(
            `${Number(r.tokenAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${sym}`
        );
    }
    if (!parts.length && isNum(r.usdEstimate)) parts.push(`≈ ${usd(r.usdEstimate)}`);
    return parts.join(' + ') || '—';
}

let rows = [];
let filter = 'all';
const FILTERS = {
    all: () => true,
    in: (r) => r.direction === 'in',
    out: (r) => r.direction !== 'in',
    prize: (r) => r.category === 'prize',
    operator: (r) => r.direction !== 'in' && r.category !== 'prize'
};

function render() {
    const body = $('#ledgerRows');
    body.textContent = '';
    const list = rows.filter(FILTERS[filter]);
    for (const r of list) {
        const ms = Date.parse(r.ts);
        const dir = r.direction === 'in' ? 'in' : 'out';
        const url =
            (typeof r.solscan === 'string' &&
                /^https:\/\/solscan\.io\//.test(r.solscan) &&
                r.solscan) ||
            (SIG.test(r.tx || '') ? `https://solscan.io/tx/${r.tx}` : null);
        body.append(
            h(
                'tr',
                { class: dir },
                h(
                    'td',
                    { class: 'tm' },
                    Number.isFinite(ms)
                        ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
                        : '—'
                ),
                h(
                    'td',
                    null,
                    h('span', { class: `flow ${dir}` }, dir === 'in' ? '↓ in' : '↑ out'),
                    ' ',
                    h('b', null, CATEGORY[r.category] || r.category || '—'),
                    h(
                        'span',
                        { class: `mk ${r.measured ? 'm' : 'e'}` },
                        r.measured ? 'measured' : 'estimate'
                    )
                ),
                h(
                    'td',
                    { class: `num-c amt ${dir}` },
                    `${dir === 'in' ? '+' : '−'}${amountText(r)}`
                ),
                h('td', { class: 'memo' }, r.memo ? String(r.memo) : ''),
                h(
                    'td',
                    null,
                    url
                        ? h('a', { href: url, rel: 'noopener', target: '_blank' }, 'Solscan ↗')
                        : h(
                              'span',
                              { class: 'fine' },
                              r.source === 'chain' ? 'pending' : 'off-chain'
                          )
                )
            )
        );
    }
    if (!list.length)
        body.append(
            h('tr', null, h('td', { colspan: '5', class: 'fine' }, 'Nothing in this view.'))
        );
}

const WALLET = { treasury: 'Treasury', prize: 'Prize wallet', other: 'Other' };
const signed = (amount, asset) => {
    const n = Number(amount);
    const txt = Math.abs(n).toLocaleString('en-US', {
        maximumFractionDigits: asset === 'SOL' ? 6 : 2
    });
    return `${n < 0 ? '−' : '+'}${txt} ${asset === 'SOL' ? 'SOL' : asset === 'ANSEM' ? '$ANSEM' : short(asset)}`;
};
const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return !Number.isFinite(m)
        ? ''
        : m < 1
          ? 'just now'
          : m < 60
            ? `${m} min ago`
            : `${Math.round(m / 60)} h ago`;
};

/** SQD Network's own view of the two wallets (GET /api/onchain), set against our ledger move by move. */
async function sqd() {
    const d = await getJSON('/api/onchain');
    const sum = $('#sqdSum');
    const body = $('#sqdRows');
    sum.textContent = '';
    if (!d || !Array.isArray(d.moves)) {
        sum.append(
            h(
                'p',
                { class: 'fine' },
                "SQD's view is offline right now. The ledger below still links every row to Solscan."
            )
        );
        return;
    }
    for (const t of d.last24h || [])
        sum.append(
            h(
                'div',
                { class: 'sqd-chip' },
                h(
                    'span',
                    null,
                    `${WALLET[t.wallet] || t.wallet} · ${t.asset === 'SOL' ? 'SOL' : '$' + t.asset} · 24 h`
                ),
                h(
                    'b',
                    null,
                    `+${Number(t.in).toLocaleString('en-US', { maximumFractionDigits: 4 })} / −${Number(t.out).toLocaleString('en-US', { maximumFractionDigits: 4 })}`
                ),
                h(
                    'span',
                    { class: 'fine' },
                    `${t.moves} move${t.moves === 1 ? '' : 's'} · ${t.inLedger} in our ledger`
                )
            )
        );
    if (!(d.last24h || []).length)
        sum.append(h('p', { class: 'fine' }, 'No moves in the last 24 hours yet.'));
    body.textContent = '';
    let dustNote = null;
    for (const m of d.moves) {
        const ledger = m.inLedger
            ? h('span', { class: 'mk m' }, '✓ listed')
            : m.note
              ? h(
                    'span',
                    { class: 'mk', title: m.note },
                    /dust/.test(m.note) ? 'dust · left out by rule *' : 'failed tx · fee only'
                )
              : h('span', { class: 'mk e' }, 'not listed');
        if (m.note && /dust/.test(m.note)) dustNote = m.note;
        body.append(
            h(
                'tr',
                { class: m.direction },
                h('td', { class: 'tm' }, m.ts.slice(0, 16).replace('T', ' ')),
                h('td', null, WALLET[m.wallet] || m.wallet),
                h('td', { class: `num-c amt ${m.direction}` }, signed(m.amount, m.asset)),
                h('td', null, ledger),
                h(
                    'td',
                    null,
                    h('a', { href: m.solscan, rel: 'noopener', target: '_blank' }, 'Solscan ↗')
                )
            )
        );
    }
    if (!d.moves.length)
        body.append(
            h(
                'tr',
                null,
                h(
                    'td',
                    { colspan: '5', class: 'fine' },
                    'SQD has not indexed a move yet. The first run reads the last 24 hours.'
                )
            )
        );
    $('#sqdMeta').textContent = [
        d.indexedToSlot ? `Indexed up to slot ${d.indexedToSlot.toLocaleString('en-US')}` : null,
        d.syncedAt ? `read ${ago(d.syncedAt)}` : null,
        d.indexed && d.indexed.since
            ? `${d.indexed.moves} moves since ${d.indexed.since.slice(0, 16).replace('T', ' ')} UTC`
            : null,
        'source: SQD Portal (portal.sqd.dev), finalized Solana blocks'
    ]
        .filter(Boolean)
        .join(' · ');
    if (dustNote)
        $('#sqdMeta').prepend(
            h(
                'span',
                { class: 'sqd-legend' },
                `* ${dustNote[0].toUpperCase()}${dustNote.slice(1)}.`
            ),
            h('br')
        );
}

/** The permanent archive on Irys (GET /api/archive): every build with its gateway link, and every settled Daily. */
async function irys() {
    const [d, b] = await Promise.all([getJSON('/api/archive'), getJSON('/api/builds')]);
    const sum = $('#irysSum');
    const body = $('#irysRows');
    sum.textContent = '';
    body.textContent = '';
    if (!d || !Array.isArray(d.builds)) {
        sum.append(h('p', { class: 'fine' }, 'The archive view is offline right now.'));
        return;
    }
    const titles = new Map(((b && b.builds) || []).map((x) => [x.n, x.title]));
    const t = d.totals || {};
    const devlogs = d.builds.filter((x) => x.revisions.some((r) => r.devlog)).length;
    const chip = (k, v, note) =>
        h(
            'div',
            { class: 'sqd-chip' },
            h('span', null, k),
            h('b', null, v),
            note ? h('span', { class: 'fine' }, note) : null
        );
    if (d.status === 'off')
        sum.append(
            h(
                'p',
                { class: 'fine' },
                "The archive hasn't started yet. This section fills in as it does."
            )
        );
    else {
        sum.append(
            chip(
                'Builds',
                String(t.builds || 0),
                t.revisions > t.builds
                    ? `${t.revisions} versions, updates included`
                    : 'each one playable'
            ),
            chip('Devlogs', String(devlogs), 'as written the night each build shipped'),
            chip('Daily results', String(t.days || 0), 'leaderboard, payouts, replay hashes'),
            chip(
                'Stored',
                `${((t.bytes || 0) / 1048576).toFixed(1)} MB`,
                `${(t.items || 0).toLocaleString('en-US')} items, ${(t.files || 0).toLocaleString('en-US')} unique files`
            )
        );
        if (d.status === 'needs_funding')
            sum.append(
                h(
                    'p',
                    { class: 'fine' },
                    'Paused: the next item is over the size Irys stores for free, so the storage wallet needs a little SOL first.'
                )
            );
    }
    for (const x of d.builds) {
        const last = x.revisions[x.revisions.length - 1];
        const older = x.revisions.slice(0, -1);
        body.append(
            h(
                'tr',
                null,
                h('td', null, h('b', null, `#${x.n}`), ' ', titles.get(x.n) || ''),
                h(
                    'td',
                    null,
                    h('a', { href: last.play, rel: 'noopener', target: '_blank' }, 'Play ↗'),
                    older.length
                        ? h(
                              'span',
                              { class: 'fine' },
                              ` · v${last.revision}; earlier: `,
                              ...older.flatMap((r, i) => [
                                  i ? ', ' : '',
                                  h(
                                      'a',
                                      { href: r.play, rel: 'noopener', target: '_blank' },
                                      `v${r.revision}`
                                  )
                              ])
                          )
                        : null
                ),
                h(
                    'td',
                    null,
                    last.devlog
                        ? h('a', { href: last.devlog, rel: 'noopener', target: '_blank' }, 'Read ↗')
                        : h('span', { class: 'fine' }, '—')
                ),
                h(
                    'td',
                    { class: 'tm' },
                    String(last.at || '')
                        .slice(0, 16)
                        .replace('T', ' ')
                ),
                h('td', { class: 'num-c' }, String(last.files))
            )
        );
    }
    if (!d.builds.length)
        body.append(
            h(
                'tr',
                null,
                h(
                    'td',
                    { colspan: '5', class: 'fine' },
                    'No build stored yet. The oldest goes first.'
                )
            )
        );
    const days = $('#irysDays');
    days.textContent = '';
    if ((d.days || []).length) {
        days.append(h('span', { class: 'fine' }, 'Daily Challenge results: '));
        d.days.forEach((x, i) =>
            days.append(
                i ? ' · ' : '',
                h(
                    'a',
                    {
                        href: x.url,
                        rel: 'noopener',
                        target: '_blank',
                        title: `The ${x.date} Daily on Build #${x.build}`
                    },
                    x.date.slice(5)
                )
            )
        );
    }
    $('#irysMeta').textContent = [
        d.runAt ? `last run ${ago(d.runAt)}` : null,
        d.wallet ? `uploader ${short(d.wallet)}` : null,
        'replays stay private (anyone holding one could resubmit it); each Daily record carries the SHA-256 of its top replays',
        'via uploader.irys.xyz to the Irys L1 (mainnet beta); read at gateway.irys.xyz'
    ]
        .filter(Boolean)
        .join(' · ');
}

async function boot() {
    sqd();
    irys();
    const [s, ledger, pot] = await Promise.all([
        getJSON('/api/stats'),
        getJSON('/api/ledger'),
        getJSON('/api/pot')
    ]);
    const t = (s && s.treasury) || {};
    const w = (ledger && ledger.wallets) || {};
    wallet('treasury', w.treasury || t.wallet, t.balance);
    wallet('prize', w.prize || t.prizeWallet, t.prizeWalletBalance);
    const c = s && s.computeSpentUsd;
    if (c && isNum(c.measured)) {
        $('#spent').textContent = usd(c.measured);
        $('#spentS').textContent =
            `Measured: Claude Code's own count for ${c.meteredRuns} nightly runs${isNum(c.chat) && c.chat > 0 ? `, plus ${usd(c.chat)} for the Telegram chat` : ''}.`;
    }

    rows = ledger && Array.isArray(ledger.entries) ? ledger.entries : [];
    const oldest = rows.length ? rows[rows.length - 1].ts : null;
    $('#ledgerMeta').textContent = ledger
        ? `${rows.length} newest rows${oldest ? `, back to ${String(oldest).slice(0, 16).replace('T', ' ')} UTC` : ''}. Older ones are on Solscan, under each wallet.`
        : 'The ledger is offline right now. Every wallet is still on Solscan.';
    render();
    for (const b of document.querySelectorAll('.seg button'))
        b.addEventListener('click', () => {
            filter = b.dataset.f;
            for (const x of document.querySelectorAll('.seg button'))
                x.classList.toggle('on', x === b);
            render();
        });

    const rule = pot && pot.rule;
    if (rule && rule.text) {
        $('#potText').textContent = rule.text;
        const ul = $('#potList');
        for (const d of rule.details || []) ul.append(h('li', null, d));
    } else $('#potText').textContent = 'The rules are offline right now.';
}

boot();
