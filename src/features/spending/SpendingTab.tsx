import { useState } from 'react';
import { Donut } from '../../app/charts/Donut';
import { useLocalSetting } from '../../app/hooks';
import { useAccounts, useCategories, useExpenses } from '../../data/RepoContext';
import { describeCategory, donutSlices } from '../../domain/chartData';
import { byNewest, inPeriod, localDay, periodKey, totalsByCategory, totalSpent, type Period } from '../../domain/expenses';
import { formatMoney } from '../../domain/money';
import { myShare, outstanding } from '../../domain/split';
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

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

export function SpendingTab() {
  const expenses = useExpenses();
  const categories = useCategories() ?? [];
  const accounts = useAccounts() ?? [];
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(localDay());
  const [accountId, setAccountId] = useState('');
  const [view, setView] = useLocalSetting<(typeof VIEWS)[number]>('magpie:chart', 'pie', VIEWS);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);

  if (!expenses) return null;
  const key = periodKey(anchor, period);
  const shown = inPeriod(expenses, period, key)
    .filter((e) => !accountId || e.accountId === accountId)
    .sort(byNewest);
  const totals = totalsByCategory(shown);
  const total = totalSpent(shown);
  const slices = donutSlices(totals, categories);

  const byDay = new Map<string, Expense[]>();
  for (const e of shown) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <>
      <section className="panel filters">
        <div className="segmented" role="radiogroup" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} role="radio" aria-checked={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="period">
          <button onClick={() => setAnchor(shift(anchor, period, -1))} aria-label={`Previous ${period}`}>
            ‹
          </button>
          <strong>{label(key, period)}</strong>
          <button onClick={() => setAnchor(shift(anchor, period, 1))} aria-label={`Next ${period}`}>
            ›
          </button>
        </div>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>By category</h2>
          <div className="segmented small" role="radiogroup" aria-label="Chart">
            {VIEWS.map((v) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}>
                {v === 'pie' ? 'Pie' : 'Bars'}
              </button>
            ))}
          </div>
        </div>
        {!totals.length ? (
          <p className="empty">Nothing shiny here yet. Import a statement, or tap + to add an expense.</p>
        ) : view === 'bars' ? (
          <>
            <p className="hero">{formatMoney(total)}</p>
            <ul className="totals">
              {totals.map((t) => {
                const c = describeCategory(categories, t.categoryId);
                return (
                  <li key={t.categoryId ?? 'none'}>
                    <span className="name">
                      {c.emoji} {c.label}
                    </span>
                    <span className="track">
                      <span className="bar" style={{ width: `${(t.total / totals[0].total) * 100}%`, background: c.color }} />
                    </span>
                    <span className="amount">{formatMoney(t.total)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <Donut slices={slices} total={total} caption={label(key, period)} active={active} onActive={setActive} />
            <p className="hint centre">Hold a slice to see it in the middle.</p>
            <ul className="legend">
              {slices.map((s) => (
                <li key={s.key}>
                  <button
                    aria-pressed={active === s.key}
                    onMouseEnter={() => setActive(s.key)}
                    onMouseLeave={() => setActive(null)}
                    // A tap focuses then clicks, so both just select; moving focus away (or the mouse) clears it.
                    onFocus={() => setActive(s.key)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(s.key)}
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

      {[...byDay].map(([day, list]) => (
        <section className="panel" key={day}>
          <h3 className="day-head">
            <span>{label(day, 'day')}</span>
            <span>{formatMoney(totalSpent(list))}</span>
          </h3>
          <ul className="expenses">
            {list.map((e) => {
              const c = describeCategory(categories, e.categoryId);
              const mine = myShare(e);
              const owed = e.split?.shares.reduce((t, s) => t + outstanding(s), 0) ?? 0;
              const details = [
                accounts.find((a) => a.id === e.accountId)?.name ?? 'No account',
                e.split && `split, ${formatMoney(e.amount, e.currency)} in total`,
                e.note,
              ].filter(Boolean);
              return (
                <li key={e.id}>
                  <button className="expense-row" onClick={() => setEditing(e)}>
                    <span className="emoji" aria-hidden>
                      {c.emoji}
                    </span>
                    <span className="merchant">
                      {e.merchant}
                      <small>{details.join(' · ')}</small>
                    </span>
                    <span className="amount-col">
                      <span className={mine < 0 ? 'amount refund' : 'amount'}>{formatMoney(mine, e.currency)}</span>
                      {owed > 0 && <small className="owed">+{formatMoney(owed, e.currency)} owed</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="fab-space" />

      <button className="fab" aria-label="Add expense" onClick={() => setEditing('new')}>
        +
      </button>
      {editing && (
        <ExpenseSheet
          expense={editing === 'new' ? undefined : editing}
          date={period === 'day' ? anchor : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
