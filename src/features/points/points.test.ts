import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCOUNTS } from '../../domain/defaults';
import type { PointsStatement } from '../../domain/points';
import type { Expense } from '../../domain/types';

const store: { accounts: unknown[]; points: PointsStatement[]; expenses: Expense[] } = { accounts: [], points: [], expenses: [] };
vi.mock('../../data/RepoContext', () => ({
  useAccounts: () => store.accounts,
  usePoints: () => store.points,
  useExpenses: () => store.expenses,
  useRepos: () => ({ points: { remove: async () => {}, save: async () => {} } }),
}));
vi.mock('../../app/toast', () => ({ useToast: () => () => {} }));

const { PointsTab } = await import('./PointsTab');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const statement = (accountId: string, date: string, earned: number, balance: number): PointsStatement => ({ id: `${accountId}:${date}`, accountId, date, earned, used: 0, adjustments: 0, balance });
const expense = (over: Partial<Expense>): Expense => ({ id: 'e', date: '2026-06-20', merchant: 'Shop', amount: 10000, currency: 'SGD', categoryId: null, accountId: 'sc-journey', createdAt: 1, updatedAt: 1, ...over });

describe('PointsTab', () => {
  it('says so when no card has points', () => {
    Object.assign(store, { accounts: DEFAULT_ACCOUNTS.filter((a) => a.id === 'cash' || a.id === 'posb-everyday'), points: [], expenses: [] });
    expect(text(renderToStaticMarkup(createElement(PointsTab)))).toContain('No cards with points yet');
  });

  it('shows the latest balance, its miles, a guess for the open statement, and each statement', () => {
    Object.assign(store, {
      accounts: DEFAULT_ACCOUNTS,
      points: [statement('sc-journey', '2026-06-16', 1107, 102399), statement('sc-journey', '2026-05-16', 900, 101292)],
      expenses: [expense({ amount: 10000 }), expense({ amount: 50000, description: 'GREAT EASTERN LIFE' }), expense({ date: '2026-05-20', amount: 30000 })],
    });
    const t = text(renderToStaticMarkup(createElement(PointsTab)));
    expect(t).toContain('SC Journey');
    expect(t).toContain('102,399');
    expect(t).toContain('about 40,959 KrisFlyer miles');
    expect(t).toContain('This statement so far');
    expect(t).toContain('about 300');
    expect(t).toContain('insurance');
    expect(t).toContain('+1,107');
    expect(t).toContain('+900');
    expect(t).toContain('guessed 900');
  });

  it('flags a statement that does not start where the previous one ended', () => {
    Object.assign(store, {
      accounts: DEFAULT_ACCOUNTS,
      points: [
        { ...statement('sc-journey', '2026-06-16', 1107, 102399), broughtForward: 101325 },
        { ...statement('sc-journey', '2026-05-16', 900, 100000), broughtForward: 99100 },
      ],
      expenses: [],
    });
    const t = text(renderToStaticMarkup(createElement(PointsTab)));
    expect(t).toContain('Starts from 101,325, but the statement before ended at 100,000');
    expect(t).not.toContain('Starts from 99,100');
  });

  it('keeps an HSBC card to what its statements say, and does not guess', () => {
    Object.assign(store, { accounts: DEFAULT_ACCOUNTS, points: [statement('hsbc-revolution', '2026-10-28', 538, 31267)], expenses: [expense({ accountId: 'hsbc-revolution', date: '2026-10-10', amount: 52212 })] });
    const t = text(renderToStaticMarkup(createElement(PointsTab)));
    expect(t).toContain('31,267');
    expect(t).toContain('earning rules aren’t built in');
    expect(t).not.toContain('This statement so far');
    expect(t).toContain('per S$1 spent');
    expect(t).not.toContain('KrisFlyer');
  });

  it('invites an import for a card with a programme but no statements yet', () => {
    Object.assign(store, { accounts: DEFAULT_ACCOUNTS, points: [], expenses: [] });
    expect(text(renderToStaticMarkup(createElement(PointsTab)))).toContain('Import a SC Journey statement to start tracking its points');
  });
});
