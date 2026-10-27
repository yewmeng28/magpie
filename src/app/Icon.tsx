const PATHS = {
  spending: (filled: boolean) => (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" fill={filled ? 'currentColor' : 'none'} />
      <path d="M14.5 2.6A8.6 8.6 0 0 1 21.4 9.5h-6.9z" />
    </>
  ),
  trends: () => (
    <>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </>
  ),
  owed: (filled: boolean) => (
    <>
      <circle cx="9" cy="8" r="3.2" fill={filled ? 'currentColor' : 'none'} />
      <path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.6 14.3c2.3.3 4.2 1.9 4.9 4.7" />
    </>
  ),
  settings: (filled: boolean) => (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2.4" fill={filled ? 'currentColor' : 'var(--surface)'} />
      <circle cx="15" cy="17" r="2.4" fill={filled ? 'currentColor' : 'var(--surface)'} />
    </>
  ),
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

/** Line icons for the tab bar; `filled` marks the current tab by shape as well as colour. */
export function Icon({ name, filled = false, size = 24 }: { name: IconName; filled?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name](filled)}
    </svg>
  );
}
