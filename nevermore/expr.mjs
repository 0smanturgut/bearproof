/**
 * @module nevermore/expr
 * @description A tiny, safe expression language for Nevermore invariants. Tokenizer + Pratt parser + tree-walking
 * evaluator. There is no `eval`, no `Function`, no property access outside plain own data fields, no assignment,
 * no loops, and every evaluation runs under an operation budget.
 *
 *   const inv = compile('player.hp <= player.maxHp && isFinite(player.x)');
 *   inv.evaluate({ player: { hp: 10, maxHp: 100, x: 3 } }); // → true
 *
 * Grammar (lowest precedence first):
 *   expr    := or
 *   or      := and ( '||' and )*
 *   and     := cmp ( '&&' cmp )*
 *   cmp     := sum ( ( '<' | '<=' | '>' | '>=' | '==' | '!=' ) sum )?
 *   sum     := prod ( ( '+' | '-' ) prod )*
 *   prod    := unary ( ( '*' | '/' | '%' ) unary )*
 *   unary   := ( '!' | '-' ) unary | primary
 *   primary := number | string | 'true' | 'false' | 'null' | path | call | '(' expr ')'
 *   path    := name ( '.' name )*                     e.g. player.hp, prev.stats.score, it.boss
 *   call    := fname '(' args ')'
 *
 * Functions: isFinite(x) abs(x) min(a, …) max(a, …) floor(x) ceil(x) round(x) sqrt(x) hypot(x, y) len(list)
 * and the list forms count(list, pred) any(list, pred) all(list, pred), where `pred` is evaluated once per
 * item with the item bound to `it`.
 *
 * Semantics: a missing field is `null`. Arithmetic on a non-number gives NaN (so `isFinite` catches it).
 * Comparisons with null are false except `== null` / `!= null`. `&&`, `||` short-circuit and return booleans.
 */

export const LIMITS = Object.freeze({
    maxSource: 2000,
    maxTokens: 400,
    maxDepth: 48,
    maxString: 200,
    maxPathSegments: 8,
    maxOps: 2000000
});

const FORBIDDEN_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const KEYWORDS = new Set(['true', 'false', 'null']);

const FUNCS = {
    isFinite: { n: [1, 1], f: (x) => typeof x === 'number' && Number.isFinite(x) },
    abs: { n: [1, 1], f: (x) => Math.abs(num(x)) },
    min: { n: [1, 16], f: (...xs) => Math.min(...xs.map(num)) },
    max: { n: [1, 16], f: (...xs) => Math.max(...xs.map(num)) },
    floor: { n: [1, 1], f: (x) => Math.floor(num(x)) },
    ceil: { n: [1, 1], f: (x) => Math.ceil(num(x)) },
    round: { n: [1, 1], f: (x) => Math.round(num(x)) },
    sqrt: { n: [1, 1], f: (x) => Math.sqrt(num(x)) },
    hypot: { n: [2, 2], f: (x, y) => Math.hypot(num(x), num(y)) },
    len: { n: [1, 1], f: (x) => (Array.isArray(x) ? x.length : null) }
};
const LIST_FUNCS = new Set(['count', 'any', 'all']);

export class ExprError extends Error {
    constructor(message, pos = -1) {
        super(pos >= 0 ? `${message} (at ${pos})` : message);
        this.name = 'ExprError';
        this.pos = pos;
    }
}

function num(x) {
    return typeof x === 'number' ? x : NaN;
}

// --- tokenizer -----------------------------------------------------------------

const PUNCT = [
    '<=',
    '>=',
    '==',
    '!=',
    '&&',
    '||',
    '<',
    '>',
    '!',
    '+',
    '-',
    '*',
    '/',
    '%',
    '(',
    ')',
    ',',
    '.'
];

