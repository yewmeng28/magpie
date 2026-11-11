import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults';
import { buildDraft, commitDraft } from './importFile';
import { parseStatement, StatementError, toLines, unreadLines, type PdfText } from './statement';

/** A line of text runs at height y; each cell is [x, text]. Widths approximate 5 units per character. */
const line = (y: number, ...cells: [number, string][]): PdfText[] =>
  cells.map(([x, str]) => ({ str, x, y, width: str.length * 5, height: 8 }));

// Layout of a POSB/DBS statement (made-up figures and names). Its transactions span a year boundary.
const posb: PdfText[][] = [
  [
    ...line(800, [40, 'Credit Cards']),
    ...line(780, [40, 'STATEMENT DATE'], [160, 'CREDIT LIMIT'], [260, 'MINIMUM PAYMENT'], [380, 'PAYMENT DUE DATE']),
    ...line(770, [40, '14 Jan 2027'], [160, '$5,000.00'], [260, '$50.00'], [380, '09 Feb 2027']),
    ...line(700, [40, 'DATE'], [100, 'DESCRIPTION'], [420, 'AMOUNT (S$)']),
    ...line(690, [40, 'POSB everyday CARD NO.: 4321 8765 0000 1111']),
    ...line(680, [100, 'PREVIOUS BALANCE'], [420, '200.00']),
    ...line(670, [40, '22 DEC'], [100, 'BILL PAYMENT - DBS INTERNET/WIRELESS'], [420, '200.00'], [460, 'CR']),
    ...line(660, [100, 'REF NO: 17874034174565031484']),
    ...line(650, [40, 'NEW TRANSACTIONS JANE DOE']),
    ...line(640, [40, '15 DEC'], [100, 'BUS/MRT 907133239'], [420, '4.60']),
    ...line(630, [40, '28 DEC'], [100, 'GRAB* A-9N92OWBWW5PEAV'], [420, '13.70']),
    ...line(620, [40, '03 JAN'], [100, 'UNIQLO ION'], [420, '29.90'], [460, 'CR']),
    ...line(610, [40, '05 JAN'], [100, 'NTUC FP-BEDOK'], [250, 'SINGAPORE'], [310, '065'], [420, '2.75']),
  ],
  [
    ...line(800, [40, '08 JAN'], [100, 'SOME CAFE'], [410, '1,042.30']),
    ...line(790, [100, 'SUB-TOTAL:'], [410, '1,033.45']),
    ...line(780, [100, 'TOTAL:'], [410, '1,033.45']),
    ...line(770, [100, 'GRAND TOTAL FOR ALL CARD ACCOUNTS:'], [410, '1,033.45']),
  ],
];

// Layout of an HSBC statement: post and transaction dates, wrapped location lines, and an account summary column
// printed on the same lines as the transactions.
const hsbc: PdfText[][] = [
  [
    ...line(820, [40, 'HSBC VISA REVOLUTION']),
    ...line(810, [40, 'HSBC Bank (Singapore) Limited (Company Registration No. 201420624K)']),
    ...line(700, [40, 'Statement period'], [240, 'Total Due'], [320, 'Minimum Payment'], [420, 'Payment Due Date']),
    ...line(690, [40, 'From 29 DEC 2026 to 28 JAN 2027'], [240, '286.68'], [320, '50.00'], [420, '19 Feb 2027']),
    ...line(600, [40, 'POST'], [80, 'TRAN'], [380, 'ACCOUNT SUMMARY'], [560, 'SGD']),
    ...line(591, [40, 'DATE'], [80, 'DATE'], [120, 'DESCRIPTION'], [270, 'AMOUNT(SGD)'], [380, 'Previous Statement Balance'], [550, '73.10']),
    ...line(570, [120, 'Previous Statement Balance'], [300, '73.10'], [380, 'GST Charges'], [550, '0.00']),
    ...line(550, [40, '02 Jan'], [80, '31 Dec'], [120, "MCDONALD'S (CCP)"], [300, '4.50'], [380, 'Cash Limit (SGD)'], [530, '9,040.00']),
    ...line(540, [120, 'SINGAPORE'], [180, 'SG']),
    ...line(520, [40, '09 Jan'], [80, '08 Jan'], [120, 'DBS'], [200, 'Visa Direct'], [260, 'SG'], [290, '152.83CR'], [380, 'Purchase'], [550, '27.80%']),
    ...line(500, [40, '10 Jan'], [80, '08 Jan'], [120, 'LUCKIN COFFEE (SGP) PT'], [300, '7.25']),
    ...line(490, [120, 'SINGAPORE'], [180, 'SG']),
  ],
  [...line(800, [40, 'Change of personal particulars? Visit www.hsbc.com.sg/FAQ for more details.'])],
  [
    ...line(800, [40, 'HSBC VISA REVOLUTION']),
    ...line(700, [40, '12 Jan'], [80, '10 Jan'], [120, 'XIANG XIANG HUNAN CUIS'], [290, '354.66']),
    ...line(650, [120, 'Total Due'], [280, '286.68']),
  ],
];

