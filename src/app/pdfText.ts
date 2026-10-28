import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PdfText } from '../domain/statement';

/** The positioned text runs on every page of an open PDF. */
export async function pageTexts(doc: PDFDocumentProxy): Promise<PdfText[][]> {
  const pages: PdfText[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    pages.push(
      items
        .filter((item): item is TextItem => 'str' in item)
        .map((item) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || Math.abs(item.transform[3]),
        })),
    );
    page.cleanup();
  }
  return pages;
}

/**
 * Read a PDF's text in the browser. pdf.js and its worker are loaded on first use, not with the app, and the file
 * never leaves the device. `data` is consumed (handed to the worker), so pass a fresh copy on each attempt.
 */
export async function readPdfText(data: ArrayBuffer, password?: string): Promise<PdfText[][]> {
  polyfillStreamIteration();
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data, password }).promise;
  try {
    return await pageTexts(doc);
  } finally {
    void doc.destroy();
  }
}

/** pdf.js reads page text with `for await (… of readableStream)`, which Safari doesn't support on ReadableStream. */
export function polyfillStreamIteration() {
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  if (proto[Symbol.asyncIterator]) return;
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

/** pdf.js signals a password-protected PDF with a PasswordException: code 1 = password needed, 2 = wrong password. */
export function passwordProblem(error: unknown): 'needed' | 'wrong' | null {
  const e = error as { name?: string; code?: number } | null;
  if (e?.name !== 'PasswordException') return null;
  return e.code === 2 ? 'wrong' : 'needed';
}
