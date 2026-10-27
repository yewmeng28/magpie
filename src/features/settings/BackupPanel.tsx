import { useState, type ChangeEvent } from 'react';
import { exportBackup, useBackupState } from '../../app/backupState';
import { useExpenses, useRepos } from '../../data/RepoContext';
import { backupAge, parseBackup, type BackupFile } from '../../domain/backup';

/** Export everything to a JSON file, or replace everything from one, to move MagPie between browsers or devices. */
export function BackupPanel() {
  const repos = useRepos();
  const current = useExpenses()?.length ?? 0;
  const [message, setMessage] = useState('');
  // A checked backup waiting for the person to confirm replacing everything.
  const [pending, setPending] = useState<{ name: string; backup: BackupFile } | null>(null);

  const { last } = useBackupState();
  const [now] = useState(Date.now);

  const backUp = async () => {
    const { result, count } = await exportBackup(repos);
    if (result === 'saved') setMessage(`Backed up ${count} expenses.`);
  };

  const chooseBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage('');
    try {
      // Validate fully before asking: a broken file never gets as far as replacing anything.
      setPending({ name: file.name, backup: parseBackup(JSON.parse(await file.text())) });
    } catch (err) {
      setMessage(err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const replace = async () => {
    if (!pending) return;
    await repos.backup.importAll(pending.backup);
    setMessage(`Restored ${pending.backup.expenses.length} expenses.`);
    setPending(null);
  };

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className={last ? 'backup-age' : 'backup-age warn'}>
        {last ? `Last backed up ${backupAge(last, now)}` : 'Not backed up yet'}
      </p>
      <p className="hint">
        Everything lives in this browser only. A backup keeps it safe, and moves it to another phone or browser: restore
        it there. Save it to Files or send it to yourself. It holds your spending in plain text, so keep it private.
      </p>
      {pending ? (
        <div className="confirm" role="alertdialog" aria-labelledby="replace-title">
          <p id="replace-title">
            <strong>Replace everything with {pending.name}?</strong>
          </p>
          <p className="hint">
            The backup has {pending.backup.expenses.length} expenses. The {current} expenses in MagPie now, and its cards and
            learned merchants, will be replaced. This can’t be undone, so export a backup first if you might want them back.
          </p>
          <div className="actions">
            <button onClick={() => setPending(null)}>Cancel</button>
            <button className="danger-fill" onClick={replace}>
              Replace everything
            </button>
          </div>
        </div>
      ) : (
        <div className="actions start">
          <button className="primary" onClick={backUp}>
            Back up now
          </button>
          <label className="button">
            Restore backup
            <input type="file" accept="application/json,.json" hidden onChange={chooseBackup} />
          </label>
        </div>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
