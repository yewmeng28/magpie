
import type { Account } from './types';
import type { ImportFile } from './importFile';
import {
  parseStatement,
  StatementError,
  type PdfText,
} from './statement';
import { ocrPdf, type OcrProgress } from './statementOcr';

interface ParseOptions {
  today?: Date;
  onOcrProgress?: (progress: OcrProgress) => void;
}

/**
 * Try normal PDF text extraction first. If that fails to produce
 * transactions, run OCR and feed the result to the same parser.
 *
 * `textPages` must be the pages already extracted from the PDF
 * by your existing PDF.js text-extraction code.
 */
export async function parseStatementWithOcr(
  file: File,
  textPages: PdfText[][],
  accounts: Account[],
  options: ParseOptions = {},
): Promise<ImportFile> {
  try {
    return parseStatement(textPages, accounts, options.today);
  } catch (error) {
    if (
      !(error instanceof StatementError) ||
      !['no-text', 'no-transactions'].includes(error.problem)
    ) {
      throw error;
    }

    const ocrPages = await ocrPdf(file, options.onOcrProgress);

    // Do not hide the parser's original validation behaviour.
    return parseStatement(ocrPages, accounts, options.today);
  }
}
