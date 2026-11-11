import type { Account, Cents, Expense } from './types';

/**
 * Credit card reward points: what a statement says it awarded (authoritative), and an estimate from MagPie's own
 * expenses for the cards whose earning rules are known. Statements print no merchant category codes, which decide
 * bonus tiers and some exclusions, so an estimate is a guide and the statement's figure is the truth.
 */

/** The points block of one statement, as printed. */
export interface RewardsSummary {
  /** The statement date, YYYY-MM-DD. */
  date: string;
  broughtForward?: number;
  /** Points awarded in this statement, bonus included. */
  earned: number;
  /** Redeemed or expired. */
  used: number;
  adjustments: number;
  /** Total available after this statement. */
  balance: number;
}

/** A saved statement's points for one card. The id is the card and date, so importing a statement twice replaces it. */
export interface PointsStatement extends RewardsSummary {
  id: string;
  accountId: string;
}

export const pointsStatementId = (accountId: string, date: string) => `${accountId}:${date}`;

// Points are whole numbers, so separators of any kind ("102,399", and "18.468" as OCR reads a comma) are dropped.
const whole = (text: string): number => (text.trim().startsWith('-') ? -1 : 1) * Number(text.replace(/[^\d]/g, ''));
const NUM = String.raw`(-?[\d.,]+)`;
/** HSBC prints a "(+)" or "(-)" sign after the label, which OCR reads as "&)", "©)", "4)", "9)" or just ")": one stray character. */
const MARK = String.raw`\s*(?:\(?\S?\)\s*)?`;

/** SCB prints "Total points brought forward 101,325"; HSBC "Points Carried Forward 12,261". OCR garbles the words. */
const LABELS = {
  broughtForward: [new RegExp(String.raw`TOTAL\s+POINTS\s+BROUGHT\s+FORWARD\s+${NUM}`, 'i'), new RegExp(String.raw`P\w*\s+CARRIED\s+FORWARD\s+${NUM}`, 'i')],
  earned: [new RegExp(String.raw`REWARD\s+POINTS\s+AWARDED\s+IN\s+THIS\s+STATEMENT\s+${NUM}`, 'i'), new RegExp(String.raw`P\w*\s+EARNED${MARK}${NUM}`, 'i')],
  bonus: [new RegExp(String.raw`BONUS\s+P\w*${MARK}${NUM}`, 'i')],
  used: [new RegExp(String.raw`POINTS\s+USED\s+AND\/OR\s+EXPIRED\s+${NUM}`, 'i')],
  redeemed: [new RegExp(String.raw`P\w*\s+REDEEMED${MARK}${NUM}`, 'i')],
  expired: [new RegExp(String.raw`P\w*\s+EXPIRED${MARK}${NUM}`, 'i')],
  adjustments: [new RegExp(String.raw`POINTS\s+ADJUSTMENT\s+IN\s+THIS\s+STATEMENT\s+${NUM}`, 'i'), new RegExp(String.raw`P\w*\s+ADJUSTED${MARK}${NUM}`, 'i')],
  balance: [new RegExp(String.raw`TOTAL\s+POINTS\s+AVAILABLE\s+${NUM}`, 'i')],
} as const;

function find(lines: string[], key: keyof typeof LABELS): number | undefined {
  for (const line of lines) for (const pattern of LABELS[key]) {
    const m = line.match(pattern);
    if (m && /\d/.test(m[1])) return whole(m[1]);
  }
  return undefined;
}

/**
 * The points block of a statement's text, or undefined when there is none or its figures don't add up (previous +
 * earned − used ± adjustments = available), which means something was misread and a wrong total is worse than none.
 */
export function readRewards(lines: string[], date: string): RewardsSummary | undefined {
  const earned = find(lines, 'earned');
  if (earned === undefined) return undefined;
  const broughtForward = find(lines, 'broughtForward');
  const used = find(lines, 'used') ?? (find(lines, 'redeemed') ?? 0) + (find(lines, 'expired') ?? 0);
  const bonus = find(lines, 'bonus') ?? 0;
  const adjustments = find(lines, 'adjustments') ?? 0;
  let balance = find(lines, 'balance');
  if (balance === undefined) {
    // Some HSBC statements print no total. With every other figure present it is their sum, and the next statement's
    // brought-forward figure is a check on it (the Points screen flags a break).
    if (broughtForward === undefined || find(lines, 'adjustments') === undefined) return undefined;
    balance = broughtForward + earned + bonus - used + adjustments;
  }
  if (balance < 0) return undefined;
  if (broughtForward === undefined) return { date, earned: earned + bonus, used, adjustments, balance };
  // An adjustment's sign isn't always printed where OCR can see it, so either direction may balance the books.
  const total = broughtForward + earned + bonus - used;
  const signed = [adjustments, -adjustments].find((a) => total + a === balance);
  return signed === undefined ? undefined : { date, broughtForward, earned: earned + bonus, used, adjustments: signed, balance };
}

// ---- Programmes ----

export interface PointsProgram {
  id: string;
  /** What the bank calls its points. */
  unit: string;
  /** KrisFlyer miles per point, where the bank's terms give a rate. */
  milesPerPoint?: number;
  /** Whether MagPie knows the earning rules well enough to estimate. */
  canEstimate: boolean;
}

