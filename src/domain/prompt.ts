import type { Account, Category } from './types';

/**
 * The prompt the user pastes into a Claude chat alongside a statement. It carries the import format and the user's
 * own category and account names, so the reply can be pasted straight back into the Import screen.
 */
export function buildImportPrompt(categories: Category[], accounts: Account[], currency: string): string {
  const accountNames = accounts.map((a) => a.name);
  return `Convert the attached credit card or bank statement into MagPie's import format.

Reply with ONE JSON code block and nothing else, shaped like this:

\`\`\`json
{
  "magpie": 1,
  "statement": {
    "account": "<one of the account names below, or the card name printed on the statement>",
    "currency": "${currency}",
    "purchasesTotal": 374.76
  },
  "transactions": [
    {
      "date": "2026-09-14",
      "description": "LUCKIN COFFEE (SGP) PT SINGAPORE SG",
      "merchant": "Luckin Coffee",
      "amount": 3.30,
      "kind": "expense",
      "category": "Food & Drinks"
    }
  ]
}
\`\`\`

Rules:
- Include every transaction line, in statement order. Do not skip, merge or invent lines.
- "date": the TRANSACTION date (not the posting date) as YYYY-MM-DD. If the statement omits the year, take it from the statement date; a December transaction on a January statement belongs to the previous year.
- "description": the transaction text exactly as printed, joining wrapped lines with a space.
- "merchant": a short, readable merchant name (drop branch codes, reference numbers, "PTE LTD", "SINGAPORE SG").
- "amount": a positive number with up to 2 decimals, without currency symbols or "CR".
- "kind":
  - "expense" for purchases, fees and charges.
  - "refund" for a credit (marked CR) from a merchant, such as a returned purchase.
  - "payment" for paying off the card or moving money between my own accounts: e.g. "PAYMENT - THANK YOU", "BILL PAYMENT", "DBS VISA DIRECT" credits, GIRO payments.
- Skip balance lines: "PREVIOUS BALANCE", "SUB-TOTAL", "TOTAL", "TOTAL DUE", rewards/points summaries.
- "category": one of: ${categories.map((c) => c.name).join(', ')}. Use "Other" if unsure.
- "purchasesTotal": the statement's own printed total of new purchases/debits for this card (e.g. "Purchases & Debits", or the total of "NEW TRANSACTIONS"), excluding payments and the previous balance. Leave it out if the statement doesn't print one.
- If the statement covers several cards, add "account" to each transaction with the card it belongs to.
- My accounts: ${accountNames.length ? accountNames.join(', ') : '(none yet)'}.
- Never include card numbers, account numbers, my name or my address anywhere in the JSON.
- If the statement is long, you may split the transactions over several replies, each a complete JSON block in this format.`;
}
