import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackup, type BackupFile } from './backup';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults';

const backup: BackupFile = {
  magpie: 'backup',
  version: 1,
  exportedAt: 1,
  expenses: [
    {
      id: 'e1', date: '2026-09-14', merchant: 'Xiang Xiang Hunan', description: 'XIANG XIANG HUNAN CUIS', amount: 9000, currency: 'SGD',
      categoryId: 'food', accountId: 'hsbc-revolution', importId: 'i1', createdAt: 1, updatedAt: 2,
      split: { shares: [{ id: 's1', name: 'Alice', amount: 3000, repaid: 1000 }, { id: 's2', name: '', amount: 3000, repaid: 0 }] },
    },
    { id: 'e2', date: '2026-09-15', merchant: 'Kopi', amount: 180, currency: 'SGD', categoryId: null, accountId: null, note: 'cash', createdAt: 3, updatedAt: 3 },
  ],
  accounts: DEFAULT_ACCOUNTS,
  categories: DEFAULT_CATEGORIES,
  rules: [{ id: 'AKITCHEN', categoryId: 'food', updatedAt: 5 }],
};

const clone = () => JSON.parse(JSON.stringify(backup));

describe('parseBackup', () => {
  it('round-trips through JSON unchanged', () => {
    expect(parseBackup(clone())).toEqual(backup);
  });

  it.each([
    [(b: any) => ({ ...b, magpie: undefined }), /not a MagPie backup/],
    [() => ({ magpie: 1, statement: {}, transactions: [] }), /not a MagPie backup.*Import tab/],
    [(b: any) => ({ ...b, version: 2 }), /version must be 1/],
    [(b: any) => ({ ...b, expenses: 'none' }), /expenses must be a list/],
    [(b: any) => (b.expenses[1].date = '15/09/2026', b), /expenses\[1\]\.date/],
    [(b: any) => (b.expenses[1].amount = 1.8, b), /expenses\[1\]\.amount/],
    [(b: any) => (b.expenses[0].split.shares[0].amount = 8000, b), /add up to more than the expense/],
    [(b: any) => (b.expenses[0].split.shares[0].repaid = 4000, b), /repaid must be between/],
    [(b: any) => (b.accounts[0].kind = 'wallet', b), /accounts\[0\]\.kind/],
    [(b: any) => (b.rules.push({ ...b.rules[0] }), b), /rules\[1\]\.id repeats "AKITCHEN"/],
  ])('rejects a malformed backup (%#)', (change, message) => {
    expect(() => parseBackup(change(clone()))).toThrow(message);
  });

  it('names files by local date', () => {
    expect(backupFileName(new Date(2026, 9, 26, 7, 30))).toBe('magpie-2026-10-26.json');
  });
});
