// Runs real statements in samples/ (gitignored) through the importers. Skipped when samples/ is empty, e.g. on a
// fresh clone. Each *.magpie.json import must reconcile and map every row to an account; each *.pdf must either
// parse and reconcile locally, or be reported as having no text (a scan, or flattened by redaction).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { pageTexts } from '../app/pdfText';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults';
import { buildDraft, extractJson, parseImportFile, type ImportFile } from './importFile';
import { parseStatement, StatementError } from './statement';

const imports = Object.entries(
  import.meta.glob<string>('../../samples/*.magpie.json', { query: '?raw', import: 'default', eager: true }),
);
const pdfs = Object.entries(
  import.meta.glob<string>('../../samples/*.pdf', { query: '?inline', import: 'default', eager: true }),
);

const ctx = { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], existing: [] };

function expectReconciled(file: ImportFile) {
  const draft = buildDraft(file, ctx);
  if (draft.reconciliation) expect(draft.reconciliation.actual).toBe(draft.reconciliation.expected);
  expect(draft.rows.filter((r) => !r.accountId).map((r) => r.description)).toEqual([]);
  return draft;
}

describe.skipIf(!imports.length)('sample imports', () => {
  it.each(imports)('%s', (_, text) => {
    expectReconciled(parseImportFile(extractJson(text)));
  });
});

describe.skipIf(!pdfs.length)('sample PDFs', () => {
  it.each(pdfs)('%s', async (_, dataUrl) => {
    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    const doc = await getDocument({ data: bytes }).promise;
    const pages = await pageTexts(doc);
    await doc.destroy();
    try {
      const draft = expectReconciled(parseStatement(pages, DEFAULT_ACCOUNTS));
      expect(draft.reconciliation).toBeDefined();
    } catch (e) {
      if (!(e instanceof StatementError)) throw e;
      expect(e.problem).toBe('no-text');
    }
  });
});
