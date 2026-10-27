import { useEffect, useState } from 'react';
import { Icon } from './app/Icon';
import { Mascot } from './app/Mascot';
import { BAR_TABS, TITLES, type BarTab, type Tab } from './app/tabs';
import { useToast } from './app/toast';
import { useRepos } from './data/RepoContext';
import { localDay } from './domain/expenses';
import { ExpenseSheet } from './features/expense/ExpenseSheet';
import { GuideTab } from './features/guide/GuideTab';
import { ImportTab } from './features/import/ImportTab';
import { OwedTab } from './features/owed/OwedTab';
import { SettingsTab } from './features/settings/SettingsTab';
import { SpendingTab } from './features/spending/SpendingTab';
import { TrendsTab } from './features/trends/TrendsTab';

/** Where the back button goes from screens outside the tab bar. */
const PARENT: Partial<Record<Tab, BarTab>> = { import: 'spending', guide: 'settings' };

export default function App() {
  const [tab, setTab] = useState<Tab>('spending');
  const [addMenu, setAddMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  // The day Spending opens on; an import moves it to the statement's latest month.
  const [spendingDay, setSpendingDay] = useState(localDay());
  // The Guide topic to open on, when a screen sends you to one.
  const [guideTopic, setGuideTopic] = useState<string>();
  const repos = useRepos();
  const toast = useToast();

  // Add recurring payments that have come due: on opening, and on coming back to an app left open overnight.
  useEffect(() => {
    const catchUp = async () => {
      const added = await repos.recurring.catchUp(localDay());
      if (added) toast(`Added ${added} recurring payment${added === 1 ? '' : 's'}.`);
    };
    void catchUp();
    const onVisible = () => document.visibilityState === 'visible' && void catchUp();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [repos, toast]);

  // A new screen starts at its top, not wherever the last one was scrolled to.
  const open = (next: Tab, topic?: string) => {
    setGuideTopic(topic);
    setTab(next);
    setAddMenu(false);
    window.scrollTo({ top: 0 });
  };
  const parent = PARENT[tab];

  return (
    <div className="app">
      <header className="title">
        {parent && (
          <button className="back" onClick={() => open(parent)}>
            ‹ {TITLES[parent]}
          </button>
        )}
        <h1>{TITLES[tab]}</h1>
        {tab === 'spending' && <Mascot size={36} label="Maggie the magpie" />}
      </header>
      <main>
        {tab === 'spending' && (
          <SpendingTab
            key={spendingDay}
            initialDay={spendingDay}
            onAdd={() => setAdding(true)}
            onImport={() => open('import')}
            onCards={() => open('settings')}
            onInstallHelp={() => open('guide', 'install')}
          />
        )}
        {tab === 'trends' && <TrendsTab />}
        {tab === 'owed' && <OwedTab />}
        {tab === 'import' && (
          <ImportTab
            onImported={(day) => {
              setSpendingDay(day);
              open('spending');
            }}
          />
        )}
        {tab === 'settings' && <SettingsTab onOpen={open} />}
        {tab === 'guide' && <GuideTab onOpen={open} topic={guideTopic} />}
      </main>

      {addMenu && (
        <div className="add-menu-backdrop" onClick={() => setAddMenu(false)}>
          <div className="add-menu" role="menu" aria-label="Add" onClick={(e) => e.stopPropagation()}>
            <button
              role="menuitem"
              onClick={() => {
                setAddMenu(false);
                setAdding(true);
              }}
            >
              <span aria-hidden>🪙</span> Add expense
            </button>
            <button role="menuitem" onClick={() => open('import')}>
              <span aria-hidden>📄</span> Import a statement
            </button>
          </div>
        </div>
      )}

      <nav className="tabs">
        {BAR_TABS.slice(0, 2).map((t) => (
          <TabButton key={t.id} tab={t} current={tab === t.id || PARENT[tab] === t.id} onOpen={open} />
        ))}
        <button className="add" aria-label="Add" aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}>
          <Icon name="plus" size={28} />
        </button>
        {BAR_TABS.slice(2).map((t) => (
          <TabButton key={t.id} tab={t} current={tab === t.id || PARENT[tab] === t.id} onOpen={open} />
        ))}
      </nav>

      {adding && <ExpenseSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function TabButton({ tab, current, onOpen }: { tab: { id: BarTab; label: string }; current: boolean; onOpen: (tab: Tab) => void }) {
  return (
    <button aria-current={current ? 'page' : undefined} onClick={() => onOpen(tab.id)}>
      <Icon name={tab.id} filled={current} />
      {tab.label}
    </button>
  );
}
