import { describe, expect, it } from 'vitest';
import { parseAccountStatement } from './accountStatement';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults';
import { buildDraft } from './importFile';
import { readStatement } from './readStatement';
import type { PdfText } from './statement';

const line = (y: number, ...cells: [number, string][]): PdfText[] =>
  cells.map(([x, str]) => ({ str, x, y, width: str.length * 5, height: 8 }));

// Layout of a POSB/DBS consolidated statement's account pages (made-up figures and names). Each row prints one
// amount and the running balance; whether it is a withdrawal or a deposit shows only in how the balance moved.
const head = (y: number) => [
  ...line(y, [40, 'DBS Multiplier Account'], [200, 'Account No. 111-222222-3']),
  ...line(y - 10, [40, 'Date'], [100, 'Description'], [300, 'Withdrawal (-)'], [380, 'Deposit (+)'], [460, 'Balance']),
];
const account: PdfText[][] = [
  [
    ...line(820, [40, 'Transaction Details as at 30 Sep 2026']),
    ...head(800),
    ...line(780, [40, 'CURRENCY: SINGAPORE DOLLAR']),
    ...line(770, [40, 'Balance Brought Forward'], [380, 'SGD 1,000.00']),
    ...line(760, [40, '02/09/2026'], [100, 'GIRO Payments / Collections via GIRO'], [330, '100.00'], [460, '900.00']),
    ...line(750, [100, 'ACME INSURANCE']),
    ...line(740, [100, 'REF 1234']),
    ...line(730, [40, '03/09/2026'], [100, 'Advice FAST Payment / Receipt'], [330, '20.00'], [460, '880.00']),
    ...line(720, [100, 'PAYNOW TRANSFER 111']),
    ...line(710, [100, 'TO: SAMPLE CAFE PTE LTD']),
    ...line(700, [100, 'OTHER']),
    ...line(690, [40, '04/09/2026'], [100, 'Advice FAST Payment / Receipt'], [400, '50.00'], [460, '930.00']),
    ...line(680, [100, 'INCOMING PAYNOW REF 2']),
    ...line(670, [100, 'FROM: A FRIEND']),
    ...line(660, [40, '05/09/2026'], [100, 'Advice Funds Transfer'], [330, '10.00'], [460, '920.00']),
    ...line(650, [100, 'TOP-UP TO PAYLAH! :']),
    ...line(640, [100, '90019218']),
    ...line(630, [40, 'Balance Carried Forward'], [380, 'SGD 920.00']),
    ...line(100, [40, 'SG40020000876 (08/2014) DBS Co. Reg. No. 196800306E']),
    ...line(90, [40, 'Transaction Details as of 30 Sep 2026 Page 2 of 3']),
  ],
  [
    ...head(800),
    ...line(780, [40, 'w']),
    ...line(770, [40, 'Balance Brought Forward'], [380, 'SGD 920.00']),
    ...line(760, [40, '06/09/2026'], [100, 'Advice Bill Payment'], [330, '200.00'], [460, '720.00']),
    ...line(750, [100, 'CCC - 4111222233334444 : I-BANK']),
    ...line(740, [100, 'REF: 17888251419947989774']),
    ...line(730, [40, '07/09/2026'], [100, 'Interest Earned'], [400, '1.50'], [460, '721.50']),
    ...line(720, [100, 'PREFERENTIAL RATE BASED ON TOTAL']),
    ...line(710, [40, 'Total Balance Carried Forward in SGD:'], [300, '330.00'], [380, '51.50'], [460, '721.50']),
  ],
];

