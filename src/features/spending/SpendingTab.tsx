import { useState } from 'react';
import { Donut } from '../../app/charts/Donut';
import { useLocalSetting } from '../../app/hooks';
import { useAccounts, useCategories, useExpenses } from '../../data/RepoContext';
import { describeCategory, donutSlices } from '../../domain/chartData';
import { byNewest, inPeriod, localDay, periodKey, totalsByCategory, totalSpent, type Period } from '../../domain/expenses';
import { formatMoney } from '../../domain/money';
import { myShare, outstanding, owedSummary } from '../../domain/split';
import type { Expense } from '../../domain/types';
import { ExpenseSheet } from '../expense/ExpenseSheet';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

const VIEWS = ['pie', 'bars'] as const;

/** Move a YYYY-MM-DD anchor by one period. Months clamp to day 1 so 31 Jan + 1 month doesn't skip February. */
function shift(anchor: string, period: Period, by: number): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const date = period === 'day' ? new Date(y, m - 1, d + by) : period === 'month' ? new Date(y, m - 1 + by, 1) : new Date(y + by, 0, 1);
  return localDay(date);
}

function label(key: string, period: Period): string {
  const [y, m, d] = key.split('-').map(Number);
  if (period === 'year') return key;
  if (period === 'month') return new Date(y, m - 1, 1).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Sep", "2025" or "the day before", for "8% less than …". */
function shortLabel(key: string, period: Period): string {
  if (period === 'year') return key;
  if (period === 'day') return 'the day before';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-SG', { month: 'short' });
}

function dayHeading(day: string): string {
  if (day === localDay()) return 'Today';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
}

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** The categories a filter covers: one, or every member of the grey "Everything else" slice. */
interface Filter {
  label: string;
  categoryIds: (string | null)[];
}

interface Props {
  initialDay: string;
  onAdd: () => void;
  onImport: () => void;
}

export function SpendingTab({ initialDay, onAdd, onImport }: Props) {
  const expenses = useExpenses();
  const categories = useCategories() ?? [];
  const accounts = useAccounts() ?? [];
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(initialDay);
  const [accountId, setAccountId] = useState('');
  const [view, setView] = useLocalSetting<(typeof VIEWS)[number]>('magpie:chart', 'pie', VIEWS);
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);

  if (!expenses) return null;
  const forAccount = expenses.filter((e) => !accountId || e.accountId === accountId);
  const key = periodKey(anchor, period);
  const shown = inPeriod(forAccount, period, key).sort(byNewest);
  const totals = totalsByCategory(shown);
  const total = totalSpent(shown);
  const slices = donutSlices(totals, categories);
  const previousKey = periodKey(shift(anchor, period, -1), period);
  const previous = totalSpent(inPeriod(forAccount, period, previousKey));
  const owed = owedSummary(expenses);
  const owedToYou = owed.lent - owed.repaid;
  const listed = filter ? shown.filter((e) => filter.categoryIds.includes(e.categoryId)) : shown;
  // When this period is empty, offer the latest period that isn't.
  const latest = shown.length ? undefined : forAccount.reduce<string | undefined>((max, e) => (!max || e.date > max ? e.date : max), undefined);

  const move = (to: string) => {
    setAnchor(to);
    setFilter(null);
    setActive(null);
  };
  const pick = (next: Filter) => setFilter(filter?.label === next.label ? null : next);
  const pickSlice = (key: string) => {
    const slice = slices.find((s) => s.key === key);
    if (slice) pick({ label: slice.label, categoryIds: slice.members.map((m) => m.categoryId) });
  };

  const byDay = new Map<string, Expense[]>();
  for (const e of listed) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <>
      <div className="controls">
        <button className="step" onClick={() => move(shift(anchor, period, -1))} aria-label={`Previous ${period}`}>
          ‹
        </button>
        <strong className="period-label">{label(key, period)}</strong>
        <button className="step" onClick={() => move(shift(anchor, period, 1))} aria-label={`Next ${period}`}>
          ›
        </button>
        <select
          className="chip"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as Period);
            setFilter(null);
          }}
          aria-label="Period"
        >
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="chip" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="">All cards</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <p className="summary">
        <strong>{formatMoney(total)}</strong> spent
        {owedToYou > 0 && (
          <>
            {' '}· <span className="owed-total">{formatMoney(owedToYou)} owed to you</span>
          </>
        )}
        {previous > 0 && total > 0 && (
          <>
            {' '}·{' '}
            <span className={total <= previous ? 'down' : 'up'}>
              {total <= previous ? '▼' : '▲'} {percent(Math.abs(total - previous), previous)} vs {shortLabel(previousKey, period)}
            </span>
          </>
        )}
      </p>

      {!shown.length ? (
        <section className="panel empty-state">
          <p>Nothing shiny here yet.</p>
          <div className="actions centre">
            <button className="primary" onClick={onAdd}>
              Add expense
            </button>
            <button onClick={onImport}>Import a statement</button>
          </div>
          {latest && (
            <button className="row-link" onClick={() => move(latest)}>
              <span>Last spending: {label(periodKey(latest, period), period)}</span>
              <span>Go ›</span>
            </button>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>By category</h2>
            <div className="segmented small" role="radiogroup" aria-label="Chart">
              {VIEWS.map((v) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}>
                  {v === 'bars' ? 'Bars' : 'Pie'}
                </button>
              ))}
            </div>
          </div>
          {view === 'bars' ? (
            <ul className="totals">
              {totals.map((t) => {
                const c = describeCategory(categories, t.categoryId);
                return (
                  <li key={t.categoryId ?? 'none'}>
                    <button
                      aria-pressed={filter?.label === c.label}
                      onClick={() => pick({ label: c.label, categoryIds: [t.categoryId] })}
                    >
                      <span className="name">
                        {c.emoji} {c.label}
                      </span>
                      <span className="track">
                        <span className="bar" style={{ width: `${(t.total / totals[0].total) * 100}%`, background: c.color }} />
                      </span>
                      <span className="amount">{formatMoney(t.total)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <Donut slices={slices} total={total} caption={label(key, period)} active={active} onActive={setActive} onSelect={pickSlice} />
              <p className="hint centre">Hold a slice to see it; tap one to list its expenses.</p>
              <ul className="legend">
                {slices.map((s) => (
                  <li key={s.key}>
                    <button
                      aria-pressed={filter?.label === s.label}
                      onMouseEnter={() => setActive(s.key)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(s.key)}
                      onBlur={() => setActive(null)}
                      onClick={() => pickSlice(s.key)}
                    >
                      <span className="swatch" style={{ background: s.color }} />
                      <span className="name">
                        {s.emoji} {s.label}
                      </span>
                      <span className="amount">{formatMoney(s.value)}</span>
                      <span className="pct">{percent(s.value, total)}</span>
                    </button>
                    {s.members.length > 1 && (
                      <ul className="members">
                        {s.members.map((m) => (
                          <li key={m.categoryId ?? 'none'}>
                            <span className="name">
                              {m.emoji} {m.label}
                            </span>
                            <span className="amount">{formatMoney(m.value)}</span>
                            <span className="pct">{percent(m.value, total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {filter && (
        <div className="filter-row">
          <button className="chip active" onClick={() => setFilter(null)} aria-label={`Show all categories, not just ${filter.label}`}>
            {filter.label} <span aria-hidden>×</span>
          </button>
          <span className="hint">{formatMoney(totalSpent(listed))}</span>
        </div>
      )}

      {[...byDay].map(([day, list]) => (
        <section key={day} className="day">
          <h3 className="day-head">
            <span>{dayHeading(day)}</span>
            <span>{formatMoney(totalSpent(list))}</span>
          </h3>
          <ul className="expenses">
            {list.map((e) => {
              const c = describeCategory(categories, e.categoryId);
              const mine = myShare(e);
              const owedHere = e.split?.shares.reduce((t, s) => t + outstanding(s), 0) ?? 0;
              const details = [accounts.find((a) => a.id === e.accountId)?.name ?? 'No card', e.note].filter(Boolean);
              return (
                <li key={e.id}>
                  <button className="expense-row" onClick={() => setEditing(e)}>
                    <span className="badge" style={{ background: `color-mix(in srgb, ${c.color} 30%, transparent)` }} aria-hidden>
                      {c.emoji}
                    </span>
                    <span className="merchant">
                      {e.merchant}
                      <small>
                        {details.join(' · ')}
                        {e.split && <span className="split-tag"> · Split</span>}
                      </small>
                    </span>
                    <span className="amount-col">
                      <span className={mine < 0 ? 'amount refund' : 'amount'}>{formatMoney(mine, e.currency)}</span>
                      {owedHere > 0 && <small className="owed">+{formatMoney(owedHere, e.currency)} owed</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && <ExpenseSheet expense={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
