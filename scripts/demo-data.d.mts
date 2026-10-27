import type { BackupFile } from '../src/domain/backup';
import type { ImportFile } from '../src/domain/importFile';

/** A MagPie backup holding the demo data, with dates ending on `now`. */
export function demoBackup(now?: Date): BackupFile;

/** Last month's HSBC statement in MagPie's import format, meant to be imported on top of demoBackup. */
export function demoImport(now?: Date): ImportFile;
