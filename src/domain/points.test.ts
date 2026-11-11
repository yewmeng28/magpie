import { describe, expect, it } from 'vitest';
import { addMonths, currentCycle, cycleOf, estimateJourney, exclusionReason, inCycle, milesFor, programOf, readRewards } from './points';
import type { Expense } from './types';

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', date: '2026-06-10', merchant: 'Shop', amount: 1000, currency: 'SGD', categoryId: null, accountId: 'sc-journey', createdAt: 1, updatedAt: 1, ...over,
});

describe('readRewards', () => {
  it('reads a Standard Chartered points summary', () => {
    const lines = [
      '360° REWARDS POINTS SUMMARY',
      'Total 360° Reward Points awarded in this statement 1,107',
      'Total points brought forward 101,325',
      'Points used and/or expired 33',
      'Points adjustment in this statement 0',
      'Total points available 102,399',
    ];
    expect(readRewards(lines, '2026-06-16')).toEqual({ date: '2026-06-16', broughtForward: 101325, earned: 1107, used: 33, adjustments: 0, balance: 102399 });
  });

  it('reads an HSBC summary as OCR garbles it, including a comma read as a full stop', () => {
    const lines = [
      'Pints Carried Forward 12,261',
      'Points Earned &) 538',
      'Bonus Points ) 0',
      'Points Redeemed *) 0',
      'Points Expired ) 0',
      'Points Adjusted ©) 18.468',
      'Total Points Available 31,267',
    ];
    expect(readRewards(lines, '2026-10-28')).toMatchObject({ broughtForward: 12261, earned: 538, used: 0, adjustments: 18468, balance: 31267 });
  });

  it('is not thrown by a sign OCR reads as a digit', () => {
    const lines = ['Points Carried Forward 9,455', 'Points Earned 4) 880', 'Bonus Points @) 0', 'Points Redeemed +) 0', 'Points Expired ) 0', 'Points Adjusted 9) 1,926'];
    expect(readRewards(lines, '2026-09-28')).toEqual({ date: '2026-09-28', broughtForward: 9455, earned: 880, used: 0, adjustments: 1926, balance: 12261 });
  });

  it('counts bonus points as earned, and redeemed and expired points as used', () => {
    const lines = ['Points Carried Forward 1,000', 'Points Earned 200', 'Bonus Points 50', 'Points Redeemed 100', 'Points Expired 20', 'Points Adjusted 0', 'Total Points Available 1,130'];
    expect(readRewards(lines, '2026-10-28')).toMatchObject({ earned: 250, used: 120, balance: 1130 });
  });

  it('adds up a statement that prints no total, and keeps a negative adjustment', () => {
    const lines = ['Points Carried Forward 9,455', 'Points Earned 880', 'Bonus Points 0', 'Points Redeemed 0', 'Points Expired 0', 'Points Adjusted -455'];
    expect(readRewards(lines, '2026-09-28')).toMatchObject({ adjustments: -455, balance: 9880 });
  });

  it('does not invent a total when a figure is missing', () => {
    expect(readRewards(['Points Earned 880', 'Points Adjusted 1,926'], '2026-09-28')).toBeUndefined();
  });

  it('gives up when the figures do not add up, rather than keep a misread total', () => {
    expect(readRewards(['Points Carried Forward 1,000', 'Points Earned 200', 'Total Points Available 9,999'], '2026-10-28')).toBeUndefined();
  });

  it('finds nothing in a statement without points', () => {
    expect(readRewards(['TOTAL 2,764.59 221.88'], '2026-06-16')).toBeUndefined();
  });
});

describe('programOf', () => {
  it('knows the cards by name or by the names their statements use', () => {
    expect(programOf({ name: 'SC Journey' })?.id).toBe('sc-journey');
    expect(programOf({ name: 'My card', aliases: ['JOURNEY CREDIT CARD'] })?.id).toBe('sc-journey');
    expect(programOf({ name: 'HSBC Revolution' })).toMatchObject({ id: 'hsbc-revolution', canEstimate: false });
    expect(programOf({ name: 'POSB Everyday' })).toBeUndefined();
  });

  it('turns points into KrisFlyer miles where the rate is known', () => {
    const journey = programOf({ name: 'SC Journey' })!;
    expect(milesFor(25000, journey)).toBe(10000);
    expect(milesFor(100, programOf({ name: 'HSBC Revolution' })!)).toBeUndefined();
  });
});

describe('estimateJourney', () => {
  it('pays 3 points per dollar, and 5 abroad', () => {
    const estimate = estimateJourney([expense({ amount: 10000 }), expense({ amount: 1000, foreignCurrency: 'MYR' })]);
    expect(estimate).toMatchObject({ points: 350, eligible: 11000, excluded: 0 });
  });

  it('leaves out what the terms exclude and says why', () => {
    const estimate = estimateJourney([
      expense({ amount: 5000 }),
      expense({ amount: 45211, description: 'AXS SERVICE Singapore SG' }),
      expense({ amount: 154790, merchant: 'Great Eastern Life', description: 'GREAT EASTERN LIFE SINGAPORE SG' }),
      expense({ amount: 18000, description: 'ANNUAL FEE - BASIC CARD' }),
      expense({ amount: 14241, description: 'APPLE ONLINE STORE #02/24~~' }),
      expense({ amount: 9800, recurringId: 'r1' }),
    ]);
    expect(estimate.points).toBe(150);
    expect(estimate.eligible).toBe(5000);
    expect(estimate.reasons.map(([why]) => why).sort()).toEqual(['AXS, SAM and ATM', 'fees and charges', 'instalments', 'insurance', 'recurring payments']);
  });

  it('takes back the base rate on a refund', () => {
    expect(estimateJourney([expense({ amount: 6327 }), expense({ amount: -1087 })]).points).toBe(157);
  });

  it('never goes below zero', () => {
    expect(estimateJourney([expense({ amount: -5000 })]).points).toBe(0);
  });

  it('does not exclude ordinary shops', () => {
    expect(exclusionReason({ merchant: 'Shopee', description: 'SHOPEE SINGAPORE GP SINGAPORE SG' })).toBeUndefined();
    expect(exclusionReason({ merchant: 'Bus/MRT', description: 'BUS/MRT 852644496 SINGAPORE SG' })).toBeUndefined();
  });
});

describe('statement cycles', () => {
  it('adds months without overshooting a short one', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-06-16', -1)).toBe('2026-05-16');
    expect(addMonths('2026-12-16', 1)).toBe('2027-01-16');
  });

  it('counts the day after one statement up to and including the next', () => {
    const cycle = cycleOf('2026-06-16', '2026-05-16');
    const days = ['2026-05-16', '2026-05-17', '2026-06-16', '2026-06-17'];
    expect(inCycle(days.map((date) => expense({ date })), cycle).map((e) => e.date)).toEqual(['2026-05-17', '2026-06-16']);
  });

  it('opens the next cycle after the latest statement, or uses this month when there is none', () => {
    expect(currentCycle('2026-06-16', '2026-07-01')).toEqual({ from: '2026-06-16', to: '2026-07-16' });
    expect(currentCycle(undefined, '2026-11-11')).toEqual({ from: '2026-10-31', to: '2026-11-30' });
  });
});
