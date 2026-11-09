import Tesseract from 'tesseract.js';
import { getHexByMard221Key, normalizeMard221Code } from './colorSystemUtils';
import { computeAlignedGridSize, type GridAlignParams } from './pixelation';
import { transparentColorData, TRANSPARENT_KEY } from './pixelEditingUtils';
import type { MappedPixel } from './pixelation';

export type PatternCellThumb = {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PatternOcrResult = {
  mappedData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  thumbs: PatternCellThumb[];
};

function parseMard221FromOcr(raw: string): string | undefined {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  s = s.replace(/[IL|]/g, '1').replace(/O/g, '0');
  if (!s) return undefined;
  const variants = [s, s.replace(/S/g, '5').replace(/Z/g, '2')];
  for (const variant of variants) {
    const matches = variant.matchAll(/([A-HM])(\d{1,2})/g);
    for (const match of matches) {
      const code = normalizeMard221Code(`${match[1]}${match[2]}`);
      if (code) return code;
    }
  }
  return undefined;
}

function codeFromPage(page: Tesseract.Page): string | undefined {
  const snippets = [page.text || ''];
  for (const word of page.words || []) {
    snippets.push(word.text || '');
    for (const choice of word.choices || []) snippets.push(choice.text || '');
  }
  for (const snippet of snippets) {
    const code = parseMard221FromOcr(snippet);
    if (code) return code;
  }
  return parseMard221FromOcr(snippets.join(''));
}

function contrastStretch(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = Math.round(((y - min) / span) * 255);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
}

function maybeInvert(data: Uint8ClampedArray): void {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i];
    n++;
  }
  if (n && sum / n < 118) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }
}

function inkSpread(data: Uint8ClampedArray): number {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i];
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return max - min;
}

function invertCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255 - img.data[i];
    img.data[i + 1] = 255 - img.data[i + 1];
    img.data[i + 2] = 255 - img.data[i + 2];
  }
  ctx.putImageData(img, 0, 0);
}

function cropCell(
  srcCanvas: HTMLCanvasElement,
  params: GridAlignParams,
  col: number,
  row: number
): HTMLCanvasElement | null {
  const cell = Math.max(1, params.cellSize);
  const inset = Math.max(1, Math.floor(cell * 0.1));
  let x0 = Math.round(params.offsetX + col * cell + inset);
  let y0 = Math.round(params.offsetY + row * cell + inset);
  let size = Math.max(2, Math.round(cell - inset * 2));
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x0 + size > srcCanvas.width) size = srcCanvas.width - x0;
  if (y0 + size > srcCanvas.height) size = Math.min(size, srcCanvas.height - y0);
  if (size < 2) return null;

  const scale = Math.max(3, Math.ceil(48 / size));
  const ocr = document.createElement('canvas');
  ocr.width = size * scale;
  ocr.height = size * scale;
  const ocrCtx = ocr.getContext('2d');
  if (!ocrCtx) return null;
  ocrCtx.imageSmoothingEnabled = false;
  ocrCtx.drawImage(srcCanvas, x0, y0, size, size, 0, 0, ocr.width, ocr.height);
  const img = ocrCtx.getImageData(0, 0, ocr.width, ocr.height);
  contrastStretch(img.data);
  maybeInvert(img.data);
  ocrCtx.putImageData(img, 0, 0);
  return ocr;
}

function cellThumbRect(
  params: GridAlignParams,
  col: number,
  row: number,
  imgW: number,
  imgH: number
): PatternCellThumb | null {
  const cell = Math.max(1, params.cellSize);
  const inset = Math.max(1, Math.floor(cell * 0.06));
  const x0 = Math.round(params.offsetX + col * cell + inset);
  const y0 = Math.round(params.offsetY + row * cell + inset);
  const x1 = Math.round(params.offsetX + (col + 1) * cell - inset);
  const y1 = Math.round(params.offsetY + (row + 1) * cell - inset);
  const x = Math.max(0, Math.min(x0, imgW - 2));
  const y = Math.max(0, Math.min(y0, imgH - 2));
  const w = Math.max(2, Math.min(x1, imgW) - x);
  const h = Math.max(2, Math.min(y1, imgH) - y);
  if (w < 2 || h < 2) return null;
  return { row, col, x, y, w, h };
}

export async function recognizePatternGrid(
  imageData: ImageData,
  params: GridAlignParams,
  onProgress?: (done: number, total: number) => void
): Promise<PatternOcrResult> {
  const { N, M } = computeAlignedGridSize(imageData.width, imageData.height, params);
  const mappedData: MappedPixel[][] = Array.from({ length: M }, () =>
    Array.from({ length: N }, () => ({ ...transparentColorData }))
  );
  const thumbs: PatternCellThumb[] = [];
  if (N < 1 || M < 1) {
    return { mappedData, gridDimensions: { N, M }, thumbs };
  }

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = imageData.width;
  srcCanvas.height = imageData.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) {
    return { mappedData, gridDimensions: { N, M }, thumbs };
  }
  srcCtx.putImageData(imageData, 0, 0);

  const jobs: Array<{ canvas: HTMLCanvasElement; row: number; col: number }> = [];
  let skipped = 0;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const thumb = cellThumbRect(params, i, j, srcCanvas.width, srcCanvas.height);
      if (thumb) thumbs.push(thumb);
      const canvas = cropCell(srcCanvas, params, i, j);
      if (!canvas) {
        skipped++;
        continue;
      }
      const spread = inkSpread(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data);
      if (spread < 12) {
        skipped++;
        continue;
      }
      jobs.push({ canvas, row: j, col: i });
    }
  }

  const total = Math.max(1, jobs.length + skipped);
  let done = skipped;
  const bump = () => {
    done++;
    if (done % 4 === 0 || done === total) onProgress?.(Math.min(done, total), total);
  };
  onProgress?.(skipped, total);

  const scheduler = Tesseract.createScheduler();
  const workerCount = Math.min(2, Math.max(1, jobs.length));
  try {
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        const worker = await Tesseract.createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHMabcdefgh0123456789',
          tessedit_pageseg_mode: '8',
        });
        scheduler.addWorker(worker);
      })
    );
    await Promise.all(
      jobs.map(async (job) => {
        const first = await scheduler.addJob('recognize', job.canvas);
        let code = codeFromPage(first.data);
        if (!code) {
          invertCanvas(job.canvas);
          const second = await scheduler.addJob('recognize', job.canvas);
          code = codeFromPage(second.data);
        }
        const hex = code ? getHexByMard221Key(code) : undefined;
        if (hex) {
          mappedData[job.row][job.col] = { key: hex, color: hex, isExternal: false };
        }
        bump();
      })
    );
  } finally {
    await scheduler.terminate();
  }

  onProgress?.(total, total);
  return { mappedData, gridDimensions: { N, M }, thumbs };
}

export function isEmptyPatternCell(cell: MappedPixel | undefined): boolean {
  return !cell || cell.isExternal || cell.key === TRANSPARENT_KEY;
}
