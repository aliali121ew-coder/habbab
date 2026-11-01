import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429, message: string): never {
  throw new HTTPException(status, { message });
}

export async function readJson<S extends z.ZodTypeAny>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> {
  const body = await c.req.json().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  return parseOrFail(schema, body);
}

export function parseOrFail<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) fail(422, parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  return parsed.data;
}

export const idParam = (value: string) => parseOrFail(z.coerce.number().int().positive(), value);

export const cursorParam = (value: string | undefined): number =>
  value ? parseOrFail(z.coerce.number().int().positive(), value) : Number.MAX_SAFE_INTEGER;

export const zDate = z.string({ error: 'التاريخ مطلوب' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صحيح');
export const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'شهر غير صحيح');
export const zAmount = z.number({ error: 'مبلغ غير صحيح' })
  .int('يجب أن يكون المبلغ رقماً صحيحاً').positive('يجب أن يكون المبلغ أكبر من صفر').max(100_000_000_000, 'المبلغ كبير جداً');
export const zId = z.number().int().positive();
export const zText = (max: number) => z.string().trim().max(max, 'النص طويل جداً');
