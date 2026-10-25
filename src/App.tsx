import { useState } from 'react';
import { Mascot } from './app/Mascot';
import { TABS, type Tab } from './app/tabs';
import { GuideTab } from './features/guide/GuideTab';
import { ImportTab } from './features/import/ImportTab';
import { NestTab } from './features/nest/NestTab';
import { OwedTab } from './features/owed/OwedTab';
import { SpendingTab } from './features/spending/SpendingTab';
import { TrendsTab } from './features/trends/TrendsTab';

export default function App() {
  const [tab, setTab] = useState<Tab>('spending');
  // A new tab starts at its top, not wherever the last one was scrolled to.
  const open = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="app">
      <header className="title">
        <Mascot size={40} label="Maggie the magpie" />
        <h1>MagPie</h1>
      </header>
      <main>
        {tab === 'spending' && <SpendingTab />}
        {tab === 'trends' && <TrendsTab />}
        {tab === 'owed' && <OwedTab />}
        {tab === 'import' && <ImportTab />}
        {tab === 'nest' && <NestTab />}
        {tab === 'guide' && <GuideTab onOpen={open} />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => open(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