const today = new Date(2027, 2, 1);

describe('toLines', () => {
  it('joins runs on the same baseline, left to right, tolerating a little jitter', () => {
    const items = [
      { str: '4.60', x: 400, y: 100.4, width: 20, height: 8 },
      { str: '07 AUG', x: 40, y: 101.6, width: 30, height: 8 },
      { str: 'BUS/MRT', x: 100, y: 101, width: 35, height: 8 },
      { str: 'next line', x: 40, y: 90, width: 40, height: 8 },
    ];
    expect(toLines(items)).toEqual(['07 AUG BUS/MRT 4.60', 'next line']);
  });
});

describe('parseStatement (POSB/DBS layout)', () => {
  const file = parseStatement(posb, DEFAULT_ACCOUNTS, today);

  it('reads every transaction line and nothing else', () => {
    expect(file.transactions.map((t) => [t.date, t.description, t.amount, t.kind])).toEqual([
      ['2026-12-22', 'BILL PAYMENT - DBS INTERNET/WIRELESS', 200, 'payment'],
      ['2026-12-15', 'BUS/MRT 907133239', 4.6, 'expense'],
      ['2026-12-28', 'GRAB* A-9N92OWBWW5PEAV', 13.7, 'expense'],
      ['2027-01-03', 'UNIQLO ION', 29.9, 'refund'],
      ['2027-01-05', 'NTUC FP-BEDOK SINGAPORE 065', 2.75, 'expense'],
      ['2027-01-08', 'SOME CAFE', 1042.3, 'expense'],
    ]);
  });

  it('never picks up the card number or cardholder name', () => {
    const text = JSON.stringify(file);
    expect(text).not.toMatch(/4321|0000 1111|JANE/);
  });

  it('assigns the card section to the matching account', () => {
    expect(file.statement.account).toBe('POSB Everyday');
    expect(file.transactions.every((t) => t.account === 'POSB Everyday')).toBe(true);
  });

  it('reconciles all rows against the balances', () => {
    expect(file.statement).toMatchObject({ previousBalance: 200, newBalance: 1033.45 });
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(draft.reconciliation).toEqual({ basis: 'balance', expected: 83345, actual: 83345 });
    expect(draft.rows.every((r) => r.accountId === 'posb-everyday')).toBe(true);
    expect(draft.rows.map((r) => r.include)).toEqual([false, true, true, true, true, true]);
  });
});

describe('parseStatement (HSBC layout)', () => {
  const file = parseStatement(hsbc, DEFAULT_ACCOUNTS, today);

  it('uses the earlier of the two dates, and ignores the summary column beside each row', () => {
    expect(file.transactions.map((t) => [t.date, t.description, t.amount, t.kind])).toEqual([
      ['2026-12-31', "MCDONALD'S (CCP)", 4.5, 'expense'],
      ['2027-01-08', 'DBS Visa Direct SG', 152.83, 'payment'],
      ['2027-01-08', 'LUCKIN COFFEE (SGP) PT', 7.25, 'expense'],
      ['2027-01-10', 'XIANG XIANG HUNAN CUIS', 354.66, 'expense'],
    ]);
  });

  it('matches the card by its alias and reconciles against the total due', () => {
    expect(file.statement).toMatchObject({ account: 'HSBC Revolution', previousBalance: 73.1, newBalance: 286.68 });
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(draft.reconciliation).toEqual({ basis: 'balance', expected: 21358, actual: 21358 });
  });
});

