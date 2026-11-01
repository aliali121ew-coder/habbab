import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { invalidateRefData } from '../lib/cache';
import { all, auditInsertedStmt, auditStmt, batch, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { cursorParam, fail, idParam, readJson, zId } from '../lib/http';

interface MemberRow {
  id: number;
  subscriber_id: number;
  subscriber_name: string;
  delegate_id: number | null;
  monthly_amount: number;
  started_at: string;
}

const COLUMNS = 'id, subscriber_id, subscriber_name, delegate_id, monthly_amount, started_at';

export const programs = new Hono<AppEnv>();

programs.post('/', requireRole('admin'), async (c) => {
  const { name } = await readJson(c, z.object({
    name: z.string({ error: 'اسم البرنامج مطلوب' }).trim().min(2, 'الاسم قصير جداً').max(60),
  }));
  await batch(c, [
    stmt(c, 'INSERT INTO programs (name) VALUES (?)', name),
    auditInsertedStmt(c, 'create', 'program'),
  ]);
  invalidateRefData(c);
  return c.json({ ok: true }, 201);
});

programs.get('/:id/members', requireRole('admin', 'delegate'), async (c) => {
  const programId = idParam(c.req.param('id'));
  const cursor = cursorParam(c.req.query('cursor'));
  const user = c.get('user');
  const rows = user.role === 'delegate'
    ? await all<MemberRow>(c, `SELECT ${COLUMNS} FROM subscriber_programs
        WHERE delegate_id = ? AND program_id = ? AND ended_at IS NULL AND id < ? ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
        user.id, programId, cursor)
    : await all<MemberRow>(c, `SELECT ${COLUMNS} FROM subscriber_programs
        WHERE program_id = ? AND ended_at IS NULL AND id < ? ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
        programId, cursor);
  return c.json({ items: rows, next: nextCursor(rows) });
});

programs.post('/:id/members', requireRole('admin', 'delegate'), async (c) => {
  const programId = idParam(c.req.param('id'));
  const body = await readJson(c, z.object({
    subscriber_id: zId,
    monthly_amount: z.number().int().min(0).max(100_000_000).default(0),
  }));
  const user = c.get('user');
  const subscriber = await first<{ full_name: string; delegate_id: number | null }>(
    c, 'SELECT full_name, delegate_id FROM subscribers WHERE id = ? AND deleted_at IS NULL', body.subscriber_id,
  );
  if (!subscriber || (user.role === 'delegate' && subscriber.delegate_id !== user.id)) fail(404, 'المشترك غير موجود');

  await batch(c, [
    stmt(c, `INSERT INTO subscriber_programs (subscriber_id, program_id, subscriber_name, delegate_id, monthly_amount)
             VALUES (?, ?, ?, ?, ?)`,
      body.subscriber_id, programId, subscriber.full_name, subscriber.delegate_id, body.monthly_amount),
    auditInsertedStmt(c, 'enroll', 'subscriber_program'),
  ]);
  return c.json({ ok: true }, 201);
});

programs.delete('/:id/members/:memberId', requireRole('admin', 'delegate'), async (c) => {
  const memberId = idParam(c.req.param('memberId'));
  const user = c.get('user');
  const member = await first<{ delegate_id: number | null }>(
    c, 'SELECT delegate_id FROM subscriber_programs WHERE id = ? AND ended_at IS NULL', memberId,
  );
  if (!member || (user.role === 'delegate' && member.delegate_id !== user.id)) fail(404, 'السجل غير موجود');

  await batch(c, [
    stmt(c, 'UPDATE subscriber_programs SET ended_at = ? WHERE id = ? AND ended_at IS NULL',
      new Date().toISOString().slice(0, 10), memberId),
    auditStmt(c, 'unenroll', 'subscriber_program', memberId),
  ]);
  return c.json({ ok: true });
});
