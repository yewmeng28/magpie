import { DEFAULT_CURRENCY } from './defaults';
import type { ImportFile, ImportKind, ImportTransaction } from './importFile';
import { toCents } from './money';
import type { Account, Cents } from './types';

/**
 * Reads a credit card statement from the text of its PDF, without sending it anywhere. Built for the POSB/DBS and
 * HSBC layouts but deliberately generic: a transaction is any line that starts with one or two dates ("07 AUG", or
 * HSBC's post and transaction dates) and has an amount after the description. Lines without a leading date (headers,
 * wrapped "SINGAPORE SG" lines, reference numbers, the cardholder's name) are never read as transactions.
 */

/** One run of text on a PDF page, in PDF units (y grows upwards). */
export interface PdfText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type StatementProblem = 'no-text' | 'no-transactions';

export class StatementError extends Error {
  readonly problem: StatementProblem;

  constructor(problem: StatementProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

const MONTH = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?`;
const DAY_MONTH = String.raw`(\d{1,2})\s?${MONTH}`;
const AMOUNT = String.raw`\d{1,3}(?:,\d{3})*\.\d{2}`;

/** "29 Aug 26 Aug MCDONALD'S (CCP) 4.50 …": the first amount after the description wins, so a summary column
 * printed on the same line (HSBC puts its account summary beside the transactions) is ignored. */
const TRANSACTION = new RegExp(`^${DAY_MONTH}(?:\\s+${DAY_MONTH})?\\s+(.+?)\\s+(-?${AMOUNT})(\\s?CR\\b)?(?=\\s|$)`, 'i');
const FULL_DATE = String.raw`\b${DAY_MONTH},?\s+(\d{4})\b`;
const PREVIOUS_BALANCE = new RegExp(`PREVIOUS\\s+(?:STATEMENT\\s+)?BALANCE\\s*:?\\s*(${AMOUNT})(\\s?CR\\b)?`, 'i');
/** New-balance labels, most authoritative first. DBS prints a GRAND TOTAL across all cards on the statement. */
const NEW_BALANCE = [
  new RegExp(`GRAND\\s+TOTAL\\b\\D*?(${AMOUNT})(\\s?CR\\b)?`, 'i'),
  new RegExp(`TOTAL\\s+(?:AMOUNT\\s+)?DUE\\s*:?\\s*(${AMOUNT})(\\s?CR\\b)?`, 'i'),
  new RegExp(`NEW\\s+BALANCE\\s*:?\\s*(${AMOUNT})(\\s?CR\\b)?`, 'i'),
  new RegExp(`SUB-?TOTAL\\s*:?\\s*(${AMOUNT})(\\s?CR\\b)?`, 'i'),
];
/** Credits that pay off the card rather than refund a purchase. */
const PAYMENT = /\b(PAYMENT|THANK\s+YOU|VISA\s+DIRECT|GIRO|PAYNOW|FAST\s+TRANSFER|AUTO-?PAY|AXS|IBG|INTERBANK)\b/i;
/** DBS heads each card's section "POSB everyday CARD NO.: 1234 …"; only the name before it is kept. */
const CARD_NO = /^(.*?)\s+CARD\s+NO\.?\s*:?\s*[\dX*•]{4}/i;

const pad = (n: number) => String(n).padStart(2, '0');
const monthIndex = (name: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.slice(0, 3).toLowerCase());

/** Group text runs into lines, top to bottom, joining runs left to right. */
export function toLines(items: PdfText[]): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; tolerance: number; items: PdfText[] }[] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && line.y - item.y <= line.tolerance) line.items.push(item);
    else lines.push({ y: item.y, tolerance: Math.max(2, (item.height || 8) * 0.45), items: [item] });
  }
  return lines.map((line) => {
    let text = '';
    let end = -Infinity;
    for (const item of line.items.sort((a, b) => a.x - b.x)) {
      const gap = item.x - end > Math.max(0.8, (item.height || 8) * 0.12);
      text += (text && gap ? ' ' : '') + item.str;
      end = item.x + item.width;
    }
    return text.replace(/\s+/g, ' ').trim();
  });
}

/**
 * Lines that carry an amount but weren't read as a transaction or a balance: where to look when the rows don't add
 * up to the statement. Scanned statements (OCR) lose or garble rows more often than their text layer would.
 */
export function unreadLines(pages: PdfText[][]): string[] {
  const amount = new RegExp(AMOUNT);
  return pages
    .flatMap(toLines)
    .filter(
      (line) =>
        amount.test(line) &&
        !TRANSACTION.test(line) &&
        !PREVIOUS_BALANCE.test(line) &&
        !NEW_BALANCE.some((pattern) => pattern.test(line)),
    );
}

/** The statement's reference date: the latest printed date within 45 days of the earliest (the statement or due
 * date), so a promotion valid "till 31 Dec 2027" further down can't throw the years off. */
function referenceDate(lines: string[], today: Date): Date {
  const dates = lines.flatMap((line) =>
    [...line.matchAll(new RegExp(FULL_DATE, 'gi'))].map((m) => new Date(Number(m[3]), monthIndex(m[2]), Number(m[1]))),
  );
  if (!dates.length) return today;
  const earliest = Math.min(...dates.map((d) => d.getTime()));
  const window = earliest + 45 * 86_400_000;
  return new Date(Math.max(...dates.map((d) => d.getTime()).filter((t) => t <= window)));
}

/** A day and month without a year, placed in the year that puts it on or before the reference date. */
function dateBefore(day: number, month: number, reference: Date): Date | null {
  let year = reference.getFullYear();
  if (new Date(year, month, day) > reference) year -= 1;
  const date = new Date(year, month, day);
  return date.getMonth() === month ? date : null;
}

const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const signed = (amount: string, cr: string | undefined): Cents => toCents(amount)! * (cr ? -1 : 1);

/** Card names and aliases to spot statement sections by, most specific first. Cash can't appear on a statement. */
function accountMatchers(accounts: Account[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/card$/, '');
  const matchers = accounts
    .filter((a) => a.kind !== 'cash')
    .flatMap((a) => [a.name, ...(a.aliases ?? [])].map((n) => ({ name: a.name, key: norm(n) })))
    .filter((m) => m.key.length >= 5)
    .sort((a, b) => b.key.length - a.key.length);
  return (line: string) => {
    const key = norm(line);
    return matchers.find((m) => key.startsWith(m.key))?.name ?? line.match(CARD_NO)?.[1].trim();
  };
}

export function parseStatement(pages: PdfText[][], accounts: Account[], today = new Date()): ImportFile {
  if (!pages.some((items) => items.some((i) => i.str.trim()))) {
    throw new StatementError(
      'no-text',
      'This PDF has no readable text. It’s a scan or an image, or it was flattened when it was redacted. Upload the original statement from your bank, or use the Claude route below.',
    );
  }
  const pageLines = pages.map(toLines);
  const lines = pageLines.flat();
  const hasDate = new RegExp(FULL_DATE, 'i');
  const reference = referenceDate(pageLines.find((p) => p.some((line) => hasDate.test(line))) ?? lines, today);
  const accountOf = accountMatchers(accounts);

  const transactions: ImportTransaction[] = [];
  const previous: Cents[] = [];
  const newBalance: (Cents | undefined)[] = NEW_BALANCE.map(() => undefined);
  let account: string | undefined;
  let firstAccount: string | undefined;

  for (const line of lines) {
    const m = line.match(TRANSACTION);
    const description = m?.[5].trim() ?? '';
    if (m && !/^\d{4}\b/.test(description)) {
      const first = dateBefore(Number(m[1]), monthIndex(m[2]), reference);
      const second = m[3] ? dateBefore(Number(m[3]), monthIndex(m[4]), reference) : null;
      // With two dates (posting and transaction, in either order) the transaction date is the earlier one.
      const date = first && second ? (second < first ? second : first) : first;
      if (date) {
        const amount = signed(m[6], m[7]);
        const kind: ImportKind = amount >= 0 ? 'expense' : PAYMENT.test(description) ? 'payment' : 'refund';
        transactions.push({ date: iso(date), description, amount: Math.abs(amount) / 100, kind, ...(account ? { account } : {}) });
        continue;
      }
    }
    const p = line.match(PREVIOUS_BALANCE);
    if (p) previous.push(signed(p[1], p[2]));
    NEW_BALANCE.forEach((pattern, i) => {
      const b = line.match(pattern);
      if (b && newBalance[i] === undefined) newBalance[i] = signed(b[1], b[2]);
    });
    const named = accountOf(line);
    if (named) {
      account = named;
      firstAccount ??= named;
    }
  }

  if (!transactions.length) {
    throw new StatementError(
      'no-transactions',
      'No transactions found in this PDF. Its layout may not be supported yet: try the Claude route below.',
    );
  }

  // DBS prints one PREVIOUS BALANCE per card and a GRAND TOTAL across them; elsewhere repeats are the same figure
  // printed twice (HSBC shows it in the table and in the account summary), so only the first counts.
  const closing = newBalance.find((b) => b !== undefined);
  const opening = newBalance[0] !== undefined ? previous.reduce((t, b) => t + b, 0) : previous[0];
  return {
    magpie: 1,
    statement: {
      ...(firstAccount ? { account: firstAccount } : {}),
      currency: DEFAULT_CURRENCY,
      ...(opening !== undefined && closing !== undefined ? { previousBalance: opening / 100, newBalance: closing / 100 } : {}),
    },
    // Rows before the first card heading fall back to statement.account when the draft is built.
    transactions,
  };
}