const SC_JOURNEY: PointsProgram = { id: 'sc-journey', unit: '360° Rewards Points', milesPerPoint: 0.4, canEstimate: true };
const HSBC_REVOLUTION: PointsProgram = { id: 'hsbc-revolution', unit: 'Reward Points', canEstimate: false };

/** The programme a card belongs to, from its name or the names its statements use. */
export function programOf(account: Pick<Account, 'name' | 'aliases'>): PointsProgram | undefined {
  const names = [account.name, ...(account.aliases ?? [])].join(' ').toLowerCase();
  if (/\bjourney\b/.test(names)) return SC_JOURNEY;
  if (/\brevolution\b/.test(names)) return HSBC_REVOLUTION;
  return undefined;
}

// ---- Estimating Standard Chartered Journey points ----
// From the card's terms: 3 points per S$1 in Singapore dollars and 5 per S$1 in a foreign currency, on retail spend.
// A further 4.5 per S$1 applies to online transport, food delivery and grocery purchases (capped at S$1,000 a month),
// but a statement doesn't say which purchases were online, so that bonus is not estimated.

export const BASE_POINTS_PER_DOLLAR = 3;
export const FOREIGN_POINTS_PER_DOLLAR = 5;

/** Spend the terms leave out that a description gives away. Hospital, school, parking and charity codes can't be seen. */
const EXCLUDED: [RegExp, string][] = [
  [/\b(AXS|SAM)\b|\bATM\b/i, 'AXS, SAM and ATM'],
  [/INSURANCE|ASSURANCE|\bLIFE\b|\bAIA\b|PRUDENTIAL|MANULIFE|GREAT EASTERN|\bFWD\b|AVIVA|ALLIANZ|TOKIO MARINE/i, 'insurance'],
  [/EZ-?LINK|TRANSIT\s?LINK|FLASHPAY/i, 'card top-ups'],
  [/ANNUAL FEE|GST CHARGES|FINANCE CHARGE|INTEREST CHARGE|LATE PAYMENT|ADMINISTRATIVE FEE|SERVICE FEE/i, 'fees and charges'],
  [/\bIRAS\b|\bTAX\b|\bCPF\b/i, 'tax'],
  [/SINGAPORE POOLS|\bTOTO\b|\bCASINO\b|\bLOTTERY\b/i, 'betting'],
  // "APPLE ONLINE STORE #02/24": instalment 2 of 24 of a 0% plan, which doesn't earn.
  [/#\d{2}\/\d{2}\b/, 'instalments'],
];

export interface PointsEstimate {
  /** Whole points, base rate only. */
  points: number;
  /** Spend that earns, and spend left out, in cents. */
  eligible: Cents;
  excluded: Cents;
  /** Why spend was left out, with how much: [reason, cents]. */
  reasons: [string, Cents][];
}

/** The reason an expense is known not to earn, if its description or how it was added says so. */
export function exclusionReason(e: Pick<Expense, 'description' | 'merchant' | 'recurringId'>): string | undefined {
  if (e.recurringId) return 'recurring payments';
  const text = `${e.description ?? ''} ${e.merchant}`;
  return EXCLUDED.find(([pattern]) => pattern.test(text))?.[1];
}

/** Base points for these expenses on a Journey card. A refund takes back the base rate it would have earned. */
export function estimateJourney(expenses: Expense[]): PointsEstimate {
  let points = 0;
  let eligible = 0;
  let excluded = 0;
  const reasons = new Map<string, Cents>();
  for (const e of expenses) {
    const reason = e.amount > 0 ? exclusionReason(e) : undefined;
    if (reason) {
      excluded += e.amount;
      reasons.set(reason, (reasons.get(reason) ?? 0) + e.amount);
      continue;
    }
    const rate = e.amount < 0 || !e.foreignCurrency ? BASE_POINTS_PER_DOLLAR : FOREIGN_POINTS_PER_DOLLAR;
    points += (e.amount / 100) * rate;
    eligible += e.amount;
  }
  return { points: Math.max(0, Math.floor(points)), eligible, excluded, reasons: [...reasons].sort((a, b) => b[1] - a[1]) };
}

// ---- Statement cycles ----

/** The same day in another month, clamped to the month's end ("31 Jan" + 1 month is "28 Feb"). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}

export interface Cycle {
  /** The cycle's first day, and its last (the statement date). */
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The cycle a statement closed: after the previous statement (or a month before, for the first), up to its own date. */
export const cycleOf = (date: string, previous?: string): Cycle => ({ from: previous ?? addMonths(date, -1), to: date });

/** Expenses of a card dated inside a cycle (after `from`, up to `to`), as a statement counts them. */
export const inCycle = (expenses: Expense[], cycle: Cycle) => expenses.filter((e) => e.date > cycle.from && e.date <= cycle.to);

/** The open cycle after a card's latest statement, or this calendar month when nothing is imported yet. */
export function currentCycle(latest: string | undefined, today: string): Cycle {
  if (latest) return { from: latest, to: addMonths(latest, 1) };
  const [y, m] = today.split('-').map(Number);
  return { from: isoDay(new Date(y, m - 1, 0)), to: isoDay(new Date(y, m, 0)) };
}

/** KrisFlyer miles for points, rounded down, where the programme has a rate. */
export const milesFor = (points: number, program: PointsProgram) => (program.milesPerPoint ? Math.floor(points * program.milesPerPoint) : undefined);
