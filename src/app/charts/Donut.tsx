import { useRef, type PointerEvent } from 'react';
import type { Slice } from '../../domain/chartData';
import { formatMoney } from '../../domain/money';
import type { Cents } from '../../domain/types';

const SIZE = 200;
const C = SIZE / 2;
const OUTER = 92;
const INNER = 60;
const LIFT = 5;
const TAU = 2 * Math.PI;

/** A point at radius r and angle a, measured clockwise from 12 o'clock. */
const at = (r: number, a: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;

/** An annular sector from angle `start` to `end`. A full circle needs two half arcs (and evenodd to cut the hole). */
function sector(start: number, end: number, outer: number): string {
  if (end - start >= TAU - 1e-6) {
    return [
      `M ${at(outer, 0)} A ${outer} ${outer} 0 1 1 ${at(outer, Math.PI)} A ${outer} ${outer} 0 1 1 ${at(outer, 0)} Z`,
      `M ${at(INNER, 0)} A ${INNER} ${INNER} 0 1 0 ${at(INNER, Math.PI)} A ${INNER} ${INNER} 0 1 0 ${at(INNER, 0)} Z`,
    ].join(' ');
  }
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${at(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${at(outer, end)} L ${at(INNER, end)} A ${INNER} ${INNER} 0 ${large} 0 ${at(INNER, start)} Z`;
}

interface Props {
  slices: Slice[];
  total: Cents;
  /** Shown in the middle when no slice is held, under the total. */
  caption: string;
  active: string | null;
  onActive: (key: string | null) => void;
}

/**
 * Part-to-whole donut. Press and hold (or hover) a slice to show its details in the middle; move the finger around the
 * ring to scrub between slices. A 2px surface-coloured gap separates the slices.
 */
export function Donut({ slices, total, caption, active, onActive }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const arcs = slices.reduce<{ slice: Slice; start: number; end: number }[]>((list, slice) => {
    const start = list.length ? list[list.length - 1].end : 0;
    return [...list, { slice, start, end: start + (slice.value / total) * TAU }];
  }, []);
  const current = arcs.find((a) => a.slice.key === active)?.slice;

  /** Which slice is under the pointer: worked out from the angle, so the finger never has to land on a thin slice. */
  function pick(e: PointerEvent): string | null {
    const rect = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE - C;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE - C;
    const r = Math.hypot(x, y);
    if (r < INNER - 16 || r > OUTER + 24) return null;
    const a = (Math.atan2(x, -y) + TAU) % TAU;
    return arcs.find((arc) => a >= arc.start && a < arc.end)?.slice.key ?? null;
  }

  const describe = slices.map((s) => `${s.label} ${formatMoney(s.value)} (${Math.round((s.value / total) * 100)}%)`).join(', ');

  return (
    <div className="donut" onContextMenu={(e) => e.preventDefault()}>
      <svg
        ref={ref}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Spending by category: ${describe}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onActive(pick(e));
        }}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && onActive(pick(e))}
        onPointerUp={(e) => e.pointerType !== 'mouse' && onActive(null)}
        onPointerCancel={() => onActive(null)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onActive(null)}
      >
        {arcs.map(({ slice, start, end }) => (
          <path
            key={slice.key}
            d={sector(start, end, slice.key === active ? OUTER + LIFT : OUTER)}
            fill={slice.color}
            fillRule="evenodd"
            className="slice"
          />
        ))}
      </svg>
      <div className="donut-centre" aria-live="polite">
        {current ? (
          <>
            <strong>{formatMoney(current.value)}</strong>
            <span>
              {current.emoji} {current.label}
            </span>
            <small>{Math.round((current.value / total) * 100)}% of spending</small>
          </>
        ) : (
          <>
            <strong>{formatMoney(total)}</strong>
            <small>{caption}</small>
          </>
        )}
      </div>
    </div>
  );
}
