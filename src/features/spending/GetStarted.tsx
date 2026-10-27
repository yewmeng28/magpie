import { useState } from 'react';
import { exportBackup, snoozeBackup, useBackupState } from '../../app/backupState';
import { useLocalSetting } from '../../app/hooks';
import { Mascot } from '../../app/Mascot';
import { isInstalled } from '../../app/standalone';
import { useToast } from '../../app/toast';
import { useRepos } from '../../data/RepoContext';
import { backupAge, backupDue } from '../../domain/backup';

interface Props {
  expenses: number;
  onAdd: () => void;
  onImport: () => void;
  onCards: () => void;
  onInstallHelp: () => void;
}

/**
 * What to do first, ticked off as it's done: something to show, your cards, and the Home Screen (which also keeps
 * iPhone from clearing MagPie's data). Can be hidden; once it's gone, the monthly backup reminder takes its place.
 */
export function StartOrBackup(props: Props) {
  const [card, setCard] = useLocalSetting('magpie:start', 'open', ['open', 'hidden'] as const);
  const [cardsChecked, setCardsChecked] = useLocalSetting('magpie:start:cards', 'no', ['no', 'yes'] as const);
  const steps = [
    { done: props.expenses > 0, label: 'Add your first expense, or import a statement' },
    { done: cardsChecked === 'yes', label: 'Check your cards, so imports know them' },
    { done: isInstalled(), label: 'Add MagPie to your Home Screen' },
  ];
  if (card === 'open' && steps.some((s) => !s.done)) {
    return (
      <section className="panel get-started" aria-label="Get started">
        <div className="get-started-head">
          <Mascot size={44} />
          <div>
            <h2>Get started</h2>
            <p className="hint">Three things, and Maggie’s ready to sort your coins.</p>
          </div>
          <button className="icon" aria-label="Hide Get started" onClick={() => setCard('hidden')}>
            ×
          </button>
        </div>
        <ol className="start-steps">
          {steps.map((s, i) => (
            <li key={s.label} className={s.done ? 'done' : undefined}>
              <span className="tick" aria-hidden>
                {s.done ? '✓' : i + 1}
              </span>
              <span className="label">
                {s.label}
                {s.done && <span className="visually-hidden"> (done)</span>}
              </span>
              {!s.done && i === 0 && (
                <span className="step-actions">
                  <button className="primary" onClick={props.onAdd}>
                    Add
                  </button>
                  <button onClick={props.onImport}>Import</button>
                </span>
              )}
              {!s.done && i === 1 && (
                <button
                  onClick={() => {
                    setCardsChecked('yes');
                    props.onCards();
                  }}
                >
                  Cards
                </button>
              )}
              {!s.done && i === 2 && <button onClick={props.onInstallHelp}>How</button>}
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return <BackupReminder expenses={props.expenses} />;
}

function BackupReminder({ expenses }: { expenses: number }) {
  const repos = useRepos();
  const toast = useToast();
  const state = useBackupState();
  const [now] = useState(Date.now);
  if (!backupDue(state, expenses, now)) return null;
  return (
    <section className="note warn backup-note" aria-label="Backup reminder">
      <span aria-hidden>💾</span>
      <span className="label">
        {state.last ? `Last backed up ${backupAge(state.last, now)}.` : 'Not backed up yet.'} Everything lives only on
        this phone.
      </span>
      <span className="step-actions">
        <button className="text-button" onClick={() => snoozeBackup()}>
          Later
        </button>
        <button
          className="primary"
          onClick={async () => {
            const { result, count } = await exportBackup(repos);
            if (result === 'saved') toast(`Backed up ${count} expenses.`);
          }}
        >
          Back up
        </button>
      </span>
    </section>
  );
}
