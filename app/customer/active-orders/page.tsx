'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Users,
  Utensils,
  X,
} from 'lucide-react';

import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { Button } from '@/components/ui/button';
import { TimePicker } from '@/components/booking/TimePicker';
import { LocationPicker } from '@/components/booking/LocationPicker';
import { OptionCardPicker } from '@/components/booking/OptionCardPicker';
import {
  cancelMealPlan,
  getMyMealPlans,
  pauseMealPlan,
  previewMealPlanCancellation,
  renewMealPlan,
  resumeMealPlan,
  skipNextDelivery,
  updateMealPlanDelivery,
  type MealPlan,
} from '@/app/actions/meal-plan-actions';
import { parsePinnedAddress } from '@/lib/kitchen';
import {
  MAX_PAUSE_DAYS,
  PLAN_WEEKS,
  PAUSE_CUTOFF_DAYS,
  addDaysISO,
  cycleTotal,
  daysBetween,
  deliveryDaysLabel,
  frequencyLabel,
  planState,
  planTitle,
  scheduleDates,
  type PlanState,
  type PlanWeeks,
} from '@/lib/meal-plan';

const scheduleLabel = (plan: MealPlan) =>
  plan.days.length ? `${deliveryDaysLabel(plan.days)}${plan.planWeeks ? ` · ${plan.planWeeks} ${plan.planWeeks === 1 ? 'week' : 'weeks'}` : ''}` : frequencyLabel(plan.frequency);

