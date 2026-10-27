import { useState } from 'react';
import { monthName } from '../../app/charts/format';
import { LineChart } from '../../app/charts/LineChart';
import { Sparkline } from '../../app/charts/Sparkline';
import { useCategories, useExpenses } from '../../data/RepoContext';
import { pickable } from '../../domain/categories';
import { categoryTrends, trendSeries, type LineSeries, type TrendView } from '../../domain/chartData';
import { addMonths, localDay, monthlyByCategory, monthsEnding } from '../../domain/expenses';
import { formatMoney } from '../../domain/money';
import type { Cents } from '../../domain/types';

const WINDOW = 12;

const monthLabel = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`;

export function TrendsTab() {
  const expenses = useExpenses();
  const categories = useCategories() ?? [];
  const thisMonth = localDay().slice(0, 7);
  const [view, setView] = useState<TrendView>('total');
  const [last, setLast] = useState(thisMonth);

  if (!expenses) return null;
  const months = monthsEnding(last, WINDOW);
  const monthly = monthlyByCategory(expenses, months);
  const series = trendSeries(monthly, categories, view, WINDOW);
  const next = addMonths(last, WINDOW);

  return (
    <>
      <section className="panel filters">
        <label className="field">
          Show
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="total">All spending</option>
            <option value="each">Each category</option>
            <optgroup label="One category">
              {pickable(categories, view).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
              {monthly.has(null) && <option value="none">❔ Uncategorised</option>}
            </optgroup>
          </select>
        </label>
        <div className="period">
          <button onClick={() => setLast(addMonths(last, -WINDOW))} aria-label="Previous 12 months">
            ‹
          </button>
          <strong>
            {monthLabel(months[0])} – {monthLabel(last)}
          </strong>
          <button onClick={() => setLast(next > thisMonth ? thisMonth : next)} disabled={last >= thisMonth} aria-label="Next 12 months">
            ›
          </button>
        </div>
      </section>
      {!series.some((s) => s.values.some((v) => v > 0)) ? (
        <p className="empty">No spending here in these months yet.</p>
      ) : view === 'each' ? (
        <section className="panel">
          <p className="hint">{monthLabel(last)}{last === thisMonth ? ' so far' : ''} against each category’s usual month. Tap one for its chart.</p>
          <ul className="category-trends">
            {categoryTrends(monthly, categories).map((t) => (
              <li key={t.key}>
                <button onClick={() => setView(t.key)}>
                  <span className="name">
                    {t.emoji} {t.label}
                  </span>
                  <Sparkline values={t.values} color={t.color} />
                  <span className="figures">
                    <strong>{formatMoney(t.latest)}</strong>
                    <Change now={t.latest} before={t.usual} against="usual" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <TrendPanel key={view} months={months} series={series} thisMonth={thisMonth} />
      )}
    </>
  );
}

/** "▲ 30% vs usual": spending up is flagged in the warning colour, down in the good one, with the arrow and words too. */
function Change({ now, before, against }: { now: Cents; before: Cents | null; against: string }) {
  if (!before) return <small className="change">new</small>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <small className="change">same as {against}</small>;
  return (
    <small className={pct > 0 ? 'change up' : 'change down'}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% vs {against}
    </small>
  );
}

function TrendPanel({ months, series, thisMonth }: { months: string[]; series: LineSeries[]; thisMonth: string }) {
  const [scrub, setScrub] = useState<number | null>(null);
  const totals = months.map((_, i) => series.reduce((t, s) => t + s.values[i], 0));
  // Average from the first month with spending, so a short history isn't diluted by empty months before it.
  const first = totals.findIndex((t) => t > 0);
  const counted = totals.slice(first);
  const average = Math.round(counted.reduce((t, v) => t + v, 0) / counted.length);
  const peak = totals.indexOf(Math.max(...totals));
  const shown = scrub ?? months.length - 1;
  const readout = series.map((s) => ({ s, value: s.values[shown] })).sort((a, b) => b.value - a.value);

  return (
    <>
      <div className="tiles">
        <div className="tile wide">
          <span>
            {monthLabel(months[months.length - 1])}
            {months[months.length - 1] === thisMonth && ' so far'}
          </span>
          <strong>{formatMoney(totals[totals.length - 1])}</strong>
          <Change now={totals[totals.length - 1]} before={totals[totals.length - 2] || null} against={monthName(months[months.length - 2])} />
        </div>
        <div className="tile">
          <span>Average a month</span>
          <strong>{formatMoney(average)}</strong>
        </div>
        <div className="tile">
          <span>Highest month</span>
          <strong>{formatMoney(totals[peak])}</strong>
          <small>{monthLabel(months[peak])}</small>
        </div>
      </div>

      <section className="panel">
        <div className="readout" aria-live="polite">
          <h3>
            {monthLabel(months[shown])}
            {months[shown] === thisMonth && ' so far'}
          </h3>
          <ul>
            {readout.map(({ s, value }) => (
              <li key={s.key}>
                <span className="key" style={{ background: s.color }} />
                <strong>{formatMoney(value)}</strong>
                <span>
                  {s.emoji} {s.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <LineChart months={months} series={series} scrub={scrub} onScrub={setScrub} />
        <p className="hint centre">Hold the chart and slide to see each month.</p>

        {series.length > 1 && (
          <ul className="line-legend" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key}>
                <span className="key" style={{ background: s.color }} />
                {s.emoji} {s.label}
              </li>
            ))}
          </ul>
        )}

        <details className="table-view">
          <summary>Show as a table</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  {series.map((s) => (
                    <th key={s.key} scope="col">
                      {s.emoji} {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m, i) => (
                  <tr key={m}>
                    <th scope="row">{monthLabel(m)}</th>
                    {series.map((s) => (
                      <td key={s.key}>{formatMoney(s.values[i])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}
