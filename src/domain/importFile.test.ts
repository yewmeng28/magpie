import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './defaults';
import { buildDraft, commitDraft, extractJson, parseImportFile, type ImportFile } from './importFile';
import { buildImportPrompt } from './prompt';
import type { Account, Expense, MerchantRule } from './types';

const accounts: Account[] = [
  { id: 'posb', name: 'POSB Everyday', kind: 'credit', color: '#c00', aliases: ['POSB everyday'] },
  { id: 'hsbc', name: 'HSBC Revolution', kind: 'credit', color: '#d00', aliases: ['HSBC VISA REVOLUTION'] },
];

// Shaped like a real HSBC statement (made-up amounts): a purchase, card payments to skip, an unknown merchant.
const file: ImportFile = {
  magpie: 1,
  statement: { account: 'HSBC VISA REVOLUTION', currency: 'SGD', purchasesTotal: 33.3 },
  transactions: [
    { date: '2026-09-08', description: 'LUCKIN COFFEE (SGP) PT SINGAPORE SG', merchant: 'Luckin Coffee', amount: 3.3, kind: 'expense', category: 'Food & Drinks' },
    { date: '2026-09-08', description: 'DBS Visa Direct SG', amount: 150, kind: 'payment' },
    { date: '2026-09-14', description: 'PAYMENT -THANK YOU', amount: 100, kind: 'payment' },
    { date: '2026-09-17', description: 'SOME NEW PLACE SINGAPORE SG', amount: 20, kind: 'expense', category: 'Entertainment' },
    { date: '2026-09-19', description: 'GRAB* A-9N92OWBWW5PEAV', amount: 10, kind: 'expense', category: 'Food & Drinks' },
    { date: '2026-09-20', description: 'UNIQLO JEM SINGAPORE SG', amount: 5, kind: 'refund', category: 'Shopping', account: 'POSB everyday' },
  ],
};

const ctx = (extra: { rules?: MerchantRule[]; existing?: Expense[] } = {}) => ({
  categories: DEFAULT_CATEGORIES,
  accounts,
  rules: extra.rules ?? [],
  existing: extra.existing ?? [],
});

describe('extractJson', () => {
  it('finds the JSON inside a chat reply with code fences', () => {
    expect(extractJson('Here you go:\n```json\n{"magpie": 1}\n```\nLet me know!')).toEqual({ magpie: 1 });
  });

  it('explains missing or broken JSON', () => {
    expect(() => extractJson('sorry, no data')).toThrow(/No JSON found/);
    expect(() => extractJson('{"magpie": 1, "transactions": [')).toThrow(/No JSON found|malformed/);
    expect(() => extractJson('{"magpie": 1,, }')).toThrow(/malformed/);
  });
});

