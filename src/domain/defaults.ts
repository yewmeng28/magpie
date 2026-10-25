import { FOLD_COLOR, SERIES_COLORS } from './palette';
import type { Account, Category } from './types';

/**
 * Seeded on first run. Ids are stable because the starter dictionary refers to them. Eight categories get the eight
 * validated chart hues, the most common ones on hues that stay distinct from each other; "Other" is the grey fold.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food & Drinks', emoji: '🍜', color: SERIES_COLORS.blue },
  { id: 'groceries', name: 'Groceries', emoji: '🛒', color: SERIES_COLORS.green },
  { id: 'transport', name: 'Transport', emoji: '🚇', color: SERIES_COLORS.yellow },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: SERIES_COLORS.magenta },
  { id: 'bills', name: 'Bills & Utilities', emoji: '🧾', color: SERIES_COLORS.violet },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬', color: SERIES_COLORS.orange },
  { id: 'health', name: 'Health & Personal Care', emoji: '💊', color: SERIES_COLORS.aqua },
  { id: 'travel', name: 'Travel', emoji: '✈️', color: SERIES_COLORS.red },
  { id: 'other', name: 'Other', emoji: '🪙', color: FOLD_COLOR },
];

/**
 * Colours the first release seeded, so the upgrade can recolour categories the user hasn't changed. "Gifts &
 * Donations" was a ninth hued category; there are only eight distinguishable hues, so it now joins the grey fold.
 */
export const LEGACY_CATEGORY_COLORS: Record<string, { from: string; to: string }> = {
  food: { from: '#e8833a', to: SERIES_COLORS.blue },
  groceries: { from: '#5aa454', to: SERIES_COLORS.green },
  transport: { from: '#3a8fd9', to: SERIES_COLORS.yellow },
  shopping: { from: '#c95fb4', to: SERIES_COLORS.magenta },
  bills: { from: '#7a6fd1', to: SERIES_COLORS.violet },
  entertainment: { from: '#e0b72f', to: SERIES_COLORS.orange },
  health: { from: '#3fb3a6', to: SERIES_COLORS.aqua },
  travel: { from: '#4f6bd8', to: SERIES_COLORS.red },
  gifts: { from: '#e05a6d', to: FOLD_COLOR },
  other: { from: '#8c8f99', to: FOLD_COLOR },
};

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'cash', name: 'Cash', kind: 'cash', color: '#5aa454' },
  { id: 'posb-everyday', name: 'POSB Everyday', kind: 'credit', color: '#d6372f', aliases: ['POSB everyday Card'] },
  { id: 'hsbc-revolution', name: 'HSBC Revolution', kind: 'credit', color: '#db0011', aliases: ['HSBC VISA REVOLUTION', 'HSBC Visa Revolution Card'] },
];

export const DEFAULT_CURRENCY = 'SGD';
