import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, fid } from '../lib/db';
import { fail, zDate } from '../lib/http';

// سجل المساعدات: everything this foundation gave to people, read from where each kind of aid is
// recorded — the needy families' payments, the patients' aid, the money ledger's aid entries for a
// named beneficiary, the aid given to subscribers, and the help requests marked delivered. Nothing is
// entered here; each page keeps recording its own aid. One date range at a time (a year at most).
export const aid = new Hono<AppEnv>();
aid.use('*', requireRole('admin'));

// The money ledger headings that are aid to a person (not the foundation's own costs or salaries).
const AID_CATEGORIES = [
  'cash_gift', 'medicine', 'patient_aid', 'building_aid', 'operation_aid', 'marriage_aid', 'food',
  'general_aid', 'cattle', 'appliances', 'prayer_fasting', 'religious_events', 'appliance_repair', 'other_aid',
];
const TX_LABEL: Record<string, string> = { general_aid: 'مساعدة عامة', monthly_aid: 'مساعدة شهرية', program_aid: 'مساعدة برنامج' };
const LIMIT = 3000;

export type AidSource = 'families' | 'patients' | 'expenses' | 'subscribers' | 'requests';
interface AidRow {
  source: AidSource;
  id: number;
  date: string;
  person: string;
  what: string;
  amount: number | null;
  detail: string | null;
  ref: number | null;
}

aid.get('/register', async (c) => {
  const query = z.object({ from: zDate, to: zDate }).safeParse({ from: c.req.query('from'), to: c.req.query('to') });
  if (!query.success) fail(400, 'المدة غير صحيحة');
  const { from, to } = query.data;
  if (from > to) fail(400, 'بداية المدة بعد نهايتها');
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) fail(400, 'اختر مدة سنة أو أقل');
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const marks = AID_CATEGORIES.map(() => '?').join(', ');

  const [families, patients, expenses, subscribers, requests] = await Promise.all([
    all<{ id: number; paid_on: string; amount: number; type: string; name: string; head_name: string; family_id: number; paid_by: string | null }>(c,
      `SELECT p.id, p.paid_on, p.amount, p.type, f.name, f.head_name, p.family_id, p.paid_by
       FROM family_payments p JOIN families f ON f.id = p.family_id AND f.foundation_id = p.foundation_id
       WHERE p.foundation_id = ? AND p.month BETWEEN ? AND ? AND p.paid_on BETWEEN ? AND ? AND p.deleted_at IS NULL
       ORDER BY p.paid_on DESC, p.id DESC LIMIT ${LIMIT}`, fid(c), fromMonth, toMonth, from, to),
    all<{ id: number; given_on: string; cash: number; medicine: number; exams: number; name: string; patient_id: number; doctor: string | null; note: string | null }>(c,
      `SELECT a.id, a.given_on, a.cash, a.medicine, a.exams, p.name, a.patient_id, a.doctor, a.note
       FROM patient_aids a JOIN patients p ON p.id = a.patient_id AND p.foundation_id = a.foundation_id
       WHERE a.foundation_id = ? AND a.given_on BETWEEN ? AND ? AND a.deleted_at IS NULL
       ORDER BY a.given_on DESC, a.id DESC LIMIT ${LIMIT}`, fid(c), from, to),
    all<{ id: number; spent_on: string; amount: number; category: string; beneficiary_name: string | null; details: string | null }>(c,
      `SELECT id, spent_on, amount, category, beneficiary_name, details FROM expenses
       WHERE foundation_id = ? AND month BETWEEN ? AND ? AND spent_on BETWEEN ? AND ? AND deleted_at IS NULL
         AND category IN (${marks})
       ORDER BY spent_on DESC, id DESC LIMIT ${LIMIT}`, fid(c), fromMonth, toMonth, from, to, ...AID_CATEGORIES),
    all<{ id: number; tx_date: string; amount: number; type: string; party_name: string; subscriber_id: number | null; note: string | null }>(c,
      `SELECT id, tx_date, amount, type, party_name, subscriber_id, note FROM transactions
       WHERE foundation_id = ? AND type IN ('general_aid', 'monthly_aid', 'program_aid') AND month BETWEEN ? AND ?
         AND tx_date BETWEEN ? AND ? AND deleted_at IS NULL
       ORDER BY tx_date DESC, id DESC LIMIT ${LIMIT}`, fid(c), fromMonth, toMonth, from, to),
    all<{ id: number; delivered_at: string; title: string; name: string; delivered_note: string | null }>(c,
      `SELECT id, delivered_at, title, name, delivered_note FROM help_requests
       WHERE foundation_id = ? AND status = 'delivered' AND delivered_at IS NOT NULL
         AND substr(delivered_at, 1, 10) BETWEEN ? AND ? AND deleted_at IS NULL
       ORDER BY delivered_at DESC, id DESC LIMIT ${LIMIT}`, fid(c), from, to),
  ]);

  const parts = (row: { cash: number; medicine: number; exams: number }) => [
    row.cash ? 'مبلغ نقدي' : '', row.medicine ? 'أدوية' : '', row.exams ? 'فحوصات' : '',
  ].filter(Boolean).join(' · ');
  const items: AidRow[] = [
    ...families.map((r): AidRow => ({ source: 'families', id: r.id, date: r.paid_on, person: r.head_name || r.name, what: r.type, amount: r.amount, detail: r.paid_by, ref: r.family_id })),
    ...patients.map((r): AidRow => ({ source: 'patients', id: r.id, date: r.given_on, person: r.name, what: parts(r) || 'مساعدة مريض', amount: r.cash + r.medicine + r.exams, detail: r.doctor ?? r.note, ref: r.patient_id })),
    ...expenses.map((r): AidRow => ({ source: 'expenses', id: r.id, date: r.spent_on, person: r.beneficiary_name ?? '', what: r.category, amount: r.amount, detail: r.details, ref: null })),
    ...subscribers.map((r): AidRow => ({ source: 'subscribers', id: r.id, date: r.tx_date, person: r.party_name, what: TX_LABEL[r.type] ?? r.type, amount: r.amount, detail: r.note, ref: r.subscriber_id })),
    ...requests.map((r): AidRow => ({ source: 'requests', id: r.id, date: r.delivered_at.slice(0, 10), person: r.name, what: r.title, amount: null, detail: r.delivered_note, ref: null })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  return c.json({ from, to, items });
});
