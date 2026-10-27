import type { Tab } from '../../app/tabs';
import { AccountsTab } from '../accounts/AccountsTab';
import { BackupPanel } from './BackupPanel';

/** Accounts, the merchants Maggie has learned, backups, and the way into the Guide. */
export function SettingsTab({ onOpen }: { onOpen: (tab: Tab) => void }) {
  return (
    <>
      <section className="panel">
        <button className="row-link" onClick={() => onOpen('guide')}>
          <span>📖 Guide</span>
          <span className="hint">How to use MagPie ›</span>
        </button>
      </section>
      <AccountsTab />
      <BackupPanel />
    </>
  );
}