describe('parseStatement problems', () => {
  it('explains a PDF without text, like a scan or a flattened redaction', () => {
    expect(() => parseStatement([[], []], DEFAULT_ACCOUNTS, today)).toThrow(StatementError);
    try {
      parseStatement([[]], DEFAULT_ACCOUNTS, today);
    } catch (e) {
      expect((e as StatementError).problem).toBe('no-text');
    }
  });

  it('explains text without any transactions', () => {
    expect(() => parseStatement([line(800, [40, 'Hello'])], DEFAULT_ACCOUNTS, today)).toThrow(/No transactions found/);
  });

  it('falls back to today for the year when the statement prints no full date', () => {
    const file = parseStatement([line(800, [40, '05 FEB'], [100, 'COFFEE'], [300, '3.20'])], DEFAULT_ACCOUNTS, today);
    expect(file.transactions[0].date).toBe('2027-02-05');
    expect(file.statement.previousBalance).toBeUndefined();
  });
});

describe('unreadLines', () => {
  it('lists lines that carry an amount but were not read as a transaction or a balance', () => {
    const pages = [
      [
        ...line(700, [40, 'PREVIOUS BALANCE'], [420, '200.00']),
        ...line(690, [40, '15 DEC'], [100, 'BUS/MRT 907133239'], [420, '4.60']),
        // OCR misread the month, so this row can't be placed.
        ...line(680, [40, '2B DEC'], [100, 'GRAB RIDE'], [420, '57.68']),
        ...line(670, [100, 'Thank you for banking with us']),
      ],
    ];
    expect(unreadLines(pages)).toEqual(['2B DEC GRAB RIDE 57.68']);
  });
});

describe('purchases total', () => {
  const read = (...rows: PdfText[][]) =>
    parseStatement([[...line(800, [40, '20 Oct 2026']), ...rows.flat(), ...line(600, [40, '05 Oct'], [100, 'SHOP'], [420, '5.00'])]], DEFAULT_ACCOUNTS, new Date(2026, 9, 20));

  it('reads "Purchases & Debits" from the account summary', () => {
    expect(read(line(700, [300, 'Purchases & Debits'], [420, '522.12'])).statement.purchasesTotal).toBe(522.12);
  });
  it('reads the purchases figure when OCR runs the two summary rows together', () => {
    expect(read(line(700, [300, 'Payments & Credits Debits'], [420, '821.77CR522.12'])).statement.purchasesTotal).toBe(522.12);
  });
  it('is absent when the statement prints none', () => {
    expect(read([]).statement.purchasesTotal).toBeUndefined();
  });
  it('drops stray marks OCR leaves before a description', () => {
    const file = parseStatement([[...line(800, [40, '20 Oct 2026']), ...line(600, [40, '05 Oct'], [100, '© SHOP'], [420, '5.00'])]], DEFAULT_ACCOUNTS, new Date(2026, 9, 20));
    expect(file.transactions[0].description).toBe('SHOP');
  });
});

// Layout of a Standard Chartered statement (made-up figures): a transaction date and a posting date, a "Transaction
// Ref" after each merchant, the original amount of a purchase abroad on a line of its own, and a points summary.
const scb: PdfText[][] = [
  [
    ...line(820, [40, 'Credit Card and Personal Loan Statement']),
    ...line(810, [40, 'A CARDHOLDER'], [300, 'Statement Date : 16 Jun 2026']),
    ...line(800, [300, 'Payment Due Date : 08 Jul 2026']),
    ...line(700, [40, 'JOURNEY CREDIT CARD 4231-79XX-XXXX-2201']),
    ...line(690, [40, 'BALANCE FROM PREVIOUS STATEMENT'], [420, '100.00']),
    ...line(680, [40, '13 May'], [90, '18 May'], [140, 'BUS/MRT 852644496 SINGAPORE SG Transaction Ref 74541836136288081943603'], [520, '4.04']),
    ...line(670, [40, '18 May'], [90, '19 May'], [140, 'AXS SERVICE Singapore SG Transaction Ref 74093006139000101766164'], [520, '50.00']),
    ...line(660, [40, '02 Jun'], [90, '03 Jun'], [140, 'PAYMENT AT AXS 40325001 kiosk lo'], [520, '100.00CR']),
    ...line(650, [40, '11 Jun'], [90, '12 Jun'], [140, 'LDP PENCHALA KUALA LUMPU MY Transaction Ref 24553586162110601965635'], [520, '0.70']),
    ...line(640, [140, 'MYR 2.10']),
    ...line(630, [40, '09 Jun'], [90, '11 Jun'], [140, 'SHOPEE SINGAPORE GP SINGAPORE SG Transaction Ref 74541836161288078645482'], [520, '10.87CR']),
    ...line(620, [40, '16 Jun'], [90, '16 Jun'], [140, 'ANNUAL FEE - BASIC CARD'], [520, '180.00']),
    ...line(610, [140, 'NEW BALANCE'], [520, '223.87']),
  ],
  [
    ...line(800, [40, '360° REWARDS POINTS SUMMARY']),
    ...line(790, [40, 'Total 360° Reward Points awarded in this statement'], [520, '1,107']),
    ...line(780, [40, 'Total points brought forward'], [520, '101,325']),
    ...line(770, [40, 'Points used and/or expired'], [520, '33']),
    ...line(760, [40, 'Points adjustment in this statement'], [520, '0']),
    ...line(750, [40, 'Total points available'], [520, '102,399']),
  ],
];

