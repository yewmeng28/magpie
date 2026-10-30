
import { polyfillStreamIteration } from '../app/pdfText';
import type { Block } from 'tesseract.js';
import type { PdfText } from './statement';

export interface OcrProgress {
  page: number;
  totalPages: number;
  progress: number;
}

/** OCR reads the capital O of "Oct" as a zero: "0ct", or "010ct" for "01 Oct". */
export function repairMonths<W extends { text: string }>(words: W[]): W[] {
  return words.map((w) => {
    const fixed = w.text.replace(/^(\d{0,2})0ct$/i, (_, day: string) => (day ? `${day} Oct` : 'Oct'));
    return fixed === w.text ? w : { ...w, text: fixed };
  });
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
 * OCR words as positioned text runs, with the y axis flipped to PDF's bottom-left origin. Every word on one OCR line
 * shares the line's baseline: a word's own box bottom shifts with descenders ("g", "y", "p"), which can split one
 * transaction row into two lines and lose its amount.
 */
export function blocksToItems(blocks: Block[] | null, pageHeight: number, scale: number): PdfText[] {
  return (blocks ?? [])
    .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
    .flatMap((line) =>
      repairAmount(repairMonths(line.words.filter((word) => word.text.trim()))).map((word) => ({
        str: word.text,
        x: word.bbox.x0 / scale,
        y: (pageHeight - line.bbox.y1) / scale,
        width: (word.bbox.x1 - word.bbox.x0) / scale,
        height: (line.bbox.y1 - line.bbox.y0) / scale,
      })),
    );
}

/**
 * Small print and thin dividers need about 4x the PDF's 72 dpi to be read reliably (2.5x lost whole rows). Capped so
 * a page stays under iOS Safari's canvas limit of about 16.7 million pixels.
 */
export function renderScale({ width, height }: { width: number; height: number }): number {
  return Math.min(4, Math.sqrt(12_000_000 / (width * height)));
}

/** A phone screenshot is about 1100 px wide: enlarge small images to about 2400 px (the text is read far better), within the canvas limit. */
export function imageScale({ width, height }: { width: number; height: number }): number {
  return Math.min(3, Math.max(1, 2400 / width), Math.sqrt(12_000_000 / (width * height)));
}

/** Recognise a statement that is a screenshot or photo rather than a PDF, entirely in the browser. */
export async function ocrImage(file: File, onProgress?: (progress: OcrProgress) => void): Promise<PdfText[][]> {
  const { createWorker, PSM } = await import('tesseract.js');
  const bitmap = await createImageBitmap(file);
  const scale = imageScale(bitmap);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bitmap.width * scale);
  canvas.height = Math.ceil(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create a canvas for image OCR.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') onProgress?.({ page: 1, totalPages: 1, progress: message.progress });
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
    const result = await worker.recognize(canvas, {}, { blocks: true });
    return [blocksToItems(result.data.blocks, canvas.height, scale)];
  } finally {
    await worker.terminate();
    canvas.width = 0;
    canvas.height = 0;
  }
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

  // Statements are one column of rows; the default layout analysis drops rows that sit against a divider line.
  await worker.setParameters({ tessedit_pageseg_mode: tesseractModule.PSM.SINGLE_COLUMN });

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      currentPage = pageNumber;

      const page = await pdf.getPage(pageNumber);

      // Render at a higher resolution for better OCR accuracy.
      const scale = renderScale(page.getViewport({ scale: 1 }));
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

      const items = blocksToItems(result.data.blocks, canvas.height, scale);

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
