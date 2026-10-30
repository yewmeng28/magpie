import { isAccountStatement, parseAccountStatement } from './accountStatement';
import type { ImportFile } from './importFile';
import { parseStatement, toLines, unreadLines, type PdfText } from './statement';
import type { Account } from './types';

/** Reads a statement PDF's text: a bank account statement or a credit card statement, whichever it is. */
export function readStatement(pages: PdfText[][], accounts: Account[], today = new Date()): ImportFile {
  if (pages.some((items) => items.some((i) => i.str.trim())) && isAccountStatement(pages.flatMap(toLines))) {
    return parseAccountStatement(pages, today);
  }
  return parseStatement(pages, accounts, today);
}

/** Lines that look like transactions but weren't read, to find a lost row. Only card statements: an account statement is all rows. */
export function unreadStatementLines(pages: PdfText[][]): string[] {
  return isAccountStatement(pages.flatMap(toLines)) ? [] : unreadLines(pages);
}
