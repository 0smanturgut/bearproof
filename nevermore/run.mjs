#!/usr/bin/env node
/**
 * Placeholder for CrowLab Muninn's Nevermore runner, until the real one is delivered here.
 *
 *   node nevermore/run.mjs [--dir nevermore/tests] [--game game]
 *
 * It runs no test. With no test file in --dir it says so and passes; with any test file it fails, because a
 * test that can't be run must never count as passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dir = path.resolve(opt('--dir', path.join(here, 'tests')));

const tests = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
if (tests.length) {
    console.error(`nevermore: ${tests.length} test file(s) in ${dir}, but the runner is pending`);
    process.exit(1);
}
console.log('nevermore: 0 tests (runner pending)');
