import Dexie, { type Table } from 'dexie';
import { LEGACY_CATEGORY_COLORS } from '../../domain/defaults';
import type { Account, Category, Expense, MerchantRule } from '../../domain/types';

const SCHEMA = {
  expenses: 'id, date, categoryId, accountId, importId',
  accounts: 'id',
  categories: 'id',
  rules: 'id',
};

// Ids are always set by the app (UUIDs, category slugs, merchant keys), so tables are keyed by a required string.
export class MagPieDb extends Dexie {
  expenses!: Table<Expense, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  rules!: Table<MerchantRule, string>;

  constructor() {
    super('magpie');
    this.version(1).stores(SCHEMA);
    // v2: default categories moved to the validated chart palette. Only colours still at their first-release default
    // change, so a colour the user picked survives.
    this.version(2)
      .stores(SCHEMA)
      .upgrade((tx) =>
        tx
          .table<Category, string>('categories')
          .toCollection()
          .modify((c) => {
            const legacy = LEGACY_CATEGORY_COLORS[c.id];
            if (legacy && c.color.toLowerCase() === legacy.from) c.color = legacy.to;
          }),
      );
  }
}
