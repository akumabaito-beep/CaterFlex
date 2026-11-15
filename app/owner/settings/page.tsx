'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/app/dashboard-layout';
import type { DayOfWeek } from '@/lib/types';
import type { OperatorSettingRow } from '@/lib/settings-types';
import { CalendarDays, Check, Clock, Minus, Plus, Save, Users } from 'lucide-react';
import {
  loadOperatingRules,
  saveOperatingRules as saveOperatingRulesAction,
} from '@/app/actions/settings-actions';

const DAY_LABELS: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

type SettingsState = {
  operatingDays: DayOfWeek[];
  operatingHoursStart: string;
  operatingHoursEnd: string;
  maxEventsPerDay: Record<DayOfWeek, number>;
  maxMealPrepOrdersPerDay: Record<DayOfWeek, number>;
  maxGuestsPerEvent: number;
};

const DEFAULT_SETTINGS: SettingsState = {
  operatingDays: [1, 2, 3, 4, 5, 6],
  operatingHoursStart: '08:00',
  operatingHoursEnd: '18:00',
  maxEventsPerDay: {
    0: 0,
    1: 1,
    2: 1,
    3: 2,
    4: 2,
    5: 2,
    6: 3,
  },
  maxMealPrepOrdersPerDay: {
    0: 0,
    1: 5,
    2: 5,
    3: 5,
    4: 5,
    5: 5,
    6: 3,
  },
  maxGuestsPerEvent: 100,
};

function normalizeTime(value: string | null): string {
  if (!value) return '';

  // Supabase may return PostgreSQL time as HH:MM:SS.
  // HTML time inputs expect HH:MM.
  return value.slice(0, 5);
}

const stepperBtn =
  'flex size-8 items-center justify-center rounded-lg border border-[#E8D8C4] bg-white text-[#C8431B] transition-colors hover:bg-[#f1f1f2] disabled:pointer-events-none disabled:opacity-30';

