import type { ImportFile, ImportKind, ImportTransaction } from './importFile';
import { toCents } from './money';
import { dateBefore, iso, lineItems, monthIndex, StatementError, toLines, type PdfText } from './statement';
import type { Cents } from './types';

/**
 * Reads a bank account statement (POSB/DBS savings and Multiplier accounts, from a consolidated statement). Unlike a
 * card statement it has one amount column per direction, but the PDF's text gives no sign, so each row's direction is
 * worked out from the running balance printed beside it. Wrapped lines under a row (the payee, the reference) are
 * folded into that row's description.
 *
 * Money in is not spending, so deposits are `payment` rows (unticked by default). Money out is an expense, except
 * card bill payments and PayLah! top-ups, which are expenses marked `skip`: they count towards the balance check
 * but stay unticked, since the card's own statement carries that spending.
 */

const AMOUNT = String.raw`-?\d{1,3}(?:,\d{3})*\.\d{2}`;
const ROW = new RegExp(`^(\\d{2})/(\\d{2})/(\\d{4})\\s+(.+?)\\s+(${AMOUNT})\\s+(${AMOUNT})$`);
const BROUGHT_FORWARD = new RegExp(`^Balance Brought Forward\\s+([A-Z]{3})\\s+(${AMOUNT})$`, 'i');
const CARRIED_FORWARD = new RegExp(`^Balance Carried Forward\\s+([A-Z]{3})\\s+(${AMOUNT})$`, 'i');
const ACCOUNT_HEADER = /^(.+?)\s+Account No\.?\s*([\d-]+)$/i;
const CURRENCY = /^CURRENCY:\s*(.+)$/i;
/** Page headers and footers that sit between a row and its wrapped lines. */
const FURNITURE = /^(Date Description|Transaction Details as of|SG\d+ \(|PDS_|Page \d+|w$)/i;

/** The paying-off kinds of outgoing row: a card's bill, or a top-up of the PayLah! wallet. */
const CARD_BILL = /\b(CCC|DBSC)\b\s*-\s*\d{4,}|\bCARD\b.*\bBILL\b/i;
const WALLET_TOP_UP = /TOP-?UP TO PAYLAH/i;

const isDbsStyle = (lines: string[]) =>
  lines.some((l) => /^Balance Brought Forward\b/i.test(l)) && lines.some((l) => /Withdrawal \(-\)/i.test(l));
/** HSBC ("BALANCE BROUGHT FORWARD") and OCBC ("BALANCE B/F"): rows start with a date, amounts sit in Withdrawal and Deposit columns. */
const isLedgerStyle = (lines: string[]) =>
  lines.some((l) => /BALANCE\s+(BROUGHT FORWARD|B\/F)\b/i.test(l)) &&
  lines.some((l) => /\bWithdrawals?\b/i.test(l) && /\bDeposits?\b/i.test(l));

export function isAccountStatement(lines: string[]): boolean {
  return isDbsStyle(lines) || isLedgerStyle(lines);
}

interface Row {
  date: string;
  type: string;
  amount: Cents;
  deposit: boolean;
  account: string;
  details: string[];
}

export function parseAccountStatement(pages: PdfText[][], today = new Date()): ImportFile {
  const lines = pages.flatMap(toLines);
  return isDbsStyle(lines) ? parseDbsStatement(pages) : parseLedgerStatement(pages, today);
}

function parseDbsStatement(pages: PdfText[][]): ImportFile {
  const rows: Row[] = [];
  const accounts = new Map<string, { opening?: Cents; closing?: Cents }>();
  let account = '';
  let inTable = false;
  let balance: Cents | undefined;
  let current: Row | undefined;

  for (const line of pages.flatMap(toLines)) {
    const header = line.match(ACCOUNT_HEADER);
    if (header) {
      account = header[1].trim();
      accounts.set(account, accounts.get(account) ?? {});
      current = undefined;
      inTable = false;
      continue;
    }
    const cur = line.match(CURRENCY);
    if (cur) {
      // Only SGD rows are read; a foreign currency section is skipped rather than mixed in at the wrong value.
      inTable = /SINGAPORE DOLLAR/i.test(cur[1]);
      continue;
    }
    const brought = line.match(BROUGHT_FORWARD);
    if (brought) {
      balance = toCents(brought[2])!;
      const entry = accounts.get(account);
      if (entry && entry.opening === undefined) entry.opening = balance;
      inTable = true;
      current = undefined;
      continue;
    }
    const carried = line.match(CARRIED_FORWARD);
    if (carried) {
      const entry = accounts.get(account);
      if (entry) entry.closing = toCents(carried[2])!;
      current = undefined;
      inTable = false;
      continue;
    }
    if (!inTable || FURNITURE.test(line)) continue;

    const m = line.match(ROW);
    if (m) {
      const amount = Math.abs(toCents(m[5])!);
      const after = toCents(m[6])!;
      // The direction is whichever way the running balance moved; without it the row can't be placed.
      const deposit = balance !== undefined ? after >= balance : false;
      balance = after;
      // The last page of an account has no "carried forward" line, so its closing balance is the last row's.
      const entry = accounts.get(account);
      if (entry) entry.closing = after;
      current = { date: `${m[3]}-${m[2]}-${m[1]}`, type: m[4].trim(), amount, deposit, account, details: [] };
      rows.push(current);
    } else if (current && !/^Total Balance Carried Forward/i.test(line)) {
      current.details.push(line);
    }
  }

  if (!rows.length) {
    throw new StatementError(
      'no-transactions',
      'No transactions found in this account statement. Its layout may not be supported yet: try the Claude route below.',
    );
  }

  // Balances follow the card convention (negative when in credit), so an account holding money is negative and
  // previous + expenses − refunds − payments = new holds for withdrawals (expenses) and deposits (payments) alike.
  const known = [...accounts.values()].filter((a) => a.opening !== undefined && a.closing !== undefined);
  const opening = known.reduce((t, a) => t - a.opening!, 0);
  const closing = known.reduce((t, a) => t - a.closing!, 0);
  const names = [...accounts.keys()];
  return {
    magpie: 1,
    statement: {
      ...(names.length === 1 ? { account: names[0] } : {}),
      currency: 'SGD',
      ...(known.length === names.length && known.length > 0 ? { previousBalance: opening / 100, newBalance: closing / 100 } : {}),
    },
    transactions: rows.map(toTransaction),
  };
}

function toTransaction(row: Row): ImportTransaction {
  const type = row.type.replace(/^Advice\s+/i, '');
  const party = row.details.map((d) => d.match(/^(?:TO|FROM)\s*:\s*(.+)$/i)?.[1]).find(Boolean);
  const details = row.details.join(' ');
  const topUp = !row.deposit && type.match(/Funds Transfer/i) && WALLET_TOP_UP.test(details);
  const cardBill = !row.deposit && /Bill Payment/i.test(type) && CARD_BILL.test(details);
  const card = details.match(/(\d{4})\s*:/)?.[1];
  const description = topUp
    ? 'PayLah! top-up'
    : cardBill
      ? `Card bill payment${card ? ` (…${card})` : ''}`
      : (party ?? (/Interest/i.test(type) ? type : (row.details[0] ?? type)));
  const kind: ImportKind = row.deposit ? 'payment' : 'expense';
  return {
    date: row.date,
    description,
    amount: row.amount / 100,
    kind,
    account: row.account,
    ...(topUp || cardBill ? { skip: true } : {}),
  };
}


// ---- HSBC and OCBC: a date starts each row; its amount may be on any line of the row ----

const AMOUNT_ONLY = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
/** "05Sep2026" (HSBC) and "06 JUL 06 JUL" (OCBC: transaction date, then value date). */
const FULL_DATE_ROW = /^(\d{1,2})\s?([A-Za-z]{3})\s?(\d{4})\b\s*(.*)$/;
const TWO_DATE_ROW = /^(\d{1,2})\s?([A-Za-z]{3})\s+\d{1,2}\s?[A-Za-z]{3}\b\s*(.*)$/;
const OPENING = /BALANCE\s+(?:BROUGHT FORWARD|B\/F)/i;
const CLOSING = /^(?:CLOSING BALANCE|BALANCE C\/F)/i;
const TABLE_END = /^(?:Transaction (?:Turnover|Count)|Total\b|END OF STATEMENT)|Insurance Scheme/i;

interface Cell {
  cents: Cents;
  cx: number;
}

interface Block {
  date: string;
  pool: string[];
  amounts: Cell[];
  account?: string;
}

const cleanAmount = (text: string) => text.replace(/^\|+|\|+$/g, '').replace(/(?:DR|CR)$/i, '');

function parseLedgerStatement(pages: PdfText[][], today: Date): ImportFile {
  const lines = pages.flatMap((page) => lineItems(page));
  const text = (line: PdfText[]) => toLines(line)[0] ?? '';

  // Withdrawal and Deposit headings: an amount belongs to whichever column's heading it sits nearest.
  let withdrawalCx: number | undefined;
  let depositCx: number | undefined;
  for (const line of lines) {
    for (const item of line) {
      const centre = item.x + item.width / 2;
      if (withdrawalCx === undefined && /^Withdrawals?$/i.test(item.str.trim())) withdrawalCx = centre;
      if (depositCx === undefined && /^Deposits?$/i.test(item.str.trim())) depositCx = centre;
    }
  }
  const isDeposit = (cx: number) =>
    withdrawalCx !== undefined && depositCx !== undefined ? Math.abs(cx - depositCx) < Math.abs(cx - withdrawalCx) : false;

  const blocks: Block[] = [];
  const sections: { account?: string; opening?: Cents; closing?: Cents }[] = [];
  let inTable = false;
  let prev: Cents | undefined;
  let current: Block | undefined;
  let account: string | undefined;
  let before = '';

  const amountsIn = (line: PdfText[]): Cell[] =>
    line.filter((i) => AMOUNT_ONLY.test(cleanAmount(i.str.trim()))).map((i) => ({ cents: toCents(cleanAmount(i.str.trim()))!, cx: i.x + i.width / 2 }));
  const words = (line: PdfText[]) => line.filter((i) => !AMOUNT_ONLY.test(cleanAmount(i.str.trim())));

  for (const line of lines) {
    const full = text(line);
    const named = full.match(/^[^A-Za-z0-9]*([A-Z][A-Z0-9 &-]+?)\s+\d{3}-\d{6}-\d{3}\b/);
    if (named) account = named[1].trim();
    else if (/^Account No\.?\s*\d+/i.test(full) && before) account = before;
    before = full;

    if (OPENING.test(full)) {
      const opening = amountsIn(line).at(-1)?.cents;
      sections.push({ account, opening });
      prev = opening;
      inTable = true;
      current = undefined;
      continue;
    }
    if (!inTable) continue;
    if (CLOSING.test(full.replace(/^[^A-Za-z]+/, ''))) {
      const closing = amountsIn(line).at(-1)?.cents;
      const section = sections.at(-1);
      if (section && closing !== undefined) section.closing = closing;
      current = undefined;
      inTable = false;
      continue;
    }
    if (TABLE_END.test(full)) {
      current = undefined;
      inTable = false;
      continue;
    }

    const content = text(words(line));
    const dated = content.match(FULL_DATE_ROW);
    const twoDated = dated ? null : content.match(TWO_DATE_ROW);
    if (dated || twoDated) {
      const [day, mon, rest] = dated ? [dated[1], dated[2], dated[4]] : [twoDated![1], twoDated![2], twoDated![3]];
      const month = monthIndex(mon);
      const date = dated ? new Date(Number(dated[3]), month, Number(day)) : dateBefore(Number(day), month, today);
      if (month < 0 || !date) {
        current = undefined;
        continue;
      }
      current = { date: iso(date), pool: [rest.replace(/^[^A-Za-z0-9]+/, '')].filter(Boolean), amounts: amountsIn(line), account };
      blocks.push(current);
    } else if (current && content.length <= 70) {
      current.amounts.push(...amountsIn(line));
      if (content) current.pool.push(content.replace(/^[^A-Za-z0-9]+/, ''));
    }
  }

  const transactions: ImportTransaction[] = [];
  for (const block of blocks) {
    if (!block.amounts.length) continue;
    // With a Balance column the row has two figures, and the balance's movement settles the direction.
    const [amount, balance] = block.amounts.length >= 2 ? block.amounts.slice(-2) : [block.amounts[0], undefined];
    const deposit = balance && prev !== undefined ? balance.cents >= prev : isDeposit(amount.cx);
    if (balance) prev = balance.cents;
    else if (prev !== undefined) prev += deposit ? amount.cents : -amount.cents;
    transactions.push(ledgerTransaction(block, amount.cents, deposit));
  }

  if (!transactions.length) {
    throw new StatementError(
      'no-transactions',
      'No transactions found in this account statement. Its layout may not be supported yet: try the Claude route below.',
    );
  }

  const known = sections.filter((x) => x.opening !== undefined && x.closing !== undefined);
  const names = new Set(sections.map((x) => x.account).filter(Boolean));
  return {
    magpie: 1,
    statement: {
      ...(names.size === 1 ? { account: [...names][0] } : {}),
      currency: 'SGD',
      ...(known.length > 0 && known.length === sections.length
        ? { previousBalance: -known.reduce((t, x) => t + x.opening!, 0) / 100, newBalance: -known.reduce((t, x) => t + x.closing!, 0) / 100 }
        : {}),
    },
    transactions,
  };
}

function ledgerTransaction(block: Block, cents: Cents, deposit: boolean): ImportTransaction {
  const pool = block.pool;
  const find = (re: RegExp) => pool.map((l) => l.match(re)).find(Boolean);
  const cardNumber = find(/^TO\s+(\d{4}\s?\d{4}\s?\d{4}\s?(\d{4}))$/i) ?? find(/^((\d{12})(\d{4}))$/);
  const to = find(/^to\s+(?!\d{4}\s?\d{4})(.+)$/i)?.[1];
  const other = find(/^OTHR\s+(.+)$/)?.[1];
  const interest = pool.find((l) => /INTEREST/i.test(l));
  const bareCard = pool.some((l) => /^\d{16}$/.test(l));
  const cardBill = !deposit && (cardNumber !== undefined || bareCard);
  const description = cardBill
    ? `Card bill payment (${to ?? `…${(cardNumber?.[2] ?? '').slice(-4)}`})`
    : (to ?? other ?? interest ?? firstDetail(pool));
  return {
    date: block.date,
    description,
    amount: cents / 100,
    kind: deposit ? 'payment' : 'expense',
    ...(block.account ? { account: block.account } : {}),
    ...(cardBill ? { skip: true } : {}),
  };
}

/** The row's first descriptive line, or the one after it when that is only a generic type ("GIRO PAYMENT", "FAST PAYMENT"). */
function firstDetail(pool: string[]): string {
  const lines = pool.filter((l) => !/^(REF|HIB|OTHR|DBSS)\b/i.test(l));
  const generic = /^(FAST PAYMENT|GIRO( PAYMENT)?|FUND TRANSFER|INTERNET TRANSFER|PAYMENT)$/i;
  return (lines.length > 1 && generic.test(lines[0]) ? lines[1] : lines[0]) ?? 'Transaction';
}
