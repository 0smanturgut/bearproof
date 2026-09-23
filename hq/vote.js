/*
 * Holder voting on the HQ. Loaded after hq.js. Reads GET /api/vote; when the poll is open it replaces the example
 * cards with the real proposals and lets a holder vote by signing a plain-text message (no transaction).
 * The message format must match worker/src/lib/vote.js voteMessage() byte for byte.
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

    function message(f) {
        return [
            `${f.domain} wants you to vote with your Solana account:`,
            f.wallet,
            '',
            `Vote: ${f.proposalId} for Build #${f.forBuild} (poll ${f.pollDate})`,
            'This signature is free. It sends no transaction and moves no funds.',
            '',
            `Nonce: ${f.nonce}`,
            `Issued At: ${f.issuedAt}`
        ].join('\n');
    }

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    let poll = null;
    let wallet = null;
    let status = null;
    let last = null; // survives a re-render, so a confirmation stays visible

    function say(text, tone) {
        last = { text, tone };
        if (!status) return;
        status.textContent = text;
        status.className = 'vote-status' + (tone ? ' ' + tone : '');
    }

    async function connect() {
        const found = provider();
        if (!found) {
            const url = location.href.split('#')[0] + '#vote';
            const ref = encodeURIComponent(location.origin);
            const box = el('p', 'vote-status');
            box.innerHTML =
                'No Solana wallet in this browser. Open this page in ' +
                `<a href="https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${ref}">Phantom</a> or ` +
                `<a href="https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${ref}">Solflare</a>.`;
            status.replaceWith(box);
            status = box;
            return null;
        }
        try {
            const res = await found.p.connect();
            const pk = (res && res.publicKey) || found.p.publicKey;
            wallet = { p: found.p, name: found.name, address: pk.toString() };
            say(
                `Connected: ${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)} (${found.name}). Pick a feature.`
            );
            document.querySelectorAll('.vote-card button').forEach((b) => (b.disabled = false));
            return wallet;
        } catch {
            say('Connection was cancelled.', 'bad');
            return null;
        }
    }

    async function vote(proposalId) {
        if (!wallet && !(await connect())) return;
        const fields = {
            domain: location.host,
            wallet: wallet.address,
            proposalId,
            forBuild: poll.forBuild,
            pollDate: poll.pollDate,
            nonce: nonce(),
            issuedAt: new Date().toISOString()
        };
        let sigBytes;
        try {
            const out = await wallet.p.signMessage(
                new TextEncoder().encode(message(fields)),
                'utf8'
            );
            sigBytes = out && out.signature ? out.signature : out;
        } catch {
            say('Signature cancelled. Nothing was sent.', 'bad');
            return;
        }
        say('Checking your balance and counting the vote…');
        try {
            const r = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...fields, signature: base58(new Uint8Array(sigBytes)) })
            });
            const data = await r.json().catch(() => null);
            if (r.ok && data && data.ok) {
                say(
                    `Voted with weight ${data.weight.toLocaleString('en-US')}. You can change it until ${poll.closesAt.slice(11, 16)} UTC.`,
                    'good'
                );
                load();
            } else {
                say(
                    (data && data.error && data.error.message) || `Vote failed (${r.status}).`,
                    'bad'
                );
            }
        } catch {
            say('Network error. Try again.', 'bad');
        }
    }

    function render() {
        const wrap = $('#vote .vote');
        if (!wrap) return;
        wrap.innerHTML = '';
        const head = el('div', 'vote-state panel');
        head.appendChild(el('span', 'flag gold', `Live poll · Build #${poll.forBuild}`));
        head.appendChild(
            el(
                'p',
                null,
                `Proof proposed three features for tomorrow's build. Holders vote until ${poll.closesAt.slice(11, 16)} UTC; the winner is what Proof builds next. Weight = floor(√tokens), at least ${poll.rule.minTokens.toLocaleString('en-US')} tokens.`
            )
        );
        head.appendChild(
            el(
                'p',
                'fine',
                `${poll.voters} wallet${poll.voters === 1 ? '' : 's'} voted · total weight ${poll.totalWeight.toLocaleString('en-US')}`
            )
        );
        const btn = el(
            'button',
            'btn btn-primary',
            wallet ? 'Wallet connected' : 'Connect wallet to vote'
        );
        btn.type = 'button';
        btn.disabled = poll.status !== 'open';
        btn.addEventListener('click', connect);
        head.appendChild(btn);
        status = el('p', 'vote-status');
        head.appendChild(status);
        if (poll.status !== 'open') say('This poll is closed.');
        else if (last) say(last.text, last.tone);
        else say('Signing is free: no transaction, no approval.');
        wrap.appendChild(head);

        const list = el('ul', 'ex-list vote-list');
        for (const p of poll.proposals) {
            const li = el('li', 'ex vote-card');
            li.appendChild(el('h3', null, p.title));
            li.appendChild(el('p', null, p.description));
            const bar = el('div', 'ex-bar');
            const fill = el('i');
            fill.style.width = `${p.share || 0}%`;
            bar.appendChild(fill);
            li.appendChild(bar);
            li.appendChild(
                el(
                    'p',
                    'ex-foot',
                    `${p.share || 0}% · ${p.voters} voter${p.voters === 1 ? '' : 's'}`
                )
            );
            const b = el('button', 'btn btn-sm', 'Vote for this');
            b.type = 'button';
            b.disabled = poll.status !== 'open';
            b.addEventListener('click', () => vote(p.id));
            li.appendChild(b);
            if (poll.winner && poll.winner.id === p.id) li.classList.add('winner');
            list.appendChild(li);
        }
        const side = el('div', 'examples');
        side.appendChild(list);
        wrap.appendChild(side);
    }

    async function load() {
        try {
            const r = await fetch('/api/vote', {
                headers: { accept: 'application/json' },
                cache: 'no-cache'
            });
            if (!r.ok) return;
            const data = await r.json();
            // Before the coin launches the designed empty state (in the HTML) stays.
            if (!data || data.status === 'not_live' || !data.proposals || !data.proposals.length)
                return;
            poll = data;
            render();
        } catch {
            /* keep the empty state */
        }
    }

    load();
})();
