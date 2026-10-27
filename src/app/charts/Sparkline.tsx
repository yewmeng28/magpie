import type { Cents } from '../../domain/types';

const W = 96;
const H = 30;
const PAD = 4;

/** A small line of monthly values with the latest one marked: the shape, not the numbers (those sit beside it). */
export function Sparkline({ values, color }: { values: Cents[]; color: string }) {
  const max = Math.max(...values, 1);
  const x = (i: number) => PAD + (values.length > 1 ? (i / (values.length - 1)) * (W - 2 * PAD) : (W - 2 * PAD) / 2);
  const y = (v: Cents) => H - PAD - (v / max) * (H - 2 * PAD);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <polygon points={`${x(0)},${H - PAD} ${points} ${x(last)},${H - PAD}`} fill={color} opacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3} fill={color} />
    </svg>
  );
}