function Stepper({ value, onChange, disabled, label, min = 0 }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string; min?: number }) {
  return (
  <div className={`flex items-center gap-1.5 ${disabled ? 'opacity-40' : ''}`}>
    <button type="button" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Decrease ${label}`} className={stepperBtn}>
      <Minus className="size-4" aria-hidden="true" />
    </button>
    <input
      type="number"
      min={min}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        onChange(Number.isNaN(v) ? min : Math.max(v, min));
      }}
      className="h-8 w-12 rounded-lg border border-transparent bg-transparent text-center text-sm font-semibold text-[#2B1D16] outline-none focus:border-[#C8431B] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`} className={stepperBtn}>
      <Plus className="size-4" aria-hidden="true" />
    </button>
  </div>
);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError('');

    const result = await loadOperatingRules();
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const rows = result.rows ?? [];
    if (rows.length === 0) {
      setError('No operating rules were found for this operator.');
      setLoading(false);
      return;
    }

    const nextSettings: SettingsState = {
      operatingDays: [],
      operatingHoursStart: DEFAULT_SETTINGS.operatingHoursStart,
      operatingHoursEnd: DEFAULT_SETTINGS.operatingHoursEnd,
      maxEventsPerDay: { ...DEFAULT_SETTINGS.maxEventsPerDay },
      maxMealPrepOrdersPerDay: { ...DEFAULT_SETTINGS.maxMealPrepOrdersPerDay },
      maxGuestsPerEvent: DEFAULT_SETTINGS.maxGuestsPerEvent,
    };

    for (const row of rows as OperatorSettingRow[]) {
      const day = Number(row.DayOfWeek) as DayOfWeek;
      if (!ALL_DAYS.includes(day)) continue;

      const cateringLimit = row.MaxCateringEventsPerDay ?? 0;
      if (cateringLimit > 0) nextSettings.operatingDays.push(day);
      nextSettings.maxEventsPerDay[day] = cateringLimit;
      nextSettings.maxMealPrepOrdersPerDay[day] = row.MaxMealPrepOrdersPerDay ?? 0;
      if (row.OperatingStartTime) nextSettings.operatingHoursStart = normalizeTime(row.OperatingStartTime);
      if (row.OperatingEndTime) nextSettings.operatingHoursEnd = normalizeTime(row.OperatingEndTime);
      if (row.MaxGuestCountPerEvent !== null) nextSettings.maxGuestsPerEvent = row.MaxGuestCountPerEvent ?? DEFAULT_SETTINGS.maxGuestsPerEvent;
    }

    nextSettings.operatingDays.sort();
    setSettings(nextSettings);
    setLoading(false);
  }

  function updateSettings(updates: Partial<SettingsState>) {
    setSettings((current) => ({
      ...current,
      ...updates,
    }));

    setMessage('');
    setError('');
  }

  function toggleDay(day: DayOfWeek) {
    const isCurrentlyOpen = settings.operatingDays.includes(day);

    const operatingDays = isCurrentlyOpen
      ? settings.operatingDays.filter((d) => d !== day)
      : [...settings.operatingDays, day].sort();

    // When a day is closed, set catering capacity to 0.
    // When reopened, restore it to at least 1.
    const maxEventsPerDay = {
      ...settings.maxEventsPerDay,
      [day]: isCurrentlyOpen
        ? 0
        : Math.max(settings.maxEventsPerDay[day], 1),
    };

    // Meal prep follows the same open/closed state.
    const maxMealPrepOrdersPerDay = {
      ...settings.maxMealPrepOrdersPerDay,
      [day]: isCurrentlyOpen
        ? 0
        : Math.max(settings.maxMealPrepOrdersPerDay[day], 1),
    };

    updateSettings({
      operatingDays,
      maxEventsPerDay,
      maxMealPrepOrdersPerDay,
    });
  }

  async function saveSettings() {
    setSaving(true);
    setMessage('');
    setError('');

    const result = await saveOperatingRulesAction({
      operatingHoursStart: settings.operatingHoursStart,
      operatingHoursEnd: settings.operatingHoursEnd,
      maxEventsPerDay: settings.maxEventsPerDay,
      maxMealPrepOrdersPerDay: settings.maxMealPrepOrdersPerDay,
      maxGuestsPerEvent: settings.maxGuestsPerEvent,
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setMessage('Operating rules saved successfully.');
    await loadSettings();
    setSaving(false);
  }

  const openDays = settings.operatingDays.length;
  const fmt = (t: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const hoursInvalid = Boolean(settings.operatingHoursStart && settings.operatingHoursEnd && settings.operatingHoursStart >= settings.operatingHoursEnd);

  const header = (
    <div>
      <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Operating Rules</h1>
      <p className="mt-2 text-surface-muted-foreground">
        Set when you take bookings and how many you can handle. Customers only see dates that fit these rules.
      </p>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          {header}
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]" aria-busy="true">
            <div className="h-96 animate-pulse rounded-2xl border border-[#E8D8C4] bg-white" />
            <div className="h-72 animate-pulse rounded-2xl border border-[#E8D8C4] bg-white" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const timeInput =
    'mt-1.5 h-11 w-full rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm text-[#2B1D16] outline-none transition-colors focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20';

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {header}

        {error && (
          <div role="alert" className="rounded-xl border border-[#B3261E]/30 bg-[#F8DDD9] px-4 py-3 text-sm font-medium text-[#B3261E]">{error}</div>
        )}
        {message && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-[#C8431B]/30 bg-[#F6E3D3] px-4 py-3 text-sm font-medium text-[#2B1D16]">
            <Check className="size-4 text-[#C8431B]" aria-hidden="true" /> {message}
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          {/* WEEKLY SCHEDULE */}
          <section className="overflow-hidden rounded-2xl border border-[#E8D8C4] bg-white">
            <div className="flex items-center gap-3 border-b border-[#E8D8C4] px-6 py-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#F6E3D3] text-[#C8431B]"><CalendarDays className="size-5" aria-hidden="true" /></span>
              <div>
                <h2 className="font-heading text-lg font-bold uppercase text-[#2B1D16]">Weekly schedule</h2>
                <p className="text-sm text-[#2B1D16]/60">Turn a day on, then set how many bookings it can take.</p>
              </div>
            </div>

            <div className="hidden grid-cols-[1fr_9.5rem_9.5rem] gap-4 border-b border-[#E8D8C4] bg-[#FBF6EE] px-6 py-2 text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60 sm:grid">
              <span>Day</span>
              <span>Catering events</span>
              <span>Meal prep orders</span>
            </div>

            <ul className="divide-y divide-[#E8D8C4]">
              {ALL_DAYS.map((day) => {
                const open = settings.operatingDays.includes(day);
                return (
                  <li key={day} className={`grid items-center gap-3 px-6 py-3.5 transition-colors sm:grid-cols-[1fr_9.5rem_9.5rem] sm:gap-4 ${open ? 'bg-white' : 'bg-[#FBF6EE]'}`}>
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={open} onChange={() => toggleDay(day)} className="peer sr-only" />
                      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-[#E8D8C4] transition-colors peer-checked:bg-[#C8431B] peer-focus-visible:ring-2 peer-focus-visible:ring-[#C8431B]/40 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                      <span className="font-semibold text-[#2B1D16]">{DAY_LABELS[day]}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${open ? 'bg-[#F6E3D3] text-[#C8431B]' : 'bg-[#E8D8C4]/60 text-[#2B1D16]/60'}`}>{open ? 'Open' : 'Closed'}</span>
                    </label>

                    <div className="flex items-center justify-between gap-3 sm:justify-start">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60 sm:hidden">Catering</span>
                      <Stepper
                        label={`${DAY_LABELS[day]} catering events`}
                        value={settings.maxEventsPerDay[day]}
                        disabled={!open}
                        onChange={(v) => updateSettings({ maxEventsPerDay: { ...settings.maxEventsPerDay, [day]: v } })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-start">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60 sm:hidden">Meal prep</span>
                      <Stepper
                        label={`${DAY_LABELS[day]} meal prep orders`}
                        value={settings.maxMealPrepOrdersPerDay[day]}
                        disabled={!open}
                        onChange={(v) => updateSettings({ maxMealPrepOrdersPerDay: { ...settings.maxMealPrepOrdersPerDay, [day]: v } })}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* SIDE COLUMN */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <section className="rounded-2xl border border-[#E8D8C4] bg-white p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#F6E3D3] text-[#C8431B]"><Clock className="size-5" aria-hidden="true" /></span>
                <h2 className="font-heading text-lg font-bold uppercase text-[#2B1D16]">Hours</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hours-start" className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">Opens</label>
                  <input id="hours-start" type="time" value={settings.operatingHoursStart} onChange={(e) => updateSettings({ operatingHoursStart: e.target.value })} className={timeInput} />
                </div>
                <div>
                  <label htmlFor="hours-end" className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">Closes</label>
                  <input id="hours-end" type="time" value={settings.operatingHoursEnd} onChange={(e) => updateSettings({ operatingHoursEnd: e.target.value })} className={timeInput} />
                </div>
              </div>
              {hoursInvalid && <p role="alert" className="mt-2 text-sm font-medium text-[#B3261E]">Closing time must be after opening time.</p>}
            </section>

            <section className="rounded-2xl border border-[#E8D8C4] bg-white p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#F6E3D3] text-[#C8431B]"><Users className="size-5" aria-hidden="true" /></span>
                <h2 className="font-heading text-lg font-bold uppercase text-[#2B1D16]">Guest limit</h2>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#2B1D16]/70">Max guests per event</span>
                <Stepper label="Max guests per event" min={1} value={settings.maxGuestsPerEvent} onChange={(v) => updateSettings({ maxGuestsPerEvent: v })} />
              </div>
            </section>

            <section className="rounded-2xl bg-[#2B1D16] p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Summary</p>
              <p className="mt-2 font-heading text-2xl font-bold uppercase leading-tight">
                Open {openDays} {openDays === 1 ? 'day' : 'days'} a week
              </p>
              <p className="mt-1 text-sm text-white/80">
                {fmt(settings.operatingHoursStart)} to {fmt(settings.operatingHoursEnd)} · up to {settings.maxGuestsPerEvent} guests
              </p>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving || hoursInvalid}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#C8431B] font-semibold text-white transition-colors hover:bg-[#A93615] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="size-4" aria-hidden="true" /> {saving ? 'Saving...' : 'Save operating rules'}
              </button>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
