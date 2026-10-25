import { useState, type ChangeEvent } from 'react';
import { useRepos } from '../../data/RepoContext';
import { backupFileName, parseBackup } from '../../domain/backup';

/** Export everything to a JSON file, or replace everything from one, to move MagPie between browsers or devices. */
export function BackupPanel() {
  const repos = useRepos();
  const [message, setMessage] = useState('');

  const exportBackup = async () => {
    const backup = await repos.backup.exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(new Date());
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${backup.expenses.length} expenses.`);
  };

  const importBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !window.confirm('Replace everything in MagPie with this backup?')) return;
    try {
      // Validate fully before importAll, which clears existing data first.
      const backup = parseBackup(JSON.parse(await file.text()));
      await repos.backup.importAll(backup);
      setMessage(`Restored ${backup.expenses.length} expenses.`);
    } catch (err) {
      setMessage(err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="hint">
        Everything lives in this browser only. Export a backup to move it to another device or browser, then restore it
        there. The file holds your spending in plain text, so keep it somewhere private.
      </p>
      <div className="actions start">
        <button onClick={exportBackup}>Export backup</button>
        <label className="button">
          Restore backup
          <input type="file" accept="application/json,.json" hidden onChange={importBackup} />
        </label>
      </div>
      {message && <p className="hint" role="status">{message}</p>}
    </section>
  );
}
