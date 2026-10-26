/** Whether MagPie runs as the installed app (added to the Home Screen, or installed from the browser). */
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * In the installed app, turn off pinch and double-tap zoom so it behaves like a native app; in a browser tab, zoom
 * keeps working. The viewport lock covers Android and stops iOS zooming into a focused field, but iOS ignores it for
 * pinches (since iOS 10), so its own gesture events and two-finger moves are cancelled too. Double-tap zoom is
 * switched off by the `installed` class (touch-action in index.css).
 */
export function lockZoomWhenInstalled() {
  if (!isInstalled()) return;
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  document.documentElement.classList.add('installed');
  const cancel = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', cancel, { passive: false });
  document.addEventListener('gesturechange', cancel, { passive: false });
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
}
