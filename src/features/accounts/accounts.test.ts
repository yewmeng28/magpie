import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCOUNTS } from '../../domain/defaults';
import type { PointsStatement } from '../../domain/points';

const store: { points: PointsStatement[] } = { points: [] };
vi.mock('../../data/RepoContext', () => ({
  useAccounts: () => DEFAULT_ACCOUNTS,
  useExpenses: () => [],
  usePoints: () => store.points,
  useRepos: () => ({}),
}));
vi.mock('../../app/toast', () => ({ useToast: () => () => {} }));

const { AccountsTab } = await import('./AccountsTab');

const render = (onOpenPoints?: (id: string) => void) => renderToStaticMarkup(createElement(AccountsTab, { onOpenPoints }));
const row = (html: string, name: string) => html.split('<li>').find((li) => li.includes(name)) ?? '';

describe('Cards list', () => {
  it('shows a card’s points balance beside it, and offers points to a card that has a programme but none yet', () => {
    store.points = [{ id: 'sc-journey:2026-06-16', accountId: 'sc-journey', date: '2026-06-16', earned: 1107, used: 33, adjustments: 0, balance: 102399 }];
    const html = render(() => {});
    expect(row(html, 'SC Journey')).toContain('102,399 pts');
    expect(row(html, 'HSBC Revolution')).toContain('Points ›');
  });

  it('shows nothing for a card with no points programme, or when points are not wired up', () => {
    const html = render(() => {});
    expect(row(html, 'POSB Everyday')).not.toMatch(/pts|Points ›/);
    expect(row(html, 'Cash')).not.toMatch(/pts|Points ›/);
    expect(render()).not.toMatch(/pts|Points ›/);
  });
});
