import { Mascot } from '../../app/Mascot';
import { AccountsTab } from '../accounts/AccountsTab';
import { BackupPanel } from './BackupPanel';

/** Maggie's nest: accounts, the merchants she has learned, and backups. */
export function NestTab() {
  return (
    <>
      <div className="nest-intro">
        <Mascot size={56} label="Maggie the magpie" />
        <p className="hint">Maggie’s nest: your accounts, the merchants she has learned, and backups.</p>
      </div>
      <AccountsTab />
      <BackupPanel />
    </>
  );
}
