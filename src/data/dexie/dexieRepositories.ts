import type { Table } from 'dexie';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../../domain/defaults';
import type { Repositories, Repository } from '../repositories';
import { MagPieDb } from './db';

function tableRepository<T extends { id: string }>(table: Table<T, string>): Repository<T> {
  return {
    list: () => table.toArray(),
    get: (id) => table.get(id),
    save: async (entity) => void (await table.put(entity)),
    remove: (id) => table.delete(id),
  };
}

export function createDexieRepositories(db = new MagPieDb()): Repositories {
  return {
    expenses: tableRepository(db.expenses),
    accounts: {
      ...tableRepository(db.accounts),
      remove: (id) =>
        db.transaction('rw', db.accounts, db.expenses, async () => {
          await db.accounts.delete(id);
          await db.expenses.where('accountId').equals(id).modify({ accountId: null });
        }),
    },
    categories: tableRepository(db.categories),
    rules: tableRepository(db.rules),
    imports: {
      commit: (expenses, rules) =>
        db.transaction('rw', db.expenses, db.rules, async () => {
          await db.expenses.bulkPut(expenses);
          await db.rules.bulkPut(rules);
        }),
    },
    backup: {
      exportAll: () =>
        db.transaction('r', db.expenses, db.accounts, db.categories, db.rules, async () => ({
          magpie: 'backup' as const,
          version: 1 as const,
          exportedAt: Date.now(),
          expenses: await db.expenses.toArray(),
          accounts: await db.accounts.toArray(),
          categories: await db.categories.toArray(),
          rules: await db.rules.toArray(),
        })),
      importAll: (backup) =>
        db.transaction('rw', db.expenses, db.accounts, db.categories, db.rules, async () => {
          await Promise.all([db.expenses.clear(), db.accounts.clear(), db.categories.clear(), db.rules.clear()]);
          await db.expenses.bulkPut(backup.expenses);
          await db.accounts.bulkPut(backup.accounts);
          await db.categories.bulkPut(backup.categories);
          await db.rules.bulkPut(backup.rules);
        }),
    },
    // Only an empty table is seeded, so deleting a default category or account doesn't bring it back.
    seed: () =>
      db.transaction('rw', db.categories, db.accounts, async () => {
        if ((await db.categories.count()) === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES);
        if ((await db.accounts.count()) === 0) await db.accounts.bulkPut(DEFAULT_ACCOUNTS);
      }),
  };
}
