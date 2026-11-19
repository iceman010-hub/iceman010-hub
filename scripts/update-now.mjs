#!/usr/bin/env node
// update-now.mjs - fills the "Now building" section of README.md from the newest rows of the
// private homelab change log (docs/changes.md). Run by .github/workflows/now.yml every 6 hours.
//
// Safety: only the date and a short title of each change are published, and every title is
// scanned for private-looking data (IPs, MACs, emails, tokens, names). One hit = nothing is
// written and the run fails, so a bad row can never reach the public profile.
//
//   NOW_TOKEN=<read-only token> node scripts/update-now.mjs          update README.md
//   NOW_TOKEN=<read-only token> node scripts/update-now.mjs --dry    print, change nothing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = { repo: 'iceman010-hub/homelab-copilot-node', file: 'docs/changes.md' };
const SHOW = 3;
const MAX_TITLE = 70;
const START = '<!--NOW:START-->';
const END = '<!--NOW:END-->';

// Anything that looks private blocks the update. Keep this list strict; a false alarm only
// means the section waits until the row is reworded.
const BLOCK = [
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'IP address'],
  [/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i, 'MAC address'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'email address'],
  [/\b(?:ghp_|gho_|ghs_|github_pat_|sk-|xox[bp]-|AKIA)[\w-]{6,}/, 'token'],
  [/\b[A-Za-z0-9+/_-]{32,}\b/, 'long secret-like string'],
  [/claude-pc|valencia|proton|techni[- ]?tool|\bTTI\b|ssid/i, 'private name'],
  [/<[A-Z][A-Z0-9_-]*>/, 'placeholder (should not be published)'],
];

/** Problems found in a title; empty means it's safe to publish. */
export function scan(text) {
  return BLOCK.filter(([re]) => re.test(text)).map(([, why]) => why);
}

/** Plain-text short title from a change-log "Change" cell. */
export function shortTitle(cell) {
  let t = cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](link) -> text
    .replace(/[*`_]/g, '')                       // bold, code, italics
    .replace(/^\s*Temporary:\s*/i, '')
    .trim();
  t = t.split(/:\s|;|\s\(/)[0].trim();          // stop at the first detail
  if (t.length > MAX_TITLE) t = t.slice(0, MAX_TITLE).replace(/\s+\S*$/, '') + '…';
  return t;
}

/** Newest-first [{id, date, title}] from the change-log markdown. */
export function parseChanges(md) {
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(C-\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|/);
    if (m) rows.push({ id: m[1], date: m[2], title: shortTitle(m[3]) });
  }
  return rows.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
}

export function render(items) {
  const lines = items.map((i) => `- 🔧 **${i.date}** · ${i.title}`);
  return `${START}\n${lines.join('\n')}\n${END}`;
}

export function replaceSection(readme, block) {
  const a = readme.indexOf(START), b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error('README markers not found');
  return readme.slice(0, a) + block + readme.slice(b + END.length);
}

async function fetchChanges(token) {
  const url = `https://api.github.com/repos/${SOURCE.repo}/contents/${SOURCE.file}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'profile-now-updater' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} reading the change log`);
  return res.text();
}

async function main() {
  const dry = process.argv.includes('--dry');
  const token = process.env.NOW_TOKEN;
  if (!token) throw new Error('NOW_TOKEN is not set');
  const items = parseChanges(await fetchChanges(token)).slice(0, SHOW);
  if (!items.length) throw new Error('no change-log rows found');

  const bad = items.flatMap((i) => scan(`${i.date} ${i.title}`).map((why) => `${i.id}: ${why}`));
  if (bad.length) {
    // Don't print the title itself: the log of a public repo's workflow is public too.
    console.error(`Blocked, nothing published. Reword these change-log rows:\n  ${bad.join('\n  ')}`);
    process.exit(2);
  }
  const block = render(items);
  if (dry) { console.log(block); return; }
  const readmePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
  const before = fs.readFileSync(readmePath, 'utf8');
  const after = replaceSection(before, block);
  if (after === before) { console.log('No change.'); return; }
  fs.writeFileSync(readmePath, after);
  console.log(`Updated with ${items.length} item(s): ${items.map((i) => i.id).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