describe('parseStatement (Standard Chartered layout)', () => {
  const file = parseStatement(scb, DEFAULT_ACCOUNTS, new Date(2026, 5, 20));

  it('reads each row, without its reference, on the earlier of its two dates', () => {
    expect(file.transactions.map((t) => [t.date, t.kind, t.amount, t.description])).toEqual([
      ['2026-05-13', 'expense', 4.04, 'BUS/MRT 852644496 SINGAPORE SG'],
      ['2026-05-18', 'expense', 50, 'AXS SERVICE Singapore SG'],
      ['2026-06-02', 'payment', 100, 'PAYMENT AT AXS 40325001 kiosk lo'],
      ['2026-06-11', 'expense', 0.7, 'LDP PENCHALA KUALA LUMPU MY'],
      ['2026-06-09', 'refund', 10.87, 'SHOPEE SINGAPORE GP SINGAPORE SG'],
      ['2026-06-16', 'expense', 180, 'ANNUAL FEE - BASIC CARD'],
    ]);
    expect(file.transactions.every((t) => t.account === 'SC Journey')).toBe(true);
  });

  it('flags a purchase abroad by the currency on the line below', () => {
    expect(file.transactions.filter((t) => t.foreign)).toEqual([expect.objectContaining({ amount: 0.7, foreign: 'MYR' })]);
  });

  it('reconciles against its previous and new balance', () => {
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(file.statement).toMatchObject({ previousBalance: 100, newBalance: 223.87 });
    expect(draft.reconciliation!.expected).toBe(draft.reconciliation!.actual);
  });

  it('reads the points summary with the statement date, and ties it to the card', () => {
    expect(file.statement.rewards).toEqual({ date: '2026-06-16', broughtForward: 101325, earned: 1107, used: 33, adjustments: 0, balance: 102399 });
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    expect(draft.rewards).toMatchObject({ accountId: 'sc-journey', earned: 1107 });
  });

  it('keeps the foreign currency on the saved expense', () => {
    const draft = buildDraft(file, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] });
    const saved = commitDraft(draft.rows, { currency: 'SGD', importId: 'i', now: 1, rules: [], newId: () => 'x' }).expenses;
    expect(saved.filter((e) => e.foreignCurrency)).toHaveLength(1);
  });
});

describe('statement date and points (HSBC layout)', () => {
  const hsbcPoints: PdfText[][] = [
    [
      ...line(820, [40, 'Statement period'], [200, 'Total Due']),
      ...line(810, [40, 'From 29 SEP 2026 to 28 OCT 2026'], [260, '0.00']),
      ...line(700, [40, '30 Sep'], [90, '28 Sep'], [140, 'SHOP'], [420, '5.00']),
      ...line(690, [300, 'Points Carried Forward'], [460, '12,261']),
      ...line(680, [300, 'Points Earned'], [460, '538']),
      ...line(670, [300, 'Bonus Points'], [460, '0']),
      ...line(660, [300, 'Points Redeemed'], [460, '0']),
      ...line(650, [300, 'Points Expired'], [460, '0']),
      ...line(640, [300, 'Points Adjusted'], [460, '18.468']),
      ...line(630, [300, 'Total Points Available'], [460, '31,267']),
    ],
  ];

  it('dates the points by the end of the statement period', () => {
    const file = parseStatement(hsbcPoints, DEFAULT_ACCOUNTS, new Date(2026, 9, 29));
    expect(file.statement.rewards).toEqual({ date: '2026-10-28', broughtForward: 12261, earned: 538, used: 0, adjustments: 18468, balance: 31267 });
  });
});
