import { formatMoney } from '../domain/money';
import type { Cents } from '../domain/types';

/** How much of what was lent has come back. The track is a darker step of the fill's own blue, so it reads as one bar. */
export function Meter({ value, max, label }: { value: Cents; max: Cents; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${formatMoney(value)} of ${formatMoney(max)} paid back`}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
