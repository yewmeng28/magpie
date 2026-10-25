import type { BackupFile } from '../domain/backup';
import type { Account, Category, Expense, MerchantRule } from '../domain/types';

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(entity: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export type ExpenseRepository = Repository<Expense>;
/** Removing an account keeps its expenses, which then show no account. */
export type AccountRepository = Repository<Account>;
export type CategoryRepository = Repository<Category>;
export type RuleRepository = Repository<MerchantRule>;

export interface ImportRepository {
  /** Save a confirmed import's expenses and learned rules together, so a failure leaves neither half behind. */
  commit(expenses: Expense[], rules: MerchantRule[]): Promise<void>;
}

export interface BackupRepository {
  exportAll(): Promise<BackupFile>;
  /** Replace everything with the backup, in one transaction. */
  importAll(backup: BackupFile): Promise<void>;
}

export interface Repositories {
  expenses: ExpenseRepository;
  accounts: AccountRepository;
  categories: CategoryRepository;
  rules: RuleRepository;
  imports: ImportRepository;
  backup: BackupRepository;
  /** Seed default categories and accounts on first run. */
  seed(): Promise<void>;
}
