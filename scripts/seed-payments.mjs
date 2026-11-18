// Local-only demo payments so the register and chart have something to show.
// Run after seed:dev. Sets a monthly fee for everyone and adds a varied 2026 pattern.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const FEE = 5000;
const YEAR = new Date().getUTCFullYear();
const LAST_MONTH = new Date().getUTCMonth() + 1;
const RANGE = 3000;

const lines = [`UPDATE subscribers SET monthly_fee = ${FEE} WHERE monthly_fee = 0;`];
for (let month = 1; month <= LAST_MONTH; month++) {
  const period = `${YEAR}-${String(month).padStart(2, '0')}`;
  const skipEvery = 3 + ((month * 5) % 7);
  lines.push(`INSERT OR IGNORE INTO transactions (type, amount, month, tx_date, subscriber_id, party_name, delegate_id, period, created_by)
SELECT 'delegate_receipt', ${FEE}, '${period}', '${period}-10', id, full_name, delegate_id, '${period}', 1
FROM subscribers
WHERE id > (SELECT MAX(id) FROM subscribers) - ${RANGE} AND status = 'alive' AND deleted_at IS NULL AND id % ${skipEvery} <> 0;`);
}

mkdirSync('scripts/out', { recursive: true });
writeFileSync('scripts/out/payments.sql', lines.join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--file', 'scripts/out/payments.sql'], { stdio: 'inherit', shell: true });
