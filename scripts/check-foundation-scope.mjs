// Lists SQL in src/ that touches a foundation's data without naming foundation_id, so each one
// can be checked by hand. A statement that is safe without it (e.g. it reads the signed-in user's
// own row by id, or a child row reached through an already-scoped parent) carries the marker
// `scope-ok:` in a comment on the line above, with the reason. Exit code 1 when anything is unmarked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCOPED = [
  'users', 'subscribers', 'programs', 'subscriber_programs', 'transactions', 'prescriptions',
  'monthly_closings', 'audit_log', 'expenses', 'expense_files', 'stats_totals', 'stats_daily',
  'stats_monthly', 'delegate_period', 'families', 'family_members', 'family_payments', 'family_visits',
  'patients', 'patient_aids', 'help_requests',
];
const tableRe = new RegExp(`\\b(FROM|INTO|UPDATE|JOIN)\\s+(${SCOPED.join('|')})\\b`, 'i');

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.ts')) files.push(path);
  }
};
walk('src');

let problems = 0;
for (const file of files) {
  if (file.endsWith('jobs.ts')) continue; // cron: works across all foundations on purpose
  const text = readFileSync(file, 'utf8');
  // String and template literals, with their starting line.
  const re = /(`[^`]*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  for (let m; (m = re.exec(text));) {
    const sql = m[0];
    if (!tableRe.test(sql) || !/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue;
    if (/foundation_id/.test(sql)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    const before = text.split('\n').slice(Math.max(0, line - 4), line).join('\n');
    if (/scope-ok:/.test(before)) continue;
    problems += 1;
    console.log(`${file}:${line}  ${sql.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
}
console.log(problems ? `\n${problems} statement(s) without foundation_id` : 'All foundation data is scoped.');
process.exit(problems ? 1 : 0);
