/*
 * The ballot on the HQ. Loaded after hq.js. Reads GET /api/vote and renders tomorrow's ballot: the AI's three
 * proposals plus holders' own requests. With the coin live, a holder votes, or posts a request, by signing a
 * plain-text message (no transaction). Message formats must match worker/src/lib/vote.js voteMessage() and
 * worker/src/lib/requests.js requestMessage() byte for byte.
 */
(function () {
    'use strict';
    const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const $ = (s) => document.querySelector(s);

    function base58(bytes) {
        let n = 0n;
        for (const b of bytes) n = (n << 8n) | BigInt(b);
        let out = '';
        while (n > 0n) {
            out = B58[Number(n % 58n)] + out;
            n /= 58n;
        }
        for (const b of bytes) {
            if (b !== 0) break;
            out = '1' + out;
        }
        return out;
    }

    function nonce() {
        const a = new Uint8Array(12);
        crypto.getRandomValues(a);
        return Array.from(a, (b) => B58[b % 58]).join('');
    }

    function provider() {
        const w = window;
        if (w.phantom && w.phantom.solana && w.phantom.solana.isPhantom)
            return { p: w.phantom.solana, name: 'Phantom' };
        if (w.backpack && w.backpack.solana) return { p: w.backpack.solana, name: 'Backpack' };
        if (w.solflare && w.solflare.isSolflare) return { p: w.solflare, name: 'Solflare' };
        if (w.solana) return { p: w.solana, name: 'wallet' };
        return null;
    }

    const FOOTER = 'This signature is free. It sends no transaction and moves no funds.';

    function voteMessage(f) {
        return [
            `${f.domain} wants you to vote with your Solana account:`,
            f.wallet,
            '',
            `Vote: ${f.proposalId} for Build #${f.forBuild} (poll ${f.pollDate})`,
            FOOTER,
            '',
            `Nonce: ${f.nonce}`,
            `Issued At: ${f.issuedAt}`
        ].join('\n');
    }

    function requestMessage(f) {
        return [
            `${f.domain} wants you to post a feature request with your Solana account:`,
            f.wallet,
            '',
            `Request for Build #${f.forBuild} (poll ${f.pollDate}): ${f.title}`,
            f.description || '(no details)',
            FOOTER,
            '',
            `Nonce: ${f.nonce}`,
            `Issued At: ${f.issuedAt}`
        ].join('\n');
    }

    /** Same cleaning as the server (lib/requests.js cleanText), so the signed text is what gets stored. */
    function cleanText(raw) {
        return String(raw || '')
            .normalize('NFC')
            .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    const hhmm = (iso) => String(iso || '').slice(11, 16);

    let poll = null;
    let wallet = null;

    function say(target, text, tone) {
        const box = $(target);
        if (!box) return;
        box.textContent = text;
        box.className = 'vote-status' + (tone ? ' ' + tone : '');
    }

    function noWallet(target) {
        const url = location.href.split('#')[0] + '#vote';
        const ref = encodeURIComponent(location.origin);
        const box = $(target);
        box.className = 'vote-status';
        box.textContent = 'No Solana wallet in this browser. Open this page in ';
        const a1 = el('a', null, 'Phantom');
        a1.href = `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${ref}`;
        const a2 = el('a', null, 'Solflare');
        a2.href = `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${ref}`;
        box.append(a1, ' or ', a2, '.');
    }

    async function connect(target = '#voteStatus') {
        if (wallet) return wallet;
        const found = provider();
        if (!found) {
            noWallet(target);
            return null;
        }
        try {
            const res = await found.p.connect();
            const pk = (res && res.publicKey) || found.p.publicKey;
            wallet = { p: found.p, name: found.name, address: pk.toString() };
            const btn = $('#voteConnect');
            btn.textContent = `Connected: ${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`;
            btn.disabled = true;
            say('#voteStatus', `Connected with ${found.name}. Pick an option below.`);
            return wallet;
        } catch {
            say(target, 'Connection was cancelled.', 'bad');
            return null;
        }
    }

    async function signText(text) {
        const out = await wallet.p.signMessage(new TextEncoder().encode(text), 'utf8');
        const bytes = out && out.signature ? out.signature : out;
        return base58(new Uint8Array(bytes));
    }

    async function post(path, body) {
        const r = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await r.json().catch(() => null);
        return { ok: r.ok && data && data.ok, status: r.status, data };
    }

    async function vote(option) {
        if (!(await connect())) return;
        const fields = {
            domain: location.host,
            wallet: wallet.address,
            proposalId: option.id,
            forBuild: poll.forBuild,
            pollDate: poll.pollDate,
            nonce: nonce(),
            issuedAt: new Date().toISOString()
        };
        let signature;
        try {
            signature = await signText(voteMessage(fields));
        } catch {
            say('#voteStatus', 'Signature cancelled. Nothing was sent.', 'bad');
            return;
        }
        say('#voteStatus', 'Checking your balance and counting the vote…');
        try {
            const r = await post('/api/vote', { ...fields, signature });
            if (r.ok) {
                say(
                    '#voteStatus',
                    `Voted for "${option.title}" with weight ${fmt(r.data.weight)}. You can change it until ${hhmm(poll.closesAt)} UTC.`,
                    'good'
                );
                load();
            } else {
                say(
                    '#voteStatus',
                    (r.data && r.data.error && r.data.error.message) ||
                        `Vote failed (${r.status}).`,
                    'bad'
                );
            }
        } catch {
            say('#voteStatus', 'Network error. Try again.', 'bad');
        }
    }

    async function request(e) {
        e.preventDefault();
        if (!poll || !poll.requests || poll.requests.status !== 'open') return;
        const title = cleanText($('#reqTitle').value);
        const description = cleanText($('#reqDesc').value);
        if (title.length < 6)
            return say('#reqStatus', 'Name the feature in at least 6 characters.', 'bad');
        if (!(await connect('#reqStatus'))) return;
        const fields = {
            domain: location.host,
            wallet: wallet.address,
            title,
            description,
            forBuild: poll.forBuild,
            pollDate: poll.pollDate,
            nonce: nonce(),
            issuedAt: new Date().toISOString()
        };
        let signature;
        try {
            signature = await signText(requestMessage(fields));
        } catch {
            say('#reqStatus', 'Signature cancelled. Nothing was sent.', 'bad');
            return;
        }
        say('#reqStatus', 'Checking your balance and posting…');
        try {
            const r = await post('/api/vote/request', {
                wallet: fields.wallet,
                title,
                description,
                nonce: fields.nonce,
                issuedAt: fields.issuedAt,
                signature
            });
            if (r.ok) {
                say(
                    '#reqStatus',
                    'Posted. Your request is on the ballot. Now get it votes.',
                    'good'
                );
                $('#reqForm').reset();
                count();
                load();
            } else {
                say(
                    '#reqStatus',
                    (r.data && r.data.error && r.data.error.message) ||
                        `Posting failed (${r.status}).`,
                    'bad'
                );
            }
        } catch {
            say('#reqStatus', 'Network error. Try again.', 'bad');
        }
    }

    function count() {
        const n = $('#reqDesc').value.length;
        $('#reqCount').textContent =
            `${n} / ${(poll && poll.requests && poll.requests.descriptionMax) || 240}`;
    }

    function card(o, live) {
        const li = el('li', 'ex vote-card' + (o.source === 'community' ? ' community' : ''));
        li.appendChild(
            el(
                'span',
                'ex-stamp',
                o.source === 'community' ? `Holder · ${o.requestedBy || ''}` : 'AI proposal'
            )
        );
        li.appendChild(el('h3', null, o.title));
        if (o.description) li.appendChild(el('p', null, o.description));
        const bar = el('div', 'ex-bar');
        const fill = el('i');
        fill.style.width = `${live ? o.share || 0 : 0}%`;
        bar.appendChild(fill);
        li.appendChild(bar);
        li.appendChild(
            el(
                'p',
                'ex-foot',
                live
                    ? `${o.share || 0}% · ${o.voters || 0} voter${o.voters === 1 ? '' : 's'}`
                    : 'Votes open at coin launch'
            )
        );
        if (live) {
            const b = el('button', 'btn btn-sm', 'Vote for this');
            b.type = 'button';
            b.disabled = poll.status !== 'open';
            b.addEventListener('click', () => vote(o));
            li.appendChild(b);
        }
        if (poll.winner && poll.winner.id === o.id) li.classList.add('winner');
        return li;
    }

    function render() {
        const live = poll.status !== 'not_live';
        const flag = $('#voteFlag');
        flag.textContent = !live
            ? 'Voting opens when the coin launches'
            : poll.status === 'open'
              ? `Live · closes ${hhmm(poll.closesAt)} UTC`
              : 'Closed for today';
        flag.className = 'flag ' + (poll.status === 'open' ? 'bull' : 'gold');
        const connectBtn = $('#voteConnect');
        if (!wallet) {
            connectBtn.disabled = poll.status !== 'open';
            connectBtn.textContent = 'Connect wallet to vote';
        }
        if (!$('#voteStatus').textContent)
            say(
                '#voteStatus',
                !live
                    ? 'Until the coin launches, the AI picks from its own proposals.'
                    : poll.status === 'open'
                      ? 'Signing is free: no transaction, no approval.'
                      : poll.winner
                        ? `Winner: "${poll.winner.title}" (${poll.winner.share}%). It ships at 00:00 UTC.`
                        : 'No votes today, so the AI picks. The next ballot opens at 00:00 UTC.'
            );

        const list = $('#ballot');
        list.textContent = '';
        const options = poll.proposals
            .slice()
            .sort((a, b) => (live ? (b.weight || 0) - (a.weight || 0) : 0));
        for (const o of options) list.appendChild(card(o, live));
        const community = poll.proposals.filter((o) => o.source === 'community').length;
        $('#ballotMeta').textContent = [
            `Build #${poll.forBuild}`,
            `${poll.proposals.length - community} AI · ${community} holder`,
            live ? `${fmt(poll.voters)} voter${poll.voters === 1 ? '' : 's'}` : null
        ]
            .filter(Boolean)
            .join(' · ');

        const rq = poll.requests || { status: 'not_live' };
        const open = rq.status === 'open';
        const reqFlag = $('#reqFlag');
        reqFlag.textContent = {
            not_live: 'Opens with the coin',
            open: `Open until ${hhmm(rq.closesAt)} UTC · ${rq.count}/${rq.maxPerPoll}`,
            full: `Ballot full · ${rq.maxPerPoll}/${rq.maxPerPoll}`,
            closed: 'Closed for today'
        }[rq.status];
        reqFlag.className = 'flag ' + (open ? 'bull' : 'dim');
        for (const id of ['#reqTitle', '#reqDesc', '#reqSubmit']) $(id).disabled = !open;
        if (!$('#reqStatus').textContent && !open)
            say(
                '#reqStatus',
                rq.status === 'not_live'
                    ? 'Requests open when the coin launches.'
                    : rq.status === 'full'
                      ? 'Today’s ballot is full. Vote for a request instead, or post tomorrow.'
                      : 'Requests for this ballot closed at 12:00 UTC. The next ballot opens at 00:00 UTC.'
            );
    }

    async function load() {
        try {
            const r = await fetch('/api/vote', {
                headers: { accept: 'application/json' },
                cache: 'no-cache'
            });
            if (!r.ok) return;
            const data = await r.json();
            if (!data || !Array.isArray(data.proposals) || !data.proposals.length) return;
            poll = data;
            render();
        } catch {
            /* keep the designed state */
        }
    }

    $('#voteConnect').addEventListener('click', () => connect());
    $('#reqForm').addEventListener('submit', request);
    $('#reqDesc').addEventListener('input', count);
    load();
    setInterval(() => document.visibilityState === 'visible' && load(), 60000);
})();
