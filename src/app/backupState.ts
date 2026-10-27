import { useSyncExternalStore } from 'react';
import type { Repositories } from '../data/repositories';
import { backupFileName, SNOOZE_DAYS } from '../domain/backup';

// When this browser last exported a backup, and when a "Later" on the reminder runs out. Kept in this browser:
// they describe this copy of the data, so a restored backup shouldn't carry them.
const LAST = 'magpie:lastBackup';
const SNOOZE = 'magpie:backupSnooze';
const CHANGED = 'magpie:backup';

const read = (key: string): number | null => {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable: the reminder just shows again */
  }
  window.dispatchEvent(new Event(CHANGED));
};

let cached = { last: read(LAST), snoozedUntil: read(SNOOZE) };
const subscribe = (onChange: () => void) => {
  const update = () => {
    cached = { last: read(LAST), snoozedUntil: read(SNOOZE) };
    onChange();
  };
  window.addEventListener(CHANGED, update);
  return () => window.removeEventListener(CHANGED, update);
};

/** The backup state, updating when a backup is made or the reminder snoozed anywhere in the app. */
export const useBackupState = () => useSyncExternalStore(subscribe, () => cached, () => cached);

export const snoozeBackup = (now = Date.now()) => write(SNOOZE, now + SNOOZE_DAYS * 24 * 60 * 60 * 1000);

/**
 * Export everything. On a phone this opens the share sheet (Save to Files, AirDrop, a chat), which is the only
 * dependable way to save a file from a Home Screen app on iPhone; elsewhere the file downloads.
 */
export async function exportBackup(repos: Repositories): Promise<{ result: 'saved' | 'cancelled'; count: number }> {
  const backup = await repos.backup.exportAll();
  const name = backupFileName(new Date());
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { result: 'cancelled', count: backup.expenses.length };
      download(file);
    }
  } else {
    download(file);
  }
  write(LAST, Date.now());
  return { result: 'saved', count: backup.expenses.length };
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