const PAUSE_CHOICES = [
  { value: '3', label: '3 days' },
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
] as const;

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const formatLongDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
const formatTime = (t: string | null) => {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '—';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

const STATE_BADGE: Record<PlanState, { label: string; cls: string }> = {
  pending: { label: 'Waiting for approval', cls: 'border-amber-300 bg-amber-100 text-amber-900' },
  active: { label: 'Active', cls: 'border-emerald-300 bg-emerald-100 text-emerald-900' },
  paused: { label: 'Paused', cls: 'border-amber-300 bg-amber-100 text-amber-900' },
  ended: { label: 'Ended · renew to continue', cls: 'border-[#E3C7A8] bg-[#F6E3D3] text-[#A93615]' },
  cancelled: { label: 'Cancelled', cls: 'border-neutral-300 bg-neutral-100 text-neutral-700' },
  rejected: { label: 'Declined', cls: 'border-red-300 bg-red-100 text-red-800' },
};

const outlineBtn =
  'h-10 gap-2 rounded-lg border-[#C8431B] text-[#C8431B] hover:bg-[#F6E3D3] hover:text-[#A93615]';
const solidBtn = 'h-10 gap-2 rounded-lg bg-[#C8431B] font-semibold text-white hover:bg-[#A93615]';

export default function MealPlansPage() {
  const router = useRouter();
  const { operatorSettings } = useAppState();

  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [renewFrom, setRenewFrom] = useState<'banner' | 'actions'>('actions');
  const [renewWeeks, setRenewWeeks] = useState<PlanWeeks>(2);
  const [pausingId, setPausingId] = useState<number | null>(null);
  const [pauseLength, setPauseLength] = useState<'3' | '7' | '14'>('7');
  const [cancelling, setCancelling] = useState<{ id: number; refund: number; refunded: number; committed: number } | null>(null);
  const [edit, setEdit] = useState({ time: '', method: 'pickup' as 'pickup' | 'delivery', address: '' });

  const refresh = useCallback(async () => {
    const result = await getMyMealPlans();
    if (result.ok) {
      setPlans(result.plans.filter((p) => p.status !== 'rejected'));
      setToday(result.today);
    } else {
      setNotice({ kind: 'error', text: result.error });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (result.ok) {
        setNotice({ kind: 'ok', text: success });
        await refresh();
        router.refresh();
        return true;
      }
      setNotice({ kind: 'error', text: result.error ?? 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
    return false;
  };

  const header = (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#C8431B]">Subscriptions</p>
      <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Meal plans</h1>
      <p className="mt-2 text-[#2B1D16]/70">
        Your breakfast, lunch and dinner subscriptions. Pause, skip a delivery, or renew anytime.
      </p>
    </div>
  );

  if (loading) {
    return (
      <CustomerShell>
        <div className="space-y-8">
          {header}
          <div className="rounded-xl border border-[#E8D8C4] bg-white p-12 text-center text-[#2B1D16]/60">
            Loading your meal plans...
          </div>
        </div>
      </CustomerShell>
    );
  }

  if (plans.length === 0) {
    return (
      <CustomerShell>
        <div className="space-y-8">
          {header}
          <div className="rounded-xl border border-dashed border-[#E8D8C4] bg-white p-12 text-center">
            <p className="mb-4 text-[#2B1D16]/60">You don&apos;t have a meal plan yet.</p>
            <Button className={`${solidBtn} px-6`} onClick={() => router.push('/customer/inquiry')}>
              Start a meal plan
            </Button>
          </div>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <div className="space-y-8">
        {header}

        {notice && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm font-medium ${
              notice.kind === 'ok'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {notice.kind === 'ok' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="flex-1">{notice.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="space-y-5">
          {plans.map((plan) => {
            const state = planState(plan.status, plan.termEnd, today);
            const badge = STATE_BADGE[state];
            const left = plan.termEnd && state !== 'cancelled' ? scheduleDates(plan.nextDate, plan.termEnd, plan.days, plan.frequency) : [];
            const total = plan.termCycles ?? left.length;
            const progress = total > 0 ? Math.max(0, Math.min(100, ((total - left.length) / total) * 100)) : 0;
            const expanded = expandedId === plan.id;
            const pinned = parsePinnedAddress(plan.address ?? '');
            const perDelivery =
              plan.pricePerServing !== null
                ? cycleTotal(plan.pricePerServing, plan.servings, plan.method === 'delivery' ? plan.deliveryFee : 0)
                : null;
            const needsRenewal = state === 'ended' || ((state === 'active' || state === 'paused') && left.length <= 2);
            const canChange = state === 'pending' || state === 'active' || state === 'paused';

            const renewPanel = (
                    
                      <div className="space-y-3 rounded-xl border border-[#E8D8C4] bg-[#F6E3D3] p-4">
                        <OptionCardPicker<`${PlanWeeks}`>
                          title="Renew for how long?"
                          icon={RefreshCw}
                          value={`${renewWeeks}`}
                          onChange={(v) => setRenewWeeks(Number(v) as PlanWeeks)}
                          options={PLAN_WEEKS.map((n) => ({
                            value: `${n}` as `${PlanWeeks}`,
                            label: `${n} more ${n === 1 ? 'week' : 'weeks'}`,
                            hint: plan.days.length ? `${n * plan.days.length} deliveries` : undefined,
                          }))}
                        />
                        <p className="text-sm text-[#2B1D16]/70">
                          {state === 'ended'
                            ? 'A new term starts on your next delivery day. Prices are updated to the current menu prices when a plan is renewed after it ended.'
                            : 'Your current price stays locked while you add deliveries.'}
                        </p>
                        <div className="flex gap-3">
                          <Button variant="outline" className={`${outlineBtn} flex-1`} onClick={() => setRenewingId(null)} disabled={busy}>
                            Not now
                          </Button>
                          <Button
                            className={`${solidBtn} flex-1`}
                            disabled={busy}
                            onClick={async () => {
                              if (await run(() => renewMealPlan(plan.id, renewWeeks), 'Meal plan renewed.')) setRenewingId(null);
                            }}
                          >
                            Confirm renewal
                          </Button>
                        </div>
                      </div>
            );

            return (
              <article
                key={plan.id}
                className="overflow-hidden rounded-xl border border-[#E8D8C4] bg-white shadow-sm"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : plan.id)}
                  className="flex w-full items-center gap-4 bg-[#F6E3D3] p-6 text-left transition-colors hover:bg-[#F6E3D3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8431B]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-2xl font-bold uppercase leading-tight text-[#2B1D16]">
                      {planTitle(plan.mealType)}
                    </p>
                    <p className="mt-1 text-sm text-[#2B1D16]/70">
                      {plan.servings} servings · {scheduleLabel(plan)} · {plan.dishes.length}{' '}
                      {plan.dishes.length === 1 ? 'dish' : 'dishes'}
                    </p>
                    <span className={`mt-3 inline-block rounded-lg border px-3 py-1 text-xs font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  {state !== 'ended' && state !== 'cancelled' && plan.nextDate && (
                    <div className="hidden text-right sm:block">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">Next delivery</p>
                      <p className="font-bold text-[#C8431B]">{formatDate(plan.nextDate)}</p>
                    </div>
                  )}
                  <ChevronDown
                    className={`size-5 shrink-0 text-[#C8431B] transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {/* PROGRESS + RENEWAL PROMPT (always visible) */}
                {plan.termEnd && state !== 'pending' && state !== 'cancelled' && (
                  <div className="space-y-3 border-t border-[#E8D8C4] px-6 py-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#2B1D16]">
                        {state === 'ended'
                          ? 'All deliveries completed'
                          : `${left.length} ${left.length === 1 ? 'delivery' : 'deliveries'} left`}
                      </span>
                      <span className="text-[#2B1D16]/60">Ends {formatLongDate(plan.termEnd)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
                      <div className="h-full rounded-full bg-[#C8431B]" style={{ width: `${progress}%` }} />
                    </div>
                    {state === 'paused' && plan.pausedUntil && (
                      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                        Paused. Deliveries start again on or after {formatLongDate(plan.pausedUntil)}. Your end date will move out by the length of the pause so you do not lose a delivery.
                      </p>
                    )}
                    {needsRenewal && !(renewingId === plan.id && renewFrom === 'banner') && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#F6E3D3] p-3">
                        <p className="text-sm text-[#2B1D16]">
                          {state === 'ended'
                            ? 'Your plan has ended. Renew to keep your deliveries coming.'
                            : 'Your plan is almost over. Renew now so you do not miss a delivery.'}
                        </p>
                        <Button
                          className={solidBtn}
                          onClick={() => {
                            setRenewFrom('banner');
                            setRenewingId(plan.id);
                          }}
                        >
                          <RefreshCw className="size-4" /> Renew plan
                        </Button>
                      </div>
                    )}
                    {renewingId === plan.id && renewFrom === 'banner' && renewPanel}
                  </div>
                )}

                {state === 'cancelled' && (
                  <p className="border-t border-[#E8D8C4] px-6 py-4 text-sm text-[#2B1D16]/70">
                    This plan was cancelled.
                    {plan.refund !== null && plan.refund > 0
                      ? ` Refund due to you: ${peso(plan.refund)}. The caterer will send it back to you.`
                      : ' No refund was due.'}
                  </p>
                )}

                {state === 'pending' && (
                  <p className="border-t border-[#E8D8C4] px-6 py-4 text-sm text-[#2B1D16]/70">
                    The caterer is reviewing your plan. You will see your deliveries here once it is approved.
                  </p>
                )}

                {expanded && (
                  <div className="space-y-6 border-t border-[#E8D8C4] bg-white p-6">
                    {/* DETAILS */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        { icon: Utensils, label: 'Dishes', value: plan.dishes.map((d) => d.name).join(', ') || '—' },
                        { icon: Users, label: 'Servings per delivery', value: String(plan.servings) },
                        { icon: Clock, label: plan.method === 'delivery' ? 'Delivery time' : 'Pickup time', value: formatTime(plan.time) },
                        { icon: Calendar, label: 'Schedule', value: scheduleLabel(plan) },
                        {
                          icon: MapPin,
                          label: plan.method === 'delivery' ? 'Delivery address' : 'Pickup',
                          value: plan.method === 'delivery' ? (pinned?.address ?? plan.address ?? '—') : 'Kitchen',
                        },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-3 rounded-xl bg-[#F6E3D3] p-4">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C8431B] text-white">
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">{label}</p>
                            <p className="break-words font-bold text-[#2B1D16]">{value}</p>
                            {label === 'Delivery address' && pinned && (
                              <a
                                href={`https://www.openstreetmap.org/?mlat=${pinned.lat}&mlon=${pinned.lng}#map=17/${pinned.lat}/${pinned.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold text-[#C8431B] underline"
                              >
                                View pin on map
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* PRICE */}
                    {plan.pricePerServing !== null && perDelivery !== null && (
                      <div className="space-y-1 rounded-xl border border-[#E8D8C4] p-4 text-sm">
                        <div className="flex justify-between text-[#2B1D16]/70">
                          <span>Price per serving (locked)</span>
                          <span>{peso(plan.pricePerServing)}</span>
                        </div>
                        {plan.method === 'delivery' && (
                          <div className="flex justify-between text-[#2B1D16]/70">
                            <span>Delivery fee per delivery</span>
                            <span>{peso(plan.deliveryFee)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1">
                          <span className="font-semibold text-[#2B1D16]">Per delivery</span>
                          <span className="font-bold text-[#C8431B]">{peso(perDelivery)}</span>
                        </div>
                        {left.length > 0 && (
                          <div className="flex justify-between">
                            <span className="font-semibold text-[#2B1D16]">
                              Remaining ({left.length} {left.length === 1 ? 'delivery' : 'deliveries'})
                            </span>
                            <span className="font-bold text-[#C8431B]">{peso(perDelivery * left.length)}</span>
                          </div>
                        )}
                        <p className="pt-2 text-xs text-[#2B1D16]/60">
                          Menu price changes do not affect this plan until you renew it after it ends.
                        </p>
                      </div>
                    )}

                    {/* UPCOMING */}
                    {left.length > 0 && (
                      <div>
                        <h3 className="mb-3 font-heading text-lg font-bold uppercase tracking-wide text-[#C8431B]">
                          Upcoming deliveries
                        </h3>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          {left.slice(0, 8).map((date, i) => (
                            <div
                              key={date}
                              className={`rounded-lg border p-3 text-center text-sm font-semibold ${
                                i === 0 && state === 'active'
                                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                                  : 'border-[#E8D8C4] bg-white text-[#2B1D16]'
                              }`}
                            >
                              {formatDate(date)}
                            </div>
                          ))}
                        </div>
                        {state === 'paused' && (
                          <p className="mt-2 text-sm text-[#2B1D16]/70">
                            Deliveries are on hold while your plan is paused. When you are back, the same number of deliveries will start again and your end date moves out by the length of the pause.
                          </p>
                        )}
                      </div>
                    )}

                    {/* PAUSE */}
                    {pausingId === plan.id && (
                      <div className="space-y-3 rounded-xl border border-[#E8D8C4] bg-[#F6E3D3] p-4">
                        <OptionCardPicker<'3' | '7' | '14'>
                          title="Pause for how long?"
                          icon={Pause}
                          value={pauseLength}
                          onChange={setPauseLength}
                          options={PAUSE_CHOICES.map((c) => ({ ...c }))}
                        />
                        <p className="text-sm text-[#2B1D16]/70">
                          Deliveries restart on or after {formatLongDate(addDaysISO(today, Number(pauseLength)))}. You keep every paid delivery, so your
                          end date moves out by the pause. Pauses are limited to {MAX_PAUSE_DAYS} days, and a delivery less than {PAUSE_CUTOFF_DAYS} days away
                          is already being prepared.
                        </p>
                        <div className="flex gap-3">
                          <Button variant="outline" className={`${outlineBtn} flex-1`} onClick={() => setPausingId(null)} disabled={busy}>
                            Not now
                          </Button>
                          <Button
                            className={`${solidBtn} flex-1`}
                            disabled={busy}
                            onClick={async () => {
                              if (await run(() => pauseMealPlan(plan.id, addDaysISO(today, Number(pauseLength))), 'Meal plan paused.')) setPausingId(null);
                            }}
                          >
                            Confirm pause
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* CANCEL */}
                    {cancelling?.id === plan.id && (
                      <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                        <p className="font-semibold">Cancel this meal plan? This cannot be undone.</p>
                        <p>
                          {cancelling.refunded} {cancelling.refunded === 1 ? 'delivery' : 'deliveries'} will be cancelled.
                          {cancelling.committed > 0 &&
                            ` ${cancelling.committed} ${cancelling.committed === 1 ? 'delivery is' : 'deliveries are'} less than ${PAUSE_CUTOFF_DAYS} days away and already being prepared, so they still go ahead.`}
                        </p>
                        <p className="text-base font-bold">Refund: {peso(cancelling.refund)}</p>
                        <p className="text-xs text-red-900/70">
                          The refund is calculated at your locked price. The caterer sends it back to you manually.
                        </p>
                        <div className="flex gap-3">
                          <Button variant="outline" className={`${outlineBtn} flex-1`} onClick={() => setCancelling(null)} disabled={busy}>
                            Keep my plan
                          </Button>
                          <Button
                            className="h-10 flex-1 rounded-lg bg-[#C8431B] font-semibold text-white hover:bg-[#A93615]"
                            disabled={busy}
                            onClick={async () => {
                              const done = await run(async () => {
                                const r = await cancelMealPlan(plan.id);
                                return r.ok ? { ok: true } : { ok: false, error: r.error };
                              }, cancelling.refund > 0 ? `Meal plan cancelled. Refund due: ${peso(cancelling.refund)}.` : 'Meal plan cancelled.');
                              if (done) {
                                setCancelling(null);
                                setExpandedId(null);
                              }
                            }}
                          >
                            Yes, cancel plan
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* EDIT DELIVERY */}
                    {editingId === plan.id && (
                      <div className="space-y-4 rounded-xl border border-[#E8D8C4] bg-[#F6E3D3] p-4">
                        <TimePicker
                          value={edit.time}
                          start={operatorSettings.operatingHoursStart}
                          end={operatorSettings.operatingHoursEnd}
                          onChange={(time) => setEdit((e) => ({ ...e, time }))}
                        />
                        <div className="flex gap-3">
                          {(['pickup', 'delivery'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setEdit((e) => ({ ...e, method: m }))}
                              className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold capitalize ${
                                edit.method === m
                                  ? 'border-[#C8431B] bg-white text-[#C8431B]'
                                  : 'border-[#E8D8C4] bg-white text-[#2B1D16]'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        {edit.method === 'delivery' && (
                          <LocationPicker
                            value={edit.address}
                            inputClass="w-full px-4 py-2.5 bg-white text-[#2B1D16] border border-[#E8D8C4] rounded-lg"
                            onChange={(address) => setEdit((e) => ({ ...e, address }))}
                          />
                        )}
                        <div className="flex gap-3">
                          <Button variant="outline" className={`${outlineBtn} flex-1`} onClick={() => setEditingId(null)} disabled={busy}>
                            Cancel
                          </Button>
                          <Button
                            className={`${solidBtn} flex-1`}
                            disabled={busy || !edit.time || (edit.method === 'delivery' && !edit.address)}
                            onClick={async () => {
                              if (
                                await run(
                                  () =>
                                    updateMealPlanDelivery(plan.id, {
                                      fulfillmentTime: edit.time,
                                      fulfillmentMethod: edit.method,
                                      deliveryAddress: edit.method === 'delivery' ? edit.address : null,
                                    }),
                                  'Delivery details updated.'
                                )
                              )
                                setEditingId(null);
                            }}
                          >
                            Save changes
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ACTIONS */}
                    {canChange && (
                      <>
                      <div className="flex flex-wrap gap-3 border-t border-[#E8D8C4] pt-6">
                        {state === 'active' && pausingId !== plan.id && (
                          <Button
                            variant="outline"
                            className={outlineBtn}
                            disabled={busy || daysBetween(today, plan.nextDate) < PAUSE_CUTOFF_DAYS}
                            title={daysBetween(today, plan.nextDate) < PAUSE_CUTOFF_DAYS ? 'Your next delivery is already being prepared. You can pause after it.' : undefined}
                            onClick={() => setPausingId(plan.id)}
                          >
                            <Pause className="size-4" /> Pause plan
                          </Button>
                        )}
                        {state === 'paused' && (
                          <Button
                            variant="outline"
                            className={outlineBtn}
                            disabled={busy}
                            onClick={() => run(() => resumeMealPlan(plan.id), 'Meal plan resumed.')}
                          >
                            <Play className="size-4" /> Resume plan
                          </Button>
                        )}
                        {state === 'active' && left.length > 0 && (
                          <Button
                            variant="outline"
                            className={outlineBtn}
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Skip your ${formatDate(plan.nextDate)} delivery? Your plan will end one delivery later instead.`))
                                void run(() => skipNextDelivery(plan.id), 'Next delivery skipped.');
                            }}
                          >
                            <SkipForward className="size-4" /> Skip next delivery
                          </Button>
                        )}
                        {(state === 'active' || state === 'paused') && !(renewingId === plan.id && renewFrom === 'actions') && (
                          <Button variant="outline" className={outlineBtn} onClick={() => { setRenewFrom('actions'); setRenewingId(plan.id); }}>
                            <RefreshCw className="size-4" /> Renew
                          </Button>
                        )}
                        {editingId !== plan.id && (
                          <Button
                            variant="outline"
                            className={outlineBtn}
                            onClick={() => {
                              setEditingId(plan.id);
                              setEdit({
                                time: (plan.time ?? '').slice(0, 5),
                                method: plan.method,
                                address: plan.method === 'delivery' ? (plan.address ?? '') : '',
                              });
                            }}
                          >
                            <Edit2 className="size-4" /> Change delivery
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          className="h-10 gap-2 rounded-lg"
                          disabled={busy || cancelling?.id === plan.id}
                          onClick={async () => {
                            const preview = await previewMealPlanCancellation(plan.id);
                            if (!preview.ok) {
                              setNotice({ kind: 'error', text: preview.error });
                              return;
                            }
                            setCancelling({ id: plan.id, refund: preview.refund, refunded: preview.refundedDeliveries, committed: preview.committedDeliveries });
                          }}
                        >
                          <X className="size-4" /> Cancel plan
                        </Button>
                      </div>
                      {renewingId === plan.id && renewFrom === 'actions' && renewPanel}
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </CustomerShell>
  );
}
