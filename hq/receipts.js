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
    if (isNum(bal))
        $('.rc-v', el).innerHTML =
            `${bal.toFixed(3)}<small style="font-size:.5em;color:var(--muted)"> SOL</small>`;
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

async function boot() {
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
