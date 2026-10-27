export type Tab = 'spending' | 'trends' | 'owed' | 'settings' | 'import' | 'guide';

/** Screens reached from the tab bar. Import sits behind the centre + and the Guide inside Settings. */
export type BarTab = 'spending' | 'trends' | 'owed' | 'settings';

// Labels are single words so none can wrap onto two lines in the tab bar.
export const BAR_TABS: { id: BarTab; label: string }[] = [
  { id: 'spending', label: 'Spending' },
  { id: 'trends', label: 'Trends' },
  { id: 'owed', label: 'Owed' },
  { id: 'settings', label: 'Settings' },
];

export const TITLES: Record<Tab, string> = {
  spending: 'Spending',
  trends: 'Trends',
  owed: 'Owed',
  settings: 'Settings',
  import: 'Import',
  guide: 'Guide',
};
