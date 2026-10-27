import { useState } from 'react';
import { readPayNow, savePayNow } from '../../app/payNow';
import type { Tab } from '../../app/tabs';
import { AccountsTab } from '../accounts/AccountsTab';
import { BackupPanel } from './BackupPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { LearnedMerchants } from './LearnedMerchants';
import { RecentImports } from './RecentImports';
import { RecurringPanel } from './RecurringPanel';

/** Categories, cards, the merchants Maggie has learned, backups, and the way into the Guide. */
export function SettingsTab({ onOpen }: { onOpen: (tab: Tab) => void }) {
  return (
    <>
      <section className="panel">
        <button className="row-link" onClick={() => onOpen('guide')}>
          <span>📖 Guide</span>
          <span className="hint">How to use MagPie ›</span>
        </button>
      </section>
      <BackupPanel />
      <CategoriesPanel />
      <AccountsTab />
      <LearnedMerchants />
      <RecurringPanel />
      <PayNowPanel />
      <RecentImports />
    </>
  );
}

/** The PayNow number reminders from Owed ask people to pay to. */
function PayNowPanel() {
  const [value, setValue] = useState(readPayNow);
  return (
    <section className="panel">
      <label className="field">
        Your PayNow number
        <input
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            savePayNow(e.target.value);
          }}
          placeholder="e.g. 9123 4567, or a UEN"
        />
      </label>
      <p className="hint">Added to the reminders you send from Owed. It stays on this phone and isn’t in backups.</p>
    </section>
  );
}
