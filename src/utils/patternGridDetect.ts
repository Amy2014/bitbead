import type { GridAlignParams } from './pixelation';

function grayscaleAt(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function smooth(values: number[], radius: number): number[] {
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= values.length) continue;
      sum += values[j];
      n++;
    }
    out[i] = n ? sum / n : 0;
  }
  return out;
}

function bestPeriod(energy: number[], minP: number, maxP: number): number {
  let bestLag = minP;
  let bestScore = -Infinity;
  for (let lag = minP; lag <= maxP; lag++) {
    let score = 0;
    let count = 0;
    for (let i = 0; i + lag < energy.length; i++) {
      score += energy[i] * energy[i + lag];
      count++;
    }
    if (count === 0) continue;
    const norm = score / count;
    if (norm > bestScore) {
      bestScore = norm;
      bestLag = lag;
    }
  }
  return bestLag;
}

function bestOffset(energy: number[], period: number): number {
  let bestOff = 0;
  let bestSum = -Infinity;
  const limit = Math.max(1, Math.min(period, energy.length));
  for (let off = 0; off < limit; off++) {
    let sum = 0;
    let n = 0;
    for (let x = off; x < energy.length; x += period) {
      sum += energy[x];
      n++;
    }
    const avg = n ? sum / n : 0;
    if (avg > bestSum) {
      bestSum = avg;
      bestOff = off;
    }
  }
  return bestOff;
}

function columnEdgeEnergy(data: Uint8ClampedArray, w: number, h: number): number[] {
  const energy = new Array(w).fill(0);
  for (let x = 1; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const j = (y * w + x - 1) * 4;
      sum += Math.abs(grayscaleAt(data, i) - grayscaleAt(data, j));
    }
    energy[x] = sum / h;
  }
  energy[0] = energy[1] || 0;
  return energy;
}

function rowEdgeEnergy(data: Uint8ClampedArray, w: number, h: number): number[] {
  const energy = new Array(h).fill(0);
  for (let y = 1; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const j = ((y - 1) * w + x) * 4;
      sum += Math.abs(grayscaleAt(data, i) - grayscaleAt(data, j));
    }
    energy[y] = sum / w;
  }
  energy[0] = energy[1] || 0;
  return energy;
}

/**
 * 根据横竖边缘能量的周期，估计等大轴对齐网格。
 * 只给图纸识别当初始值，结果必须手调。
 */
export function detectGridFromImageData(imageData: ImageData): GridAlignParams | null {
  const { data, width: w, height: h } = imageData;
  if (w < 16 || h < 16) return null;

  const colE = smooth(columnEdgeEnergy(data, w, h), 1);
  const rowE = smooth(rowEdgeEnergy(data, w, h), 1);
  const minP = Math.max(6, Math.floor(Math.min(w, h) / 120));
  const maxP = Math.max(minP + 1, Math.floor(Math.min(w, h) / 8));
  const periodX = bestPeriod(colE, minP, maxP);
  const periodY = bestPeriod(rowE, minP, maxP);
  const cellSize = Math.max(4, Math.round((periodX + periodY) / 2));
  const offsetX = bestOffset(colE, cellSize);
  const offsetY = bestOffset(rowE, cellSize);

  if (!Number.isFinite(cellSize) || cellSize < 4) return null;
  return {
    cellSize,
    offsetX,
    offsetY,
    marginRight: 0,
    marginBottom: 0,
  };
}

export function loadImageData(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 Canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}
