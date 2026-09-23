import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGamepadDeadzone, joystickVector } from '../src/input.js';
import { cleanName } from '../src/prefs.js';
import { shareText } from '../src/share.js';
import { fmtNum, fmtTime } from '../src/format.js';

test('joystick: deadzone, direction and full-speed clamp', () => {
    assert.deepEqual(joystickVector(0, 0), { x: 0, y: 0 });
    assert.deepEqual(joystickVector(3, 0), { x: 0, y: 0 }, 'inside the deadzone');
    const full = joystickVector(500, 0);
    assert.equal(full.x, 1);
    assert.equal(full.y, 0);
    const diag = joystickVector(40, 40);
    assert.ok(diag.x > 0 && Math.abs(diag.x - diag.y) < 1e-12);
    assert.ok(Math.hypot(diag.x, diag.y) <= 1 + 1e-12);
});

test('gamepad deadzone remaps the live band', () => {
    assert.equal(applyGamepadDeadzone(0.1), 0);
    assert.equal(applyGamepadDeadzone(1), 1);
    assert.equal(applyGamepadDeadzone(-1), -1);
    assert.equal(applyGamepadDeadzone(NaN), 0);
});

test('names are cleaned like the server does', () => {
    assert.equal(cleanName('  Bull <script>  '), 'Bull script');
    assert.equal(cleanName('a'.repeat(30)).length, 16);
    assert.equal(cleanName(null), '');
});

test('share text is short, specific and links the challenge', () => {
    const summary = { score: 12480, kills: 812, level: 14, timeMs: 252000, won: false };
    const { text, url } = shareText({
        summary,
        mode: 'daily',
        date: '2026-09-24',
        build: 3,
        origin: 'https://x.test'
    });
    assert.match(text, /BEARPROOF · Daily 2026-09-24/);
    assert.match(text, /survived 04:12 of the bear market/);
    assert.match(text, /Score 12,480 · 812 bears · Lv 14/);
    assert.match(text, /Build #3/);
    assert.equal(url, 'https://x.test/play?challenge=2026-09-24');
    const win = shareText({
        summary: { ...summary, won: true },
        mode: 'free',
        build: 3,
        origin: 'https://x.test'
    });
    assert.match(win.text, /ended the bear market in 04:12/);
    assert.equal(win.url, 'https://x.test/play');
    assert.equal(fmtTime(61999), '01:01');
    assert.equal(fmtNum(1234567), '1,234,567');
});
