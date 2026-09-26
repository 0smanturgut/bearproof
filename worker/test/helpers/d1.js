/**
 * Test doubles for the Worker's bindings: D1 on node:sqlite with every migration applied (so the real SQL runs),
 * and an in-memory KV.
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

export function fakeD1() {
    const db = new DatabaseSync(':memory:');
    for (const f of fs.readdirSync(MIGRATIONS).sort())
        if (f.endsWith('.sql')) db.exec(fs.readFileSync(new URL(f, MIGRATIONS), 'utf8'));
    return {
        db,
        prepare(sql) {
            let args = [];
            const stmt = () => db.prepare(sql);
            return {
                bind(...a) {
                    args = a.map((v) => (typeof v === 'boolean' ? Number(v) : v));
                    return this;
                },
                async first() {
                    return stmt().get(...args) ?? null;
                },
                async all() {
                    return { results: stmt().all(...args) };
                },
                async run() {
                    const r = stmt().run(...args);
                    return { meta: { changes: Number(r.changes) } };
                }
            };
        }
    };
}

export function fakeKV(init = {}) {
    const map = new Map(Object.entries(init));
    return {
        map,
        get: async (k) => (map.has(k) ? map.get(k) : null),
        put: async (k, v) => void map.set(k, String(v))
    };
}
