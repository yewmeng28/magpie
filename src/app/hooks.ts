import { useEffect, useRef, useState, type RefObject } from 'react';

/** State remembered in this browser (e.g. bars vs pie). Storage can be unavailable; the setting then just isn't kept. */
export function useLocalSetting<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored && allowed.includes(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* storage unavailable: the choice just won't be remembered */
    }
  };
  return [value, set];
}

/** The rendered width of an element, kept up to date as it resizes. */
export function useWidth<E extends HTMLElement>(): [RefObject<E | null>, number] {
  const ref = useRef<E>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
