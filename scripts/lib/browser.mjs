// Launch a Playwright browser. In CI the matching revision is installed with `npx playwright install`.
// Locally, fall back to the newest already-installed revision so a Playwright bump doesn't force a download.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const CACHE =
    process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright');

function newestInstalled(prefix, rel) {
    if (!fs.existsSync(CACHE)) return null;
    const dirs = fs
        .readdirSync(CACHE)
        .filter((d) => d.startsWith(prefix + '-'))
        .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
    for (const d of dirs) {
        const exe = path.join(CACHE, d, rel);
        if (fs.existsSync(exe)) return exe;
    }
    return null;
}

export async function launch(kind = 'chromium', opts = {}) {
    const type = kind === 'webkit' ? webkit : chromium;
    try {
        return await type.launch(opts);
    } catch (err) {
        if (kind !== 'chromium') throw err;
        const exe = newestInstalled(
            'chromium_headless_shell',
            'chrome-headless-shell-mac-arm64/chrome-headless-shell'
        );
        if (!exe) throw err;
        return type.launch({ ...opts, executablePath: exe });
    }
}
