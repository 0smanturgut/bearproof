/**
 * @module nevermore/load
 * @description Node-side loading: the game's own simulation modules (by path, from the CURRENT build) and the
 * spec files of a test directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSpec } from './spec.mjs';

async function optional(file) {
    if (!fs.existsSync(file)) return null;
    return import(pathToFileURL(file).href);
}

/**
 * Import `<gameDir>/src/sim/{sim,content,bot,runlog,input-codes}.js`. Only sim.js is required.
 * @param {string} gameDir
 */
export async function loadGame(gameDir) {
    const dir = path.resolve(gameDir, 'src/sim');
    const simFile = path.join(dir, 'sim.js');
    if (!fs.existsSync(simFile)) throw new Error(`no simulation at ${simFile}`);
    const sim = await import(pathToFileURL(simFile).href);
    const [content, bot, runlog, inputCodes] = await Promise.all([
        optional(path.join(dir, 'content.js')),
        optional(path.join(dir, 'bot.js')),
        optional(path.join(dir, 'runlog.js')),
        optional(path.join(dir, 'input-codes.js'))
    ]);
    return {
        dir,
        Simulation: sim.Simulation,
        SIM_VERSION: sim.SIM_VERSION ?? null,
        createBot: bot?.createBot ?? null,
        content,
        runlog,
        inputCodes
    };
}

/**
 * Read every `*.json` spec in a directory (sorted by name). Invalid files are returned as `{ file, error }` so the
 * runner can count them as failures instead of silently skipping them.
 */
export function loadSpecDir(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => {
            const file = path.join(dir, f);
            try {
                return { file: f, spec: parseSpec(fs.readFileSync(file, 'utf8'), f) };
            } catch (e) {
                return { file: f, error: String(e.message).slice(0, 400) };
            }
        });
}