/** Split source into tokens `{ t: 'num'|'str'|'name'|'op'|'end', v, pos }`. */
export function tokenize(src) {
    if (typeof src !== 'string') throw new ExprError('expression must be a string');
    if (src.length > LIMITS.maxSource)
        throw new ExprError(`expression longer than ${LIMITS.maxSource}`);
    const out = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            i++;
            continue;
        }
        if (out.length >= LIMITS.maxTokens) throw new ExprError('too many tokens', i);
        const start = i;
        if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
            const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
            const v = Number(m[0]);
            if (!Number.isFinite(v)) throw new ExprError('number out of range', i);
            i += m[0].length;
            if (/[A-Za-z_]/.test(src[i] || '')) throw new ExprError('bad number', start);
            out.push({ t: 'num', v, pos: start });
            continue;
        }
        if (c === "'" || c === '"') {
            let s = '';
            i++;
            for (;;) {
                if (i >= src.length) throw new ExprError('unterminated string', start);
                const d = src[i];
                if (d === c) {
                    i++;
                    break;
                }
                if (d === '\\') {
                    const e = src[i + 1];
                    if (e !== '\\' && e !== "'" && e !== '"') throw new ExprError('bad escape', i);
                    s += e;
                    i += 2;
                    continue;
                }
                const code = d.charCodeAt(0);
                if (code < 0x20 || code > 0x7e)
                    throw new ExprError('only printable ASCII in strings', i);
                s += d;
                i++;
                if (s.length > LIMITS.maxString) throw new ExprError('string too long', start);
            }
            out.push({ t: 'str', v: s, pos: start });
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
            if (m[0].length > 64) throw new ExprError('name too long', i);
            if (FORBIDDEN_NAMES.has(m[0])) throw new ExprError(`forbidden name '${m[0]}'`, i);
            out.push({ t: 'name', v: m[0], pos: start });
            i += m[0].length;
            continue;
        }
        const op = PUNCT.find((p) => src.startsWith(p, i));
        if (!op) throw new ExprError(`unexpected character '${printable(c)}'`, i);
        out.push({ t: 'op', v: op, pos: start });
        i += op.length;
    }
    out.push({ t: 'end', v: null, pos: src.length });
    return out;
}

function printable(c) {
    const code = c.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e ? c : `\\u${code.toString(16).padStart(4, '0')}`;
}

// --- parser --------------------------------------------------------------------

const BINARY = {
    '||': 1,
    '&&': 2,
    '==': 3,
    '!=': 3,
    '<': 3,
    '<=': 3,
    '>': 3,
    '>=': 3,
    '+': 4,
    '-': 4,
    '*': 5,
    '/': 5,
    '%': 5
};

/** Parse source into an AST. Throws ExprError on anything outside the grammar. */
export function parse(src) {
    const toks = tokenize(src);
    let k = 0;
    const peek = () => toks[k];
    const next = () => toks[k++];
    const expectOp = (v) => {
        const t = next();
        if (t.t !== 'op' || t.v !== v) throw new ExprError(`expected '${v}'`, t.pos);
    };

    function expr(minPrec, depth) {
        if (depth > LIMITS.maxDepth)
            throw new ExprError('expression nested too deeply', peek().pos);
        let left = unary(depth + 1);
        for (;;) {
            const t = peek();
            if (t.t !== 'op' || !(t.v in BINARY)) break;
            const prec = BINARY[t.v];
            if (prec < minPrec) break;
            next();
            const right = expr(prec + 1, depth + 1);
            if (prec === 3 && left.k === 'bin' && BINARY[left.op] === 3)
                throw new ExprError('chained comparison; use && between comparisons', t.pos);
            left = { k: 'bin', op: t.v, l: left, r: right };
        }
        return left;
    }

    function unary(depth) {
        if (depth > LIMITS.maxDepth)
            throw new ExprError('expression nested too deeply', peek().pos);
        const t = peek();
        if (t.t === 'op' && (t.v === '!' || t.v === '-')) {
            next();
            return { k: 'un', op: t.v, e: unary(depth + 1) };
        }
        return primary(depth);
    }

    function primary(depth) {
        const t = next();
        if (t.t === 'num') return { k: 'lit', v: t.v };
        if (t.t === 'str') return { k: 'lit', v: t.v };
        if (t.t === 'op' && t.v === '(') {
            const e = expr(0, depth + 1);
            expectOp(')');
            return e;
        }
        if (t.t === 'name') {
            if (KEYWORDS.has(t.v)) return { k: 'lit', v: t.v === 'null' ? null : t.v === 'true' };
            const after = peek();
            if (after.t === 'op' && after.v === '(') {
                next();
                return call(t, depth);
            }
            const path = [t.v];
            while (peek().t === 'op' && peek().v === '.') {
                next();
                const seg = next();
                if (seg.t !== 'name' || KEYWORDS.has(seg.v))
                    throw new ExprError('expected a field name after "."', seg.pos);
                path.push(seg.v);
                if (path.length > LIMITS.maxPathSegments)
                    throw new ExprError('field path too long', seg.pos);
            }
            return { k: 'path', path };
        }
        throw new ExprError(
            t.t === 'end' ? 'unexpected end of expression' : `unexpected '${t.v}'`,
            t.pos
        );
    }

    function call(nameTok, depth) {
        const name = nameTok.v;
        const args = [];
        if (!(peek().t === 'op' && peek().v === ')')) {
            for (;;) {
                args.push(expr(0, depth + 1));
                if (peek().t === 'op' && peek().v === ',') {
                    next();
                    continue;
                }
                break;
            }
        }
        expectOp(')');
        if (LIST_FUNCS.has(name)) {
            if (args.length !== 2)
                throw new ExprError(`${name}(list, predicate) takes 2 arguments`, nameTok.pos);
            if (args[0].k !== 'path')
                throw new ExprError(`${name}: first argument must be a field path`, nameTok.pos);
            return { k: 'list', fn: name, list: args[0], pred: args[1] };
        }
        const def = Object.prototype.hasOwnProperty.call(FUNCS, name) ? FUNCS[name] : null;
        if (!def) throw new ExprError(`unknown function '${name}'`, nameTok.pos);
        if (args.length < def.n[0] || args.length > def.n[1])
            throw new ExprError(`${name}: wrong number of arguments`, nameTok.pos);
        return { k: 'call', fn: name, args };
    }

    const ast = expr(0, 0);
    if (peek().t !== 'end') throw new ExprError(`unexpected '${peek().v}'`, peek().pos);
    return ast;
}

