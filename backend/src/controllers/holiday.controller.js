import { asyncHandler } from '../utils/httpError.js';
import * as svc from '../services/holiday.service.js';
import { syncPayrollMonths } from '../services/payroll.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await svc.getHolidays({ from: req.query.from, to: req.query.to }));
});

export const add = asyncHandler(async (req, res) => {
  const r = await svc.addHolidays(req.body || {}, req.user);
  await syncPayrollMonths(r.months, req.user); // already generated salaries follow the new calendar
  res.status(201).json(r);
});

export const remove = asyncHandler(async (req, res) => {
  const r = await svc.removeHoliday(req.params.date, req.user);
  await syncPayrollMonths(r.months, req.user);
  res.json(r);
});
