import type { Table } from 'dexie';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../../domain/defaults';
import { generate } from '../../domain/recurring';
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
    categories: {
      ...tableRepository(db.categories),
      remove: (id) =>
        db.transaction('rw', [db.categories, db.expenses, db.rules, db.recurring], async () => {
          await db.categories.delete(id);
          await db.expenses.where('categoryId').equals(id).modify({ categoryId: null });
          await db.rules.filter((r) => r.categoryId === id).delete();
          await db.recurring.filter((r) => r.categoryId === id).modify({ categoryId: null });
        }),
    },
    rules: tableRepository(db.rules),
    imports: {
      commit: (expenses, rules) =>
        db.transaction('rw', db.expenses, db.rules, async () => {
          await db.expenses.bulkPut(expenses);
          await db.rules.bulkPut(rules);
        }),
      remove: (importId) =>
        db.transaction('rw', db.expenses, async () => {
          const removed = await db.expenses.where('importId').equals(importId).toArray();
          await db.expenses.bulkDelete(removed.map((e) => e.id));
          return removed;
        }),
    },
    recurring: {
      ...tableRepository(db.recurring),
      catchUp: (today) =>
        db.transaction('rw', db.recurring, db.expenses, async () => {
          const { expenses, rules } = generate(await db.recurring.toArray(), today, Date.now(), () => crypto.randomUUID());
          await db.expenses.bulkPut(expenses);
          await db.recurring.bulkPut(rules);
          return expenses.length;
        }),
      adopt: (rule, expenseIds) =>
        db.transaction('rw', db.recurring, db.expenses, async () => {
          await db.recurring.put(rule);
          await db.expenses.where('id').anyOf(expenseIds).modify({ recurringId: rule.id });
        }),
    },
    backup: {
      exportAll: () =>
        db.transaction('r', [db.expenses, db.accounts, db.categories, db.rules, db.recurring], async () => ({
          magpie: 'backup' as const,
          version: 1 as const,
          exportedAt: Date.now(),
          expenses: await db.expenses.toArray(),
          accounts: await db.accounts.toArray(),
          categories: await db.categories.toArray(),
          rules: await db.rules.toArray(),
          recurring: await db.recurring.toArray(),
        })),
      importAll: (backup) =>
        db.transaction('rw', [db.expenses, db.accounts, db.categories, db.rules, db.recurring], async () => {
          await Promise.all([db.expenses.clear(), db.accounts.clear(), db.categories.clear(), db.rules.clear(), db.recurring.clear()]);
          await db.expenses.bulkPut(backup.expenses);
          await db.accounts.bulkPut(backup.accounts);
          await db.categories.bulkPut(backup.categories);
          await db.rules.bulkPut(backup.rules);
          await db.recurring.bulkPut(backup.recurring);
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