// --- evaluator -----------------------------------------------------------------

function own(obj, key) {
    if (obj === null || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
        if (key === 'length') return obj.length;
        return null;
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) return null; // plain data only
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return null;
    const v = obj[key];
    if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') return null;
    return v === undefined ? null : v;
}

function cmp(op, a, b) {
    if (op === '==') return a === b;
    if (op === '!=') return a !== b;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b || (typeof a !== 'number' && typeof a !== 'string')) return false;
    if (op === '<') return a < b;
    if (op === '<=') return a <= b;
    if (op === '>') return a > b;
    return a >= b;
}

function truthy(v) {
    return (
        v === true ||
        (typeof v === 'number' && v !== 0 && !Number.isNaN(v)) ||
        (typeof v === 'string' && v !== '')
    );
}

/** Evaluate an AST against a plain-data context. */
export function evaluate(ast, ctx, { maxOps = LIMITS.maxOps } = {}) {
    let ops = 0;
    const tick = () => {
        if (++ops > maxOps) throw new ExprError('evaluation budget exceeded');
    };
    function ev(n, scope) {
        tick();
        switch (n.k) {
            case 'lit':
                return n.v;
            case 'path': {
                let v =
                    n.path[0] === 'it' && scope.it !== undefined
                        ? scope.it
                        : own(scope.root, n.path[0]);
                for (let i = 1; i < n.path.length; i++) v = own(v, n.path[i]);
                return v;
            }
            case 'un': {
                const v = ev(n.e, scope);
                return n.op === '!' ? !truthy(v) : -num(v);
            }
            case 'bin': {
                if (n.op === '&&') return truthy(ev(n.l, scope)) && truthy(ev(n.r, scope));
                if (n.op === '||') return truthy(ev(n.l, scope)) || truthy(ev(n.r, scope));
                const a = ev(n.l, scope);
                const b = ev(n.r, scope);
                switch (n.op) {
                    case '+':
                        return num(a) + num(b);
                    case '-':
                        return num(a) - num(b);
                    case '*':
                        return num(a) * num(b);
                    case '/':
                        return num(a) / num(b);
                    case '%':
                        return num(a) % num(b);
                    default:
                        return cmp(n.op, a, b);
                }
            }
            case 'call':
                return FUNCS[n.fn].f(...n.args.map((a) => ev(a, scope)));
            case 'list': {
                const list = ev(n.list, scope);
                if (!Array.isArray(list)) return n.fn === 'count' ? null : false;
                let c = 0;
                for (const item of list) {
                    const ok = truthy(ev(n.pred, { root: scope.root, it: item }));
                    if (n.fn === 'any' && ok) return true;
                    if (n.fn === 'all' && !ok) return false;
                    if (ok) c++;
                }
                return n.fn === 'count' ? c : n.fn === 'all';
            }
            default:
                throw new ExprError('bad node');
        }
    }
    return ev(ast, { root: ctx, it: undefined });
}

/** Parse once, evaluate many times. `uses` lists the root names and whether list functions appear. */
export function compile(src) {
    const ast = parse(src);
    const roots = new Set();
    let lists = false;
    const walk = (n) => {
        if (n.k === 'path') roots.add(n.path[0]);
        else if (n.k === 'un') walk(n.e);
        else if (n.k === 'bin') {
            walk(n.l);
            walk(n.r);
        } else if (n.k === 'call') n.args.forEach(walk);
        else if (n.k === 'list') {
            lists = true;
            walk(n.list);
            walk(n.pred);
        }
    };
    walk(ast);
    return {
        source: src,
        ast,
        roots: [...roots],
        usesLists: lists,
        usesPrev: roots.has('prev'),
        evaluate: (ctx, opts) => evaluate(ast, ctx, opts),
        test: (ctx, opts) => truthy(evaluate(ast, ctx, opts))
    };
}

export { truthy };
