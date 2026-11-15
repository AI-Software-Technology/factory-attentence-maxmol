import { getWorkingTimeDetails, shiftStartFor } from './timeCalculations.js';
import { getLocalDateString } from './dateUtils.js';

const D_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' -> local Date at hh:mm (default noon, DST/overnight safe) */
export function dateAt(dateStr, h = 12, m = 0) {
  const x = D_RE.exec(dateStr);
  return new Date(Number(x[1]), Number(x[2]) - 1, Number(x[3]), h, m, 0, 0);
}

/** Inclusive list of 'YYYY-MM-DD' from..to */
export function eachDate(from, to) {
  const out = [];
  if (!D_RE.test(from) || !D_RE.test(to) || from > to) return out;
  const d = dateAt(from);
  const end = getLocalDateString(dateAt(to));
  for (let i = 0; i < 800; i++) {
    const s = getLocalDateString(d);
    out.push(s);
    if (s >= end) break;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const monthRange = month => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, daysInMonth: last };
};

/**
 * Moment after which a worker who has NOT checked in is ABSENT:
 *   shift start + grace minutes.   09:00 shift, grace 15 -> absent after 09:15.
 * (Arriving later than that is still allowed: the record becomes PRESENT - LATE and late minutes
 *  are counted from the shift start, grace is NOT subtracted.)
 */
export function absentCutoff(dateStr, workingTime, graceMinutes = 0) {
  const details = getWorkingTimeDetails(workingTime);
  const start = shiftStartFor(dateAt(dateStr), details);
  return new Date(start.getTime() + Math.max(0, Number(graceMinutes) || 0) * 60000);
}

const isAbsentLike = r => !r.checkInTime;

const blank = {
  lateMinutes: 0,
  totalWorkingMinutes: 0,
  earlyExitMinutes: 0,
  overtimeMinutes: 0,
};

/**
 * Rows for days a worker has no check-in:
 *   - holiday      -> status HOLIDAY (counts as PRESENT / paid)
 *   - past day or grace over today -> status ABSENT
 *   - future / still inside grace  -> nothing
 * Pure: workers, existing records, holiday set, rules and "now" are passed in.
 * `workers` need: id fullName employeeId workingTime status dateOfJoining profilePhoto
 */
export function buildMissingRows({ dates, workers, records, holidaySet, graceMinutes = 0, now = new Date() }) {
  const today = getLocalDateString(now);
  const have = new Map(); // workerId|date -> record
  for (const r of records) have.set(`${r.workerId}|${r.date}`, r);

  const rows = [];
  for (const date of dates) {
    if (date > today) continue;
    const isHoliday = holidaySet.has(date);
    for (const w of workers) {
      if (w.status === 'TERMINATED') continue;
      if (w.dateOfJoining && date < String(w.dateOfJoining).slice(0, 10)) continue;
      const rec = have.get(`${w.id}|${date}`);
      if (rec && !isAbsentLike(rec)) continue; // real punch wins (also on a holiday)
      if (rec && rec.status === 'ABSENT') continue; // stored absent placeholder already in the list

      const d = getWorkingTimeDetails(w.workingTime);
      if (!isHoliday && date === today && now.getTime() <= absentCutoff(date, w.workingTime, graceMinutes).getTime()) continue;

      rows.push({
        id: `${isHoliday ? 'holiday' : 'absent'}-${w.id}-${date}`,
        workerId: w.id,
        workerName: w.fullName,
        workerEmployeeId: w.employeeId,
        workerPhoto: w.profilePhoto || '',
        date,
        workingTime: d.label,
        workingStartTime: d.startTime12,
        workingEndTime: d.endTime12,
        ...blank,
        status: isHoliday ? 'HOLIDAY' : 'ABSENT',
        checkInMarkedByGuardName: isHoliday ? 'Holiday' : 'System (Auto Absent)',
        checkInGate: '',
        createdAt: `${date}T00:00:00.000Z`,
        recordSource: 'live',
        virtual: true,
      });
    }
  }
  return rows;
}

/**
 * Per-worker attendance totals for a salary period.
 * attended = days with a check-in, holidays = paid off days with no punch, absent = missing days.
 * pendingDays = part of the 30-day basis that is not payable yet (future days / days before joining).
 */
export function summarizeWorkerPeriod({ worker, month, records, holidaySet, graceMinutes = 0, now = new Date() }) {
  const { from, to } = monthRange(month);
  const today = getLocalDateString(now);
  const mine = records.filter(r => r.workerId === worker.id);
  const attendedDates = new Set(mine.filter(r => r.checkInTime).map(r => r.date));
  const joined = worker.dateOfJoining ? String(worker.dateOfJoining).slice(0, 10) : '';

  let daysAttended = 0;
  let daysHoliday = 0;
  let daysAbsent = 0;
  let elapsed = 0; // payable calendar days of the month that are over and after joining
  let preJoin = 0; // days before date of joining (not payable)

  for (const date of eachDate(from, to)) {
    if (date > today) continue;
    if (joined && date < joined) {
      preJoin++;
      continue;
    }
    if (worker.status === 'TERMINATED') continue;
    const cutoffOver = date < today || now.getTime() > absentCutoff(date, worker.workingTime, graceMinutes).getTime();
    if (attendedDates.has(date)) {
      daysAttended++;
      elapsed++;
    } else if (holidaySet.has(date)) {
      daysHoliday++;
      elapsed++;
    } else if (cutoffOver) {
      daysAbsent++;
      elapsed++;
    }
    // today still inside grace and not arrived yet: neither present nor absent, stays pending
  }
  // Basis is 30 days: a 31-day month still pays 30, Feb pays the full 30 once it is over
  const monthOver = today > to;
  const missing = Math.min(daysAbsent, 30);
  const pendingDays = monthOver ? Math.min(30, preJoin) : Math.max(0, 30 - Math.min(30, elapsed));
  return {
    daysPresent: daysAttended + daysHoliday,
    daysAttended,
    daysHoliday,
    daysAbsent: missing,
    pendingDays,
    monthOver,
  };
}
