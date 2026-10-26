import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockZoomWhenInstalled } from './standalone';

type Listener = (e: { touches?: unknown[]; preventDefault: () => void }) => void;

/** Just enough of window, navigator and document for lockZoomWhenInstalled, recording what it changes. */
function fakeBrowser({ standaloneDisplay = false, iosStandalone = false } = {}) {
  const meta = { content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' };
  const classes = new Set<string>();
  const listeners = new Map<string, { listener: Listener; options: unknown }>();
  vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: standaloneDisplay && q === '(display-mode: standalone)' }) });
  vi.stubGlobal('navigator', { standalone: iosStandalone });
  vi.stubGlobal('document', {
    querySelector: (selector: string) => (selector === 'meta[name="viewport"]' ? { setAttribute: (_: string, v: string) => (meta.content = v) } : null),
    documentElement: { classList: { add: (c: string) => classes.add(c) } },
    addEventListener: (type: string, listener: Listener, options: unknown) => listeners.set(type, { listener, options }),
  });
  return { meta, classes, listeners };
}

const event = (touches: number) => ({ touches: Array(touches).fill({}), preventDefault: vi.fn() });

afterEach(() => vi.unstubAllGlobals());

describe('lockZoomWhenInstalled', () => {
  it('leaves a browser tab zoomable', () => {
    const b = fakeBrowser();
    lockZoomWhenInstalled();
    expect(b.meta.content).not.toContain('user-scalable');
    expect(b.classes.size).toBe(0);
    expect(b.listeners.size).toBe(0);
  });

  it.each([
    ['an installed PWA', { standaloneDisplay: true }],
    ['an iOS Home Screen app', { iosStandalone: true }],
  ])('locks zoom in %s', (_, options) => {
    const b = fakeBrowser(options);
    lockZoomWhenInstalled();
    expect(b.meta.content).toBe('width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    expect(b.classes.has('installed')).toBe(true);
    for (const type of ['gesturestart', 'gesturechange', 'touchmove']) expect(b.listeners.get(type)?.options).toEqual({ passive: false });

    const pinch = event(0);
    b.listeners.get('gesturestart')!.listener(pinch);
    expect(pinch.preventDefault).toHaveBeenCalled();
  });

  it('only cancels two-finger moves, so scrolling and the charts still work', () => {
    const b = fakeBrowser({ iosStandalone: true });
    lockZoomWhenInstalled();
    const scroll = event(1);
    const twoFingers = event(2);
    b.listeners.get('touchmove')!.listener(scroll);
    b.listeners.get('touchmove')!.listener(twoFingers);
    expect(scroll.preventDefault).not.toHaveBeenCalled();
    expect(twoFingers.preventDefault).toHaveBeenCalled();
  });
});
