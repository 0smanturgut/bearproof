/*
 * /bears: every playable character, boss and bear, read from the live build's own content module
 * (/b/<live>/src/sim/content.js), so the page grows when the AI adds an enemy. Sprites come from /art (art.js).
 * If the live build can't be read, a short built-in list keeps the page whole.
 */

const FALLBACK = {
    CHARACTERS: {
        bull: {
            id: 'bull',
            name: 'The Bull',
            sprite: 'bull',
            tagline: 'You are a bull. The bear market is endless.'
        }
    },
    BOSSES: {
        a: {
            id: 'rug_lord',
            name: 'Rug Lord',
            sprite: 'rug_lord',
            tagline: 'He is pulling everything.'
        },
        b: {
            id: 'capitulation',
            name: 'Capitulation',
            sprite: 'capitulation',
            tagline: 'The biggest red candle you have ever seen.'
        },
        c: {
            id: 'liquidation',
            name: 'Liquidation',
            sprite: 'liquidation',
            tagline: 'Your position is being closed.'
        },
        d: {
            id: 'bear_market',
            name: 'The Bear Market',
            sprite: 'bear_market',
            tagline: 'Survive this and the cycle turns.'
        },
        e: {
            id: 'long_winter',
            name: 'The Long Winter',
            sprite: 'long_winter',
            tagline: 'Crypto winter has a face.'
        }
    },
    ENEMIES: {
        a: {
            id: 'red_candle',
            name: 'Red Candle',
            sprite: 'red_candle',
            description: 'Down only.'
        },
        b: {
            id: 'bag_holder',
            name: 'Bag Holder',
            sprite: 'bag_holder',
            description: 'Still holding.'
        },
        c: {
            id: 'paper_hands',
            name: 'Paper Hands',
            sprite: 'paper_hands',
            description: 'Sold the bottom.'
        },
        d: {
            id: 'rug_puller',
            name: 'Rug Puller',
            sprite: 'rug_puller',
            description: 'Dashes in. Takes the rug.'
        },
        e: {
            id: 'grizzly',
            name: 'Grizzly',
            sprite: 'grizzly',
            description: 'Armoured, slow, hurts.'
        },
        f: {
            id: 'fud_cloud',
            name: 'FUD Cloud',
            sprite: 'fud_cloud',
            description: 'Fast and loud.'
        }
    }
};

const $ = (s) => document.querySelector(s);
const text = (v) => (typeof v === 'string' ? v : '');

function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props)
        for (const [k, v] of Object.entries(props))
            if (v !== null && v !== undefined) el.setAttribute(k, String(v));
    for (const k of kids.flat())
        if (k !== null && k !== undefined && k !== '') el.append(k instanceof Node ? k : String(k));
    return el;
}

function card(d, kind) {
    const sprite = /^[a-z0-9_]{2,40}$/.test(d.sprite || '') ? d.sprite : null;
    return h(
        'li',
        { class: `cast-c cast-${kind}${d.mini ? ' mini' : ''}` },
        h(
            'div',
            { class: 'cast-art' },
            sprite
                ? h('canvas', {
                      'data-sprite': sprite,
                      'data-scale': kind === 'boss' ? 3 : 4,
                      'data-anim': '',
                      'aria-hidden': 'true'
                  })
                : null
        ),
        h('h3', null, text(d.name) || d.id),
        d.mini ? h('span', { class: 'cast-tag' }, 'mini-boss') : null,
        text(d.tagline) ? h('p', { class: 'cast-line' }, d.tagline) : null,
        text(d.description) ? h('p', { class: 'cast-desc' }, d.description) : null,
        text(d.tip) ? h('p', { class: 'cast-tip' }, h('b', null, 'Tip '), d.tip) : null
    );
}

async function boot() {
    let content = null;
    let n = null;
    try {
        const r = await fetch('/api/stats', { headers: { accept: 'application/json' } });
        const s = r.ok ? await r.json() : null;
        const path = s && s.liveBuild && s.liveBuild.path;
        if (typeof path === 'string' && /^\/b\/\d+\/$/.test(path)) {
            content = await import(`${path}src/sim/content.js`);
            n = s.liveBuild.n;
        }
    } catch {
        content = null;
    }
    const c = content && content.ENEMIES && content.BOSSES ? content : FALLBACK;
    const heroes = Object.values(c.CHARACTERS || FALLBACK.CHARACTERS);
    const bosses = Object.values(c.BOSSES);
    const mobs = Object.values(c.ENEMIES);
    $('#heroes').append(...heroes.map((d) => card(d, 'hero')));
    $('#bossList').append(...bosses.map((d) => card(d, 'boss')));
    $('#mobList').append(...mobs.map((d) => card(d, 'mob')));
    if (n !== null)
        $('#bearsSub').textContent =
            `Everything that wants your bull liquidated: ${bosses.length} bosses and ${mobs.length} bears, read straight from the code of Build #${n}, the live one. The AI draws every one of them in code, and it keeps adding more.`;
    import('/art.js').catch(() => {});
}

boot();
