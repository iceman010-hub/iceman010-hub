// node --test scripts/   (no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, shortTitle, parseChanges, render, replaceSection } from './update-now.mjs';

test('short titles stop at the first detail and drop markdown', () => {
  assert.equal(shortTitle('Syncthing 2.1.7 between the workstation and bot-core: one folder, **allow-list**'), 'Syncthing 2.1.7 between the workstation and bot-core');
  assert.equal(shortTitle('`ops-bot` **enabled and started**: bot token in `~/.config`'), 'ops-bot enabled and started');
  assert.equal(shortTitle('**Temporary:** USB Wi-Fi adapter (RTL88x2BU) passed through'), 'USB Wi-Fi adapter');
  assert.ok(shortTitle('word '.repeat(40)).length <= 71);
});

test('scan blocks private-looking data', () => {
  for (const s of ['host 192.168.100.11', 'aa:bb:cc:dd:ee:ff', 'me@proton.me', 'ghp_abcdefghijklmnop', 'ssh from claude-pc', 'TTI site', 'set <MGMT-IP>', 'Techni-Tool rollout'])
    assert.ok(scan(s).length > 0, s);
  for (const s of ['2026-11-19 Syncthing 2.1.7 between the workstation and bot-core', 'ops-bot enabled and started', 'BIOS 1.5.2 → 1.27.0'])
    assert.deepEqual(scan(s), [], s);
});

test('parse newest first and render into the markers', () => {
  const md = '| C-009 | 2026-11-17 | Installed X | why |\n| C-010 | 2026-11-18 | Wiped Y: details | why |\n| # | Date |';
  const items = parseChanges(md);
  assert.deepEqual(items.map((i) => i.id), ['C-010', 'C-009']);
  const out = replaceSection('top\n<!--NOW:START-->\nold\n<!--NOW:END-->\nbottom', render(items));
  assert.match(out, /^top\n<!--NOW:START-->\n- 🔧 \*\*2026-11-18\*\* · Wiped Y\n/);
  assert.match(out, /<!--NOW:END-->\nbottom$/);
});
