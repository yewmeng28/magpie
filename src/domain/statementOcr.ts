
import { polyfillStreamIteration } from '../app/pdfText';
import type { PdfText } from './statement';

export interface OcrProgress {
  page: number;
  totalPages: number;
  progress: number;
}

/**
 * OCR often drops the decimal point from an amount ("25.70" read as "2570") or turns it into a comma. On a line that
 * starts with a date and has no valid amount, restore it in the last word. Other lines are left alone.
 */
export function repairAmount<W extends { text: string }>(words: W[]): W[] {
  const text = words.map((w) => w.text).join(' ');
  if (!/^\d{1,2}\s?[A-Za-z]{3}\b/.test(text) || /\d\.\d{2}(\s?CR)?$/i.test(text)) return words;
  const last = words[words.length - 1];
  const fixed = last.text.replace(/^(\d{1,3}(?:,\d{3})*|\d+)[,.\s]?(\d{2})$/, (_, whole: string, cents: string) => `${whole}.${cents}`);
  return fixed === last.text ? words : [...words.slice(0, -1), { ...last, text: fixed }];
}

/**
 * Recognise an image-based PDF entirely in the browser.
 *
 * Coordinates are converted from OCR's top-left origin to the
 * bottom-left origin expected by PdfText / toLines().
 */
export async function ocrPdf(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
  password?: string,
): Promise<PdfText[][]> {
  // Loaded on first use, like the text reader in app/pdfText.ts, so neither library is part of the app's own bundle.
  const [pdfjsLib, pdfWorker, tesseractModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('tesseract.js'),
  ]);
  const { createWorker } = tesseractModule;
  polyfillStreamIteration();
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  const buffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    password,
  }).promise;

  const pages: PdfText[][] = [];
  let currentPage = 0;

  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress?.({
          page: currentPage,
          totalPages: pdf.numPages,
          progress: message.progress,
        });
      }
    },
  });

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      currentPage = pageNumber;

      const page = await pdf.getPage(pageNumber);

      // Render at a higher resolution for better OCR accuracy.
      const scale = 2.5;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Unable to create a canvas for PDF OCR.');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      // tesseract.js 6+ returns only plain text unless asked; word boxes live in `blocks`, not a flat `words` list.
      const result = await worker.recognize(canvas, {}, { blocks: true });

      // Every word on one OCR line shares the line's baseline. A word's own box bottom shifts with descenders ("g",
      // "y", "p"), which can split one transaction row into two lines and lose its amount.
      const items: PdfText[] = (result.data.blocks ?? [])
        .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
        .flatMap((line) =>
          repairAmount(line.words.filter((word) => word.text.trim()))
            .map((word) => ({
              str: word.text,
              x: word.bbox.x0 / scale,
              y: (canvas.height - line.bbox.y1) / scale,
              width: (word.bbox.x1 - word.bbox.x0) / scale,
              height: (line.bbox.y1 - line.bbox.y0) / scale,
            })),
        );

      pages.push(items);

      // Release large image buffers before processing the next page.
      canvas.width = 0;
      canvas.height = 0;

      page.cleanup();

      onProgress?.({
        page: pageNumber,
        totalPages: pdf.numPages,
        progress: 1,
      });
    }
  } finally {
    await worker.terminate();
    await pdf.destroy();
  }

  return pages;
}
