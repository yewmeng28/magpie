import type { PointerEvent } from 'react';
import type { LineSeries } from '../../domain/chartData';
import type { Cents } from '../../domain/types';
import { useWidth } from '../hooks';
import { compactMoney, monthName } from './format';

const HEIGHT = 220;
const TOP = 12;
const BOTTOM = 34;
const LEFT = 46;

/** Round tick spacing (1, 2, 2.5 or 5 × a power of ten) giving about four gridlines above zero, and at least $10. */
function ticks(max: Cents): Cents[] {
  const top = Math.max(max, 1000);
  const raw = top / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step);
}

interface Props {
  months: string[];
  series: LineSeries[];
  /** Index of the month being inspected, shared with the readout above the chart. */
  scrub: number | null;
  onScrub: (index: number | null) => void;
}

/**
 * Spending per month. 2px lines, hairline solid gridlines, a 10% wash under a single series, end dots with a
 * surface ring, and a crosshair that snaps to the nearest month while the chart is held or hovered.
 */
export function LineChart({ months, series, scrub, onScrub }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const single = series.length === 1;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const yTicks = ticks(max);
  const top = yTicks[yTicks.length - 1];
  const ends = series.map((s) => s.values[s.values.length - 1]);
  // Direct-label line ends (value for one line, emoji for up to four) unless the labels would collide.
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const y = (v: Cents) => TOP + plotHeight - (v / top) * plotHeight;
  const endYs = ends.map(y).sort((a, b) => a - b);
  const labelEnds = series.length <= 4 && endYs.every((v, i) => i === 0 || v - endYs[i - 1] >= 14);
  const right = labelEnds ? (single ? 52 : 30) : 14;
  const plotWidth = Math.max(10, width - LEFT - right);
  const x = (i: number) => LEFT + (months.length > 1 ? (i / (months.length - 1)) * plotWidth : plotWidth / 2);
  const every = plotWidth / months.length < 26 ? 2 : 1;
  // Label every month, or every other one ending on the latest; the year goes under the first label and each new year.
  const labelled = months.map((m, i) => ({ m, i })).filter(({ i }) => i % every === (months.length - 1) % every);
  const withYear = new Set(labelled.filter(({ m }, k) => k === 0 || m.slice(0, 4) !== labelled[k - 1].m.slice(0, 4)).map(({ m }) => m));

  function scrubAt(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (months.length - 1));
    onScrub(Math.max(0, Math.min(months.length - 1, i)));
  }

  const path = (values: Cents[]) => values.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div className="line-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`Monthly spending: ${series.map((s) => s.label).join(', ')}`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={LEFT + plotWidth} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={LEFT - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {compactMoney(t)}
              </text>
            </g>
          ))}
          {labelled.map(({ m, i }) => (
            <text key={m} x={x(i)} y={HEIGHT - BOTTOM + 16} className="tick" textAnchor="middle">
              {monthName(m)}
              {withYear.has(m) && (
                <tspan x={x(i)} dy={13} className="year">
                  {m.slice(0, 4)}
                </tspan>
              )}
            </text>
          ))}
          {single && <path d={`${path(series[0].values)} L ${x(months.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={series[0].color} opacity={0.1} />}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} className="series" />
          ))}
          {scrub !== null && <line x1={x(scrub)} x2={x(scrub)} y1={TOP} y2={TOP + plotHeight} className="crosshair" />}
          {series.map((s) => {
            const i = scrub ?? months.length - 1;
            return <circle key={s.key} cx={x(i)} cy={y(s.values[i])} r={4} fill={s.color} className="dot" />;
          })}
          {labelEnds &&
            series.map((s, k) => (
              <text key={s.key} x={x(months.length - 1) + 9} y={y(ends[k])} className="end-label" dominantBaseline="middle">
                {single ? compactMoney(ends[k]) : s.emoji}
              </text>
            ))}
          <rect
            x={LEFT}
            y={0}
            width={plotWidth}
            height={HEIGHT - BOTTOM}
            className="hit"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrubAt(e);
            }}
            onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && scrubAt(e)}
            onPointerUp={(e) => e.pointerType !== 'mouse' && onScrub(null)}
            onPointerCancel={() => onScrub(null)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && onScrub(null)}
          />
        </svg>
      )}
    </div>
  );
}
