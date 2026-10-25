export type Tab = 'spending' | 'trends' | 'owed' | 'import' | 'nest' | 'guide';

// Labels are single words so none can wrap onto two lines in the tab bar.
export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'spending', label: 'Spending', icon: '🥧' },
  { id: 'trends', label: 'Trends', icon: '📈' },
  { id: 'owed', label: 'Owed', icon: '🤝' },
  { id: 'import', label: 'Import', icon: '📄' },
  { id: 'nest', label: 'Nest', icon: '🪺' },
  { id: 'guide', label: 'Guide', icon: '📖' },
];