describe('parseAccountStatement', () => {
  const file = parseAccountStatement(account);
  const row = (text: string) => file.transactions.find((t) => t.description.includes(text))!;

  it('names the account and reads every row once', () => {
    expect(file.statement.account).toBe('DBS Multiplier Account');
    expect(file.transactions).toHaveLength(6);
  });

  it('works out direction from the running balance and describes a row by its payee', () => {
    expect(row('SAMPLE CAFE')).toMatchObject({ date: '2026-09-03', amount: 20, kind: 'expense' });
    expect(row('A FRIEND')).toMatchObject({ date: '2026-09-04', amount: 50, kind: 'payment' });
    expect(row('ACME INSURANCE')).toMatchObject({ amount: 100, kind: 'expense' });
    expect(row('Interest Earned')).toMatchObject({ amount: 1.5, kind: 'payment' });
  });

  it('marks card bills and wallet top-ups as skipped money out, not spending to count', () => {
    expect(row('PayLah! top-up')).toMatchObject({ amount: 10, kind: 'expense', skip: true });
    expect(row('Card bill payment (…4444)')).toMatchObject({ amount: 200, kind: 'expense', skip: true });
    expect(file.transactions.filter((t) => t.skip)).toHaveLength(2);
  });

  it('keeps page furniture and wrapped lines out of the rows', () => {
    expect(file.transactions.map((t) => t.description).join(' ')).not.toMatch(/Page|SG4002|REF|Withdrawal/);
  });

  it('checks every row against the opening and closing balances', () => {
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(file.statement).toMatchObject({ previousBalance: -1000, newBalance: -721.5 });
    expect(draft.reconciliation).toEqual({ basis: 'balance', expected: 27850, actual: 27850 });
    expect(draft.rows.filter((r) => r.include).map((r) => r.merchant)).toEqual(['Acme Insurance', 'Sample Cafe']);
  });

  it('flags a row that was misread, by not adding up', () => {
    const wrong = account.map((page) => page.map((i) => (i.str === '20.00' ? { ...i, str: '2.00' } : i)));
    const draft = buildDraft(parseAccountStatement(wrong), { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(draft.reconciliation!.expected).not.toBe(draft.reconciliation!.actual);
  });
});

describe('readStatement', () => {
  it('sends an account statement to the account parser', () => {
    expect(readStatement(account, DEFAULT_ACCOUNTS).statement.account).toBe('DBS Multiplier Account');
  });
});

// HSBC savings account (made-up figures): dates like 14Sep2026, the amount and balance on the row's last line.
const hsbcSavings: PdfText[][] = [
  [
    ...line(800, [40, 'EVERYDAY GLOBAL ACC 144-111111-222']),
    ...line(790, [40, 'Date'], [100, 'Transaction Details'], [330, 'Deposits'], [400, 'Withdrawals'], [480, 'Balance (DR=Debit)']),
    ...line(780, [40, 'SGD']),
    ...line(770, [40, '05Sep2026'], [100, 'BALANCE BROUGHT FORWARD'], [500, '1,000.00']),
    ...line(760, [40, '14Sep2026'], [70, '+'], [100, 'TO 4111 2222 3333 4444']),
    ...line(750, [100, 'HIB- 586222X212442']),
    ...line(740, [100, 'REF'], [130, 'IB03-00877'], [410, '100.00'], [500, '900.00']),
    ...line(730, [40, '20Sep2026'], [100, 'GIRO PAYMENT']),
    ...line(720, [100, 'ACME GYM']),
    ...line(710, [100, 'REF'], [130, 'ZDD4-00001'], [410, '30.00'], [500, '870.00']),
    ...line(700, [40, '24Sep2026'], [100, 'CREDIT INTEREST']),
    ...line(690, [100, 'REF'], [130, 'ZDD4-00007'], [340, '0.43'], [500, '870.43']),
    ...line(680, [100, 'CLOSING BALANCE'], [500, '870.43']),
    ...line(670, [100, 'Transaction Turnover'], [340, '0.43'], [410, '130.00']),
  ],
];

describe('parseAccountStatement (HSBC savings layout)', () => {
  const file = parseAccountStatement(hsbcSavings);

  it('finds the amount on the last line of a row and the direction from the balance', () => {
    expect(file.transactions.map((t) => [t.date, t.kind, t.amount, t.description])).toEqual([
      ['2026-09-14', 'expense', 100, 'Card bill payment (…4444)'],
      ['2026-09-20', 'expense', 30, 'ACME GYM'],
      ['2026-09-24', 'payment', 0.43, 'CREDIT INTEREST'],
    ]);
    expect(file.transactions[0].skip).toBe(true);
  });

  it('checks the rows against the opening and closing balances', () => {
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(file.statement).toMatchObject({ account: 'EVERYDAY GLOBAL ACC', previousBalance: -1000, newBalance: -870.43 });
    expect(draft.reconciliation!.expected).toBe(draft.reconciliation!.actual);
  });
});

// OCBC 360 account as a screenshot (made-up figures): no year on a row, no balance column, so the Withdrawal and
// Deposit columns decide the direction.
const ocbc: PdfText[][] = [
  [
    ...line(800, [40, '360 ACCOUNT']),
    ...line(790, [40, 'Account No. 515000000001']),
    ...line(780, [40, 'Date'], [90, 'Date'], [140, 'Description'], [300, 'Cheque'], [400, 'Withdrawal'], [500, 'Deposit']),
    ...line(770, [140, 'BALANCE B/F']),
    ...line(760, [40, '06 JUL'], [90, '06 JUL'], [140, 'FAST PAYMENT'], [450, '9.00']),
    ...line(750, [140, 'OTHR SAMPLE PERSON J']),
    ...line(740, [140, 'nugges n night']),
    ...line(730, [40, '08 JUL'], [90, '08 JUL'], [140, 'FAST PAYMENT'], [450, '5.30']),
    ...line(720, [140, 'via PayNow-UEN']),
    ...line(710, [140, 'to SAMPLE HOLDINGS PT']),
    ...line(700, [40, '09 JUL'], [90, '09 JUL'], [140, 'BONUS INTEREST'], [530, '86.24']),
    ...line(690, [140, '360 SALARY BONUS']),
    ...line(680, [40, '12 JUL'], [90, '13 JUL'], [140, 'FAST PAYMENT'], [450, '188.75']),
    ...line(670, [140, '4111222233334444']),
    ...line(660, [140, 'to Trust sample']),
    ...line(650, [40, 'Deposit Insurance Scheme']),
    ...line(640, [40, 'Singapore dollar deposits of non-bank depositors are insured by the Singapore Deposit Insurance Corporation']),
  ],
];

describe('parseAccountStatement (OCBC layout)', () => {
  const file = parseAccountStatement(ocbc, new Date(2026, 9, 31));

  it('puts each amount in its column and describes a row by its payee', () => {
    expect(file.transactions.map((t) => [t.date, t.kind, t.amount, t.description])).toEqual([
      ['2026-07-06', 'expense', 9, 'SAMPLE PERSON J'],
      ['2026-07-08', 'expense', 5.3, 'SAMPLE HOLDINGS PT'],
      ['2026-07-09', 'payment', 86.24, 'BONUS INTEREST'],
      ['2026-07-12', 'expense', 188.75, 'Card bill payment (Trust sample)'],
    ]);
    expect(file.transactions[3].skip).toBe(true);
  });

  it('names the account, has nothing to check against, and ignores the page footer', () => {
    expect(file.statement).toEqual({ account: '360 ACCOUNT', currency: 'SGD' });
    expect(file.transactions.map((t) => t.description).join(' ')).not.toMatch(/Insurance|Singapore dollar/);
  });

  it('puts a date without a year in the latest year that is not in the future', () => {
    const early = parseAccountStatement(ocbc, new Date(2026, 2, 1));
    expect(early.transactions[0].date).toBe('2025-07-06');
  });
});