describe('parseImportFile', () => {
  it('accepts a valid file', () => {
    expect(parseImportFile(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  it.each([
    [{ ...file, magpie: 2 }, /magpie must be 1/],
    [{ ...file, statement: { currency: 'dollars' } }, /statement.currency/],
    [{ ...file, transactions: [{ ...file.transactions[0], date: '14 Sep' }] }, /transactions\[0\].date/],
    [{ ...file, transactions: [{ ...file.transactions[0], date: '2026-02-30' }] }, /transactions\[0\].date/],
    [{ ...file, transactions: [{ ...file.transactions[0], amount: '3.30' }] }, /transactions\[0\].amount/],
    [{ ...file, transactions: [{ ...file.transactions[0], amount: -3.3 }] }, /transactions\[0\].amount/],
    [{ ...file, transactions: [{ ...file.transactions[0], kind: 'credit' }] }, /transactions\[0\].kind/],
  ])('rejects invalid files with the failing path (%#)', (raw, message) => {
    expect(() => parseImportFile(raw)).toThrow(message);
  });
});

describe('buildDraft', () => {
  it('maps rows to accounts, signs refunds and skips payments', () => {
    const draft = buildDraft(file, ctx());
    expect(draft.rows.map((r) => [r.amount, r.include, r.accountId])).toEqual([
      [330, true, 'hsbc'],
      [15000, false, 'hsbc'],
      [10000, false, 'hsbc'],
      [2000, true, 'hsbc'],
      [1000, true, 'hsbc'],
      [-500, true, 'posb'],
    ]);
    expect(draft.rows[3].merchant).toBe('Some New Place');
  });

  it('ranks the user\'s rules over the file, and the file over the starter dictionary', () => {
    const draft = buildDraft(file, ctx({ rules: [{ id: 'LUCKINCOFFEE', categoryId: 'groceries', updatedAt: 0 }] }));
    expect(draft.rows.map((r) => [r.categoryId, r.categorySource])).toEqual([
      ['groceries', 'rule'], // the user's rule beats the file's "Food & Drinks"
      [null, null], // payments: no category anywhere
      [null, null],
      ['entertainment', 'statement'],
      ['food', 'statement'], // the file's guess beats the starter dictionary's "transport" for Grab
      ['shopping', 'statement'],
    ]);
    expect(buildDraft({ ...file, transactions: [{ ...file.transactions[4], category: undefined }] }, ctx()).rows[0])
      .toMatchObject({ categoryId: 'transport', categorySource: 'starter' });
  });

  it('reconciles the expense rows against the statement total', () => {
    expect(buildDraft(file, ctx()).reconciliation).toEqual({ basis: 'purchases', expected: 3330, actual: 3330 });
    const missingRow = { ...file, transactions: file.transactions.slice(1) };
    expect(buildDraft(missingRow, ctx()).reconciliation).toEqual({ basis: 'purchases', expected: 3330, actual: 3000 });
    expect(buildDraft({ ...file, statement: { currency: 'SGD' } }, ctx()).reconciliation).toBeUndefined();
  });

  it('flags and skips rows that were already imported', () => {
    const existing: Expense = {
      id: 'x1', date: '2026-09-08', merchant: 'Luckin Coffee', description: 'LUCKINCOFFEE', amount: 330, currency: 'SGD',
      categoryId: 'food', accountId: 'hsbc', createdAt: 0, updatedAt: 0,
    };
    const draft = buildDraft(file, ctx({ existing: [existing] }));
    expect(draft.rows[0]).toMatchObject({ duplicateOf: 'x1', include: false });
    expect(draft.rows[3].duplicateOf).toBeUndefined();
  });
});

describe('commitDraft', () => {
  let n = 0;
  const commit = (rows = buildDraft(file, ctx()).rows, rules: MerchantRule[] = []) =>
    commitDraft(rows, { currency: 'SGD', importId: 'imp1', now: 42, rules, newId: () => `e${++n}` });

  it('saves only included rows', () => {
    const { expenses } = commit();
    expect(expenses.map((e) => [e.merchant, e.amount, e.categoryId, e.importId])).toEqual([
      ['Luckin Coffee', 330, 'food', 'imp1'],
      ['Some New Place', 2000, 'entertainment', 'imp1'],
      ['Grab', 1000, 'food', 'imp1'],
      ['Uniqlo Jem', -500, 'shopping', 'imp1'],
    ]);
  });

  it('learns rules only for categories the local dictionary would not have guessed', () => {
    // Luckin and Uniqlo match the starter dictionary already; the new place is unknown; Grab was overridden to food.
    expect(commit().rules).toEqual([
      { id: 'SOMENEWPLACE', categoryId: 'entertainment', updatedAt: 42 },
      { id: 'GRAB', categoryId: 'food', updatedAt: 42 },
    ]);
  });

  it('learns from the user\'s edits in the draft', () => {
    const rows = buildDraft(file, ctx()).rows.map((r) => (r.merchant === 'Luckin Coffee' ? { ...r, categoryId: 'groceries' } : r));
    expect(commit(rows).rules[0]).toEqual({ id: 'LUCKINCOFFEE', categoryId: 'groceries', updatedAt: 42 });
  });

  it('does not re-learn a rule that already gives the same category', () => {
    const rules = [{ id: 'SOMENEWPLACE', categoryId: 'entertainment', updatedAt: 1 }];
    const rows = buildDraft(file, ctx({ rules })).rows;
    expect(commit(rows, rules).rules.map((r) => r.id)).toEqual(['GRAB']);
  });
});

describe('buildImportPrompt', () => {
  it('lists the user\'s categories and accounts', () => {
    const prompt = buildImportPrompt(DEFAULT_CATEGORIES, accounts, 'SGD');
    expect(prompt).toContain('Food & Drinks, Groceries, Transport');
    expect(prompt).toContain('My accounts: POSB Everyday, HSBC Revolution.');
    expect(prompt).toContain('"currency": "SGD"');
  });
});
