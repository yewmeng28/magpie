// The screenshot pipeline loads scripts/demo-data.mjs through the app's own Restore backup and import screens, so
// it must pass the same validation, and stay in step with the default categories and accounts.
import { describe, expect, it } from 'vitest';
import { demoBackup, demoImport } from '../../scripts/demo-data.mjs';
import { parseBackup } from './backup';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults';
import { localDay } from './expenses';
import { buildDraft, parseImportFile } from './importFile';
import { owedSummary } from './split';

const days = ['2026-10-27', '2026-11-01', '2027-01-31', '2027-03-01'].map((d) => new Date(`${d}T09:00:00`));

describe.each(days)('demo data on %s', (now) => {
  const backup = parseBackup(JSON.parse(JSON.stringify(demoBackup(now))));
  const today = localDay(now);
  const thisMonth = today.slice(0, 7);

  it('is a valid backup using the default categories and accounts', () => {
    expect(backup.categories).toEqual(DEFAULT_CATEGORIES);
    expect(backup.accounts).toEqual(DEFAULT_ACCOUNTS);
    const categories = new Set(backup.categories.map((c) => c.id));
    const accounts = new Set(backup.accounts.map((a) => a.id));
    expect(backup.expenses.filter((e) => e.categoryId !== null && !categories.has(e.categoryId))).toEqual([]);
    expect(backup.expenses.filter((e) => e.accountId !== null && !accounts.has(e.accountId))).toEqual([]);
  });

  it('covers three months, ends today, and fills this month', () => {
    expect(backup.expenses.length).toBeGreaterThan(60);
    expect(backup.expenses.every((e) => e.date <= today)).toBe(true);
    expect(new Set(backup.expenses.map((e) => e.date.slice(0, 7))).size).toBe(3);
    expect(backup.expenses.filter((e) => e.date.startsWith(thisMonth)).length).toBeGreaterThanOrEqual(3);
    expect(backup.expenses.some((e) => e.merchant === 'Haidilao' && e.date === today)).toBe(true);
  });

  it('has split bills, some paid back', () => {
    const owed = owedSummary(backup.expenses);
    expect(owed.people.map((p) => p.name).sort()).toEqual(['Alice', 'Ben']);
    expect(owed.unnamed.count).toBe(1);
    expect(owed.repaid).toBeGreaterThan(0);
    expect(owed.lent - owed.repaid).toBeGreaterThan(0);
  });

  it('comes out the same every time', () => {
    expect(demoBackup(now)).toEqual(demoBackup(now));
  });

  it('imports a statement that shows every kind of review row and reconciles', () => {
    const file = parseImportFile(JSON.parse(JSON.stringify(demoImport(now))));
    const draft = buildDraft(file, { categories: backup.categories, accounts: backup.accounts, rules: backup.rules, existing: backup.expenses });
    expect(draft.reconciliation).toMatchObject({ basis: 'purchases' });
    expect(draft.reconciliation!.actual).toBe(draft.reconciliation!.expected);
    expect(draft.rows.some((r) => r.duplicateOf)).toBe(true);
    expect(draft.rows.some((r) => r.kind === 'payment' && !r.include)).toBe(true);
    expect(draft.rows.some((r) => r.kind === 'refund')).toBe(true);
    expect(draft.rows.some((r) => r.include && r.categoryId === null)).toBe(true);
    expect(draft.rows.every((r) => r.accountId === 'hsbc-revolution')).toBe(true);
  });
});
