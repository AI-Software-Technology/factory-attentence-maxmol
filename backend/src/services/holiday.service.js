import { Holiday, PUBLIC } from '../models/index.js';
import { addAuditLog } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';
import { genId, isValidDate } from '../utils/dateUtils.js';
import { cached, bump } from '../utils/cache.js';

/** Holidays between two dates (inclusive). Both optional = all. */
export async function getHolidays({ from, to } = {}) {
  const q = {};
  if (from && isValidDate(from)) q.date = { ...(q.date || {}), $gte: from };
  if (to && isValidDate(to)) q.date = { ...(q.date || {}), $lte: to };
  return cached('holidays', q, async () => Holiday.find(q).sort({ date: 1 }).select(PUBLIC).lean(), 300);
}

export async function getHolidaySet(from, to) {
  return new Set((await getHolidays({ from, to })).map(h => h.date));
}

/** Add one or many dates at once. Existing dates are kept (title is updated). Returns { added, months } */
export async function addHolidays({ dates, title } = {}, actor) {
  const list = [...new Set((Array.isArray(dates) ? dates : [dates]).map(d => String(d || '').trim()).filter(Boolean))];
  if (!list.length) throw new HttpError(400, 'Select at least one date.');
  const bad = list.find(d => !isValidDate(d) || Number.isNaN(new Date(`${d}T12:00:00`).getTime()));
  if (bad) throw new HttpError(400, `Invalid date: ${bad}. Use YYYY-MM-DD.`);
  if (list.length > 62) throw new HttpError(400, 'Maximum 62 dates at a time.');

  const name = String(title || '').trim().slice(0, 60) || 'Holiday';
  const now = new Date().toISOString();
  let added = 0;
  for (const date of list) {
    const r = await Holiday.updateOne(
      { date },
      { $set: { title: name }, $setOnInsert: { id: genId('hol'), date, createdAt: now, createdBy: actor?.name || 'Admin' } },
      { upsert: true }
    );
    if (r.upsertedCount) added++;
  }
  await bump('holidays', 'att');

  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'Admin',
    actionType: 'RULES_UPDATED',
    details: `Holiday "${name}" added for ${list.length} date(s): ${list.slice(0, 12).join(', ')}${list.length > 12 ? '…' : ''}. All workers are marked present on these days.`,
  });
  return { added, total: list.length, months: [...new Set(list.map(d => d.slice(0, 7)))] };
}

export async function removeHoliday(date, actor) {
  if (!isValidDate(date)) throw new HttpError(400, 'Invalid date.');
  const r = await Holiday.deleteOne({ date });
  if (!r.deletedCount) throw new HttpError(404, `No holiday on ${date}.`);
  await bump('holidays', 'att');
  await addAuditLog({
    actorRole: 'ADMIN',
    actorId: actor?.id || 'admin',
    actorName: actor?.name || 'Admin',
    actionType: 'RULES_UPDATED',
    details: `Holiday on ${date} removed. Workers without a check-in that day are absent again.`,
  });
  return { success: true, date, months: [date.slice(0, 7)] };
}
