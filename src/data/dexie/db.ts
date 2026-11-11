import Dexie, { type Table } from 'dexie';
import { DEFAULT_ACCOUNTS, LEGACY_CATEGORY_COLORS } from '../../domain/defaults';
import type { PointsStatement } from '../../domain/points';
import type { Recurring } from '../../domain/recurring';
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
  recurring!: Table<Recurring, string>;
  points!: Table<PointsStatement, string>;

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
    // v3: recurring payments.
    this.version(3).stores({ ...SCHEMA, recurring: 'id' });
    // v4: card points, one record per card and statement. The Standard Chartered Journey card joins the defaults, so a
    // statement from it finds its card; seeding only fills an empty table, so existing users get it here.
    this.version(4)
      .stores({ ...SCHEMA, recurring: 'id', points: 'id, accountId, date' })
      .upgrade(async (tx) => {
        const accounts = tx.table<Account, string>('accounts');
        const journey = DEFAULT_ACCOUNTS.find((a) => a.id === 'sc-journey');
        if (journey && !(await accounts.get(journey.id))) await accounts.put(journey);
      });
  }
}
