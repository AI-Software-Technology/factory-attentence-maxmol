import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Holiday } from '../../types';
import { ApiService } from '../../services/api';
import { getTodayDateString } from '../../utils/dateUtils';

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Factory holiday calendar. Click one or many dates, press "Mark as Holiday":
 * every worker is marked PRESENT (paid) on those dates. Click a purple date to remove it.
 */
export const HolidayCalendar: React.FC = () => {
  const today = getTodayDateString();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7))); // 1-12
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setHolidays(await ApiService.getHolidays());
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Failed to load holidays.' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const holidayMap = useMemo(() => new Map(holidays.map(h => [h.date, h])), [holidays]);

  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1).getDay();
    const days = new Date(year, month, 0).getDate();
    const out: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) out.push(`${year}-${pad(month)}-${pad(d)}`);
    return out;
  }, [year, month]);

  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const toggle = (date: string) => {
    if (holidayMap.has(date)) return;
    setPicked(p => (p.includes(date) ? p.filter(x => x !== date) : [...p, date].sort()));
  };

  const save = async () => {
    if (!picked.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await ApiService.addHolidays(picked, title.trim() || undefined);
      setMsg({ ok: true, text: `${r.total} date(s) marked as holiday. All workers are present on these days.` });
      setPicked([]);
      setTitle('');
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Failed to save holidays.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h: Holiday) => {
    if (!window.confirm(`Remove holiday ${h.date}${h.title ? ` (${h.title})` : ''}?\nWorkers without a check-in that day will be absent again.`)) return;
    try {
      await ApiService.removeHoliday(h.date);
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Failed to remove holiday.' });
    }
  };

  const upcoming = holidays.filter(h => h.date >= today.slice(0, 7) + '-01').slice(0, 40);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
        <div className="p-2 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-500/40">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">Factory Holiday Calendar</h3>
          <p className="text-xs text-slate-400">
            Select one or many dates. Every worker is marked <strong className="text-purple-300">Present (paid)</strong> on a holiday.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-white text-sm">
              {MONTHS[month - 1]} {year}
            </span>
            <button type="button" onClick={() => shift(1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEK.map(w => (
              <div key={w} className={`text-[10px] font-semibold py-1 ${w === 'Sun' ? 'text-rose-400' : 'text-slate-500'}`}>
                {w}
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div key={`e${i}`} />;
              const hol = holidayMap.get(date);
              const sel = picked.includes(date);
              const isToday = date === today;
              return (
                <button
                  type="button"
                  key={date}
                  onClick={() => toggle(date)}
                  title={hol ? `${hol.title || 'Holiday'} (saved)` : sel ? 'Selected' : 'Click to select'}
                  className={`aspect-square rounded-lg text-xs font-semibold border transition-colors ${
                    hol
                      ? 'bg-purple-900/70 border-purple-500 text-purple-100 cursor-default'
                      : sel
                      ? 'bg-emerald-600 border-emerald-400 text-white cursor-pointer'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-emerald-600 cursor-pointer'
                  } ${isToday ? 'ring-1 ring-sky-400' : ''}`}
                >
                  {Number(date.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-purple-700 inline-block" /> Saved holiday</span>
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" /> Selected</span>
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded ring-1 ring-sky-400 inline-block" /> Today</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Holiday name (optional)</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={60}
              placeholder="Diwali, Sunday off, Factory maintenance..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
            />
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
            <span className="text-slate-400 block mb-1.5">Selected dates ({picked.length})</span>
            {picked.length === 0 ? (
              <span className="text-slate-600">Click dates on the calendar. You can pick many, across months.</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {picked.map(d => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setPicked(p => p.filter(x => x !== d))}
                    className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono cursor-pointer hover:bg-rose-950 hover:border-rose-700 hover:text-rose-300"
                    title="Click to unselect"
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={busy || !picked.length}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold cursor-pointer"
          >
            {busy ? 'Saving...' : `Mark ${picked.length || ''} Date(s) as Holiday`}
          </button>

          {msg && (
            <div
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
                msg.ok ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div>
            <span className="text-xs font-semibold text-slate-400 block mb-1.5">Saved holidays ({holidays.length})</span>
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {upcoming.length === 0 && <span className="text-xs text-slate-600">No holidays saved yet.</span>}
              {upcoming.map(h => (
                <div key={h.id} className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
                  <span>
                    <span className="font-mono text-purple-300">{h.date}</span>
                    <span className="text-slate-400"> · {h.title || 'Holiday'}</span>
                  </span>
                  <button type="button" onClick={() => remove(h)} className="text-slate-500 hover:text-rose-400 cursor-pointer" title="Remove holiday">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
