import { useState } from 'react';
import { monthName } from '../../app/charts/format';
import { LineChart } from '../../app/charts/LineChart';
import { useCategories, useExpenses } from '../../data/RepoContext';
import { trendSeries, type LineSeries, type TrendView } from '../../domain/chartData';
import { addMonths, localDay, monthlyByCategory, monthsEnding } from '../../domain/expenses';
import { formatMoney } from '../../domain/money';

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
            <option value="each">Each category (one line each)</option>
            <optgroup label="One category">
              {categories.map((c) => (
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
      {series.some((s) => s.values.some((v) => v > 0)) ? (
        <TrendPanel key={view} months={months} series={series} thisMonth={thisMonth} />
      ) : (
        <p className="empty">No spending here in these months yet.</p>
      )}
    </>
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
    <section className="panel">
      <div className="tiles">
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
  );
}
