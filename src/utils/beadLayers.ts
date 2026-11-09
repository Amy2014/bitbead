import { MappedPixel } from './pixelation';
import { TRANSPARENT_KEY, transparentColorData, recalculateColorStats } from './pixelEditingUtils';

export type BeadLayer = {
  id: string;
  name: string;
  offsetX: number;
  offsetY: number;
  pixels: MappedPixel[][];
};

export function clonePixels(pixels: MappedPixel[][]): MappedPixel[][] {
  return pixels.map((row) => row.map((cell) => ({ ...cell })));
}

export function cloneBeadLayers(layers: BeadLayer[]): BeadLayer[] {
  return layers.map((layer) => ({
    ...layer,
    pixels: clonePixels(layer.pixels),
  }));
}

export function isFilledBeadCell(cell: MappedPixel | undefined): boolean {
  return !!(cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY);
}

export function emptyRow(width: number): MappedPixel[] {
  return Array.from({ length: Math.max(0, width) }, () => ({ ...transparentColorData }));
}

export function compositeBeadLayers(layers: BeadLayer[]): {
  mapped: MappedPixel[][];
  N: number;
  M: number;
  minX: number;
  minY: number;
} {
  if (layers.length === 0) {
    return { mapped: [], N: 0, M: 0, minX: 0, minY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of layers) {
    const h = layer.pixels.length;
    const w = layer.pixels[0]?.length ?? 0;
    minX = Math.min(minX, layer.offsetX);
    minY = Math.min(minY, layer.offsetY);
    maxX = Math.max(maxX, layer.offsetX + w);
    maxY = Math.max(maxY, layer.offsetY + h);
  }
  const N = Math.max(0, maxX - minX);
  const M = Math.max(0, maxY - minY);
  const mapped: MappedPixel[][] = Array.from({ length: M }, () => emptyRow(N));
  for (const layer of layers) {
    for (let ly = 0; ly < layer.pixels.length; ly++) {
      const row = layer.pixels[ly];
      for (let lx = 0; lx < row.length; lx++) {
        const cell = row[lx];
        if (!isFilledBeadCell(cell)) continue;
        const x = layer.offsetX + lx - minX;
        const y = layer.offsetY + ly - minY;
        if (y >= 0 && y < M && x >= 0 && x < N) {
          mapped[y][x] = { ...cell };
        }
      }
    }
  }
  return { mapped, N, M, minX, minY };
}

export function layerSize(layer: BeadLayer): { w: number; h: number } {
  return { h: layer.pixels.length, w: layer.pixels[0]?.length ?? 0 };
}

export function canvasToLayerLocal(
  layer: BeadLayer,
  canvasCol: number,
  canvasRow: number,
  minX: number,
  minY: number
): { lx: number; ly: number } {
  return {
    lx: minX + canvasCol - layer.offsetX,
    ly: minY + canvasRow - layer.offsetY,
  };
}

export function setLayerCell(layer: BeadLayer, localX: number, localY: number, cell: MappedPixel): BeadLayer {
  let pixels = clonePixels(layer.pixels);
  let offsetX = layer.offsetX;
  let offsetY = layer.offsetY;
  let h = pixels.length;
  let w = pixels[0]?.length ?? 0;
  if (w === 0 || h === 0) {
    pixels = [[ { ...cell } ]];
    return { ...layer, pixels, offsetX, offsetY };
  }

  if (localX < 0) {
    const add = -localX;
    pixels = pixels.map((row) => [...emptyRow(add), ...row]);
    offsetX -= add;
    localX = 0;
    w += add;
  }
  if (localY < 0) {
    const add = -localY;
    pixels = [...Array.from({ length: add }, () => emptyRow(w)), ...pixels];
    offsetY -= add;
    localY = 0;
    h += add;
  }
  if (localX >= w) {
    const add = localX - w + 1;
    pixels = pixels.map((row) => [...row, ...emptyRow(add)]);
    w += add;
  }
  if (localY >= h) {
    const add = localY - h + 1;
    pixels = [...pixels, ...Array.from({ length: add }, () => emptyRow(w))];
  }
  pixels[localY][localX] = { ...cell };
  return { ...layer, pixels, offsetX, offsetY };
}

export function paintLayerAtCanvas(
  layers: BeadLayer[],
  layerId: string,
  canvasCol: number,
  canvasRow: number,
  cell: MappedPixel
): BeadLayer[] | null {
  const { minX, minY } = compositeBeadLayers(layers);
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  const { lx, ly } = canvasToLayerLocal(layers[index], canvasCol, canvasRow, minX, minY);
  const next = [...layers];
  next[index] = setLayerCell(layers[index], lx, ly, cell);
  return next;
}

export function floodFillLayerAtCanvas(
  layers: BeadLayer[],
  layerId: string,
  canvasCol: number,
  canvasRow: number,
  targetKey: string
): BeadLayer[] | null {
  const { minX, minY } = compositeBeadLayers(layers);
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  const layer = layers[index];
  const { lx, ly } = canvasToLayerLocal(layer, canvasCol, canvasRow, minX, minY);
  const h = layer.pixels.length;
  const w = layer.pixels[0]?.length ?? 0;
  if (ly < 0 || lx < 0 || ly >= h || lx >= w) return layers;
  const start = layer.pixels[ly][lx];
  if (!start || start.key !== targetKey || start.isExternal) return layers;

  const pixels = clonePixels(layer.pixels);
  const visited = Array.from({ length: h }, () => Array(w).fill(false));
  const stack = [{ x: lx, y: ly }];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h || visited[y][x]) continue;
    const current = pixels[y][x];
    if (!current || current.isExternal || current.key !== targetKey) continue;
    visited[y][x] = true;
    pixels[y][x] = { ...transparentColorData };
    stack.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
  }
  const next = [...layers];
  next[index] = { ...layer, pixels };
  return next;
}

export function remapColorInLayers(
  layers: BeadLayer[],
  hexKey: string,
  replacement: { key: string; hex: string }
): BeadLayer[] {
  const src = hexKey.toUpperCase();
  return layers.map((layer) => ({
    ...layer,
    pixels: layer.pixels.map((row) =>
      row.map((cell) => {
        if (!isFilledBeadCell(cell) || cell.color.toUpperCase() !== src) return { ...cell };
        return { ...cell, key: replacement.key, color: replacement.hex, isExternal: false };
      })
    ),
  }));
}

export function replaceLayerColor(
  layers: BeadLayer[],
  layerId: string,
  sourceHex: string,
  target: MappedPixel
): BeadLayer[] | null {
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  const layer = layers[index];
  const src = sourceHex.toUpperCase();
  const pixels = clonePixels(layer.pixels);
  let changed = false;
  for (let y = 0; y < pixels.length; y++) {
    for (let x = 0; x < pixels[y].length; x++) {
      const cell = pixels[y][x];
      if (!isFilledBeadCell(cell)) continue;
      if (cell.color.toUpperCase() !== src) continue;
      pixels[y][x] = { ...target };
      changed = true;
    }
  }
  if (!changed) return layers;
  const next = [...layers];
  next[index] = { ...layer, pixels };
  return next;
}

export function mirrorLayer(layers: BeadLayer[], layerId: string, axis: 'horizontal' | 'vertical'): BeadLayer[] | null {
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  const layer = layers[index];
  const pixels =
    axis === 'horizontal'
      ? layer.pixels.map((row) => [...row].reverse().map((cell) => ({ ...cell })))
      : [...layer.pixels].reverse().map((row) => row.map((cell) => ({ ...cell })));
  const next = [...layers];
  next[index] = { ...layer, pixels };
  return next;
}

export function replaceLayerRect(
  layers: BeadLayer[],
  layerId: string,
  rect: { c0: number; r0: number; c1: number; r1: number },
  sourceHex: string,
  target: MappedPixel
): BeadLayer[] | null {
  const { minX, minY } = compositeBeadLayers(layers);
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  let layer = layers[index];
  const src = sourceHex.toUpperCase();
  let changed = false;
  for (let row = rect.r0; row <= rect.r1; row++) {
    for (let col = rect.c0; col <= rect.c1; col++) {
      const { lx, ly } = canvasToLayerLocal(layer, col, row, minX, minY);
      const cell = layer.pixels[ly]?.[lx];
      if (!isFilledBeadCell(cell) || cell.color.toUpperCase() !== src) continue;
      layer = setLayerCell(layer, lx, ly, target);
      changed = true;
    }
  }
  if (!changed) return layers;
  const next = [...layers];
  next[index] = layer;
  return next;
}

export function applyLayerRect(
  layers: BeadLayer[],
  layerId: string,
  rect: { c0: number; r0: number; c1: number; r1: number },
  cell: MappedPixel
): BeadLayer[] | null {
  const { minX, minY } = compositeBeadLayers(layers);
  let next = layers;
  for (let row = rect.r0; row <= rect.r1; row++) {
    for (let col = rect.c0; col <= rect.c1; col++) {
      const painted = paintLayerAtCanvas(next, layerId, col, row, cell);
      if (painted) next = painted;
    }
  }
  return next;
}

export function layerOffsetRange(layers: BeadLayer[], layerId: string): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const layer = layers.find((item) => item.id === layerId);
  if (!layer) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const { w, h } = layerSize(layer);
  const others = layers.filter((item) => item.id !== layerId);
  if (others.length === 0) {
    return { minX: layer.offsetX, maxX: layer.offsetX, minY: layer.offsetY, maxY: layer.offsetY };
  }
  let otherMinX = Infinity;
  let otherMinY = Infinity;
  let otherMaxX = -Infinity;
  let otherMaxY = -Infinity;
  for (const item of others) {
    const size = layerSize(item);
    otherMinX = Math.min(otherMinX, item.offsetX);
    otherMinY = Math.min(otherMinY, item.offsetY);
    otherMaxX = Math.max(otherMaxX, item.offsetX + size.w);
    otherMaxY = Math.max(otherMaxY, item.offsetY + size.h);
  }
  return {
    minX: otherMinX - w,
    maxX: otherMaxX,
    minY: otherMinY - h,
    maxY: otherMaxY,
  };
}

export function rotatePixels(pixels: MappedPixel[][], dir: 'cw' | 'ccw'): MappedPixel[][] {
  const M = pixels.length;
  const N = pixels[0]?.length ?? 0;
  if (M === 0 || N === 0) return [];
  if (dir === 'cw') {
    return Array.from({ length: N }, (_, c) =>
      Array.from({ length: M }, (_, r) => ({ ...pixels[M - 1 - r][c] }))
    );
  }
  return Array.from({ length: N }, (_, c) =>
    Array.from({ length: M }, (_, r) => ({ ...pixels[r][N - 1 - c] }))
  );
}

function roundCell(n: number): number {
  return Math.round(n);
}

function rotatePointCw(
  x: number,
  y: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number
): { x: number; y: number } {
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos + dy * sin,
    y: cy - dx * sin + dy * cos,
  };
}

export function rotatePixelsByDegrees(pixels: MappedPixel[][], degrees: number): MappedPixel[][] {
  const turned = ((degrees % 360) + 360) % 360;
  if (turned === 0) return clonePixels(pixels);
  if (turned === 90) return rotatePixels(pixels, 'cw');
  if (turned === 270) return rotatePixels(pixels, 'ccw');
  if (turned === 180) return rotatePixels(rotatePixels(pixels, 'cw'), 'cw');

  const M = pixels.length;
  const N = pixels[0]?.length ?? 0;
  if (M === 0 || N === 0) return [];
  const rad = (turned * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (N - 1) / 2;
  const cy = (M - 1) / 2;
  const corners = [
    rotatePointCw(0, 0, cx, cy, cos, sin),
    rotatePointCw(N - 1, 0, cx, cy, cos, sin),
    rotatePointCw(0, M - 1, cx, cy, cos, sin),
    rotatePointCw(N - 1, M - 1, cx, cy, cos, sin),
  ];
  const minX = Math.floor(Math.min(...corners.map((p) => p.x)));
  const maxX = Math.ceil(Math.max(...corners.map((p) => p.x)));
  const minY = Math.floor(Math.min(...corners.map((p) => p.y)));
  const maxY = Math.ceil(Math.max(...corners.map((p) => p.y)));
  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const next: MappedPixel[][] = Array.from({ length: outH }, () => emptyRow(outW));
  const invCos = Math.cos(-rad);
  const invSin = Math.sin(-rad);
  const ncx = cx - minX;
  const ncy = cy - minY;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = rotatePointCw(x, y, ncx, ncy, invCos, invSin);
      const sx = roundCell(src.x + minX);
      const sy = roundCell(src.y + minY);
      if (sy >= 0 && sy < M && sx >= 0 && sx < N) {
        next[y][x] = { ...pixels[sy][sx] };
      }
    }
  }
  return next;
}

export function rotateBeadLayersByDegrees(layers: BeadLayer[], degrees: number): BeadLayer[] {
  const turned = ((degrees % 360) + 360) % 360;
  if (turned === 0) return cloneBeadLayers(layers);
  if (turned === 90) return rotateBeadLayers(layers, 'cw');
  if (turned === 270) return rotateBeadLayers(layers, 'ccw');
  if (turned === 180) return rotateBeadLayers(rotateBeadLayers(layers, 'cw'), 'cw');

  const { N, M, minX, minY } = compositeBeadLayers(layers);
  if (N === 0 || M === 0) return layers;
  const rad = (turned * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const invCos = Math.cos(-rad);
  const invSin = Math.sin(-rad);
  const cx = minX + (N - 1) / 2;
  const cy = minY + (M - 1) / 2;

  return layers.map((layer) => {
    const h = layer.pixels.length;
    const w = layer.pixels[0]?.length ?? 0;
    if (h === 0 || w === 0) return layer;
    const corners = [
      rotatePointCw(layer.offsetX, layer.offsetY, cx, cy, cos, sin),
      rotatePointCw(layer.offsetX + w - 1, layer.offsetY, cx, cy, cos, sin),
      rotatePointCw(layer.offsetX, layer.offsetY + h - 1, cx, cy, cos, sin),
      rotatePointCw(layer.offsetX + w - 1, layer.offsetY + h - 1, cx, cy, cos, sin),
    ];
    const x0 = Math.floor(Math.min(...corners.map((p) => p.x)));
    const x1 = Math.ceil(Math.max(...corners.map((p) => p.x)));
    const y0 = Math.floor(Math.min(...corners.map((p) => p.y)));
    const y1 = Math.ceil(Math.max(...corners.map((p) => p.y)));
    const nextPixels: MappedPixel[][] = Array.from({ length: y1 - y0 + 1 }, () => emptyRow(x1 - x0 + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const src = rotatePointCw(x, y, cx, cy, invCos, invSin);
        const sx = roundCell(src.x) - layer.offsetX;
        const sy = roundCell(src.y) - layer.offsetY;
        if (sy >= 0 && sy < h && sx >= 0 && sx < w) {
          nextPixels[y - y0][x - x0] = { ...layer.pixels[sy][sx] };
        }
      }
    }
    return { ...layer, pixels: nextPixels, offsetX: x0, offsetY: y0 };
  });
}

export function rotateBeadLayers(layers: BeadLayer[], dir: 'cw' | 'ccw'): BeadLayer[] {
  const { N, M, minX, minY } = compositeBeadLayers(layers);
  if (N === 0 || M === 0) return layers;
  return layers.map((layer) => {
    const h = layer.pixels.length;
    const w = layer.pixels[0]?.length ?? 0;
    const placed: Array<{ x: number; y: number; cell: MappedPixel }> = [];
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const relX = layer.offsetX + lx - minX;
        const relY = layer.offsetY + ly - minY;
        const nx = dir === 'cw' ? M - 1 - relY : relY;
        const ny = dir === 'cw' ? relX : N - 1 - relX;
        placed.push({ x: nx, y: ny, cell: { ...layer.pixels[ly][lx] } });
      }
    }
    if (placed.length === 0) return { ...layer, pixels: [], offsetX: 0, offsetY: 0 };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const point of placed) {
      x0 = Math.min(x0, point.x);
      y0 = Math.min(y0, point.y);
      x1 = Math.max(x1, point.x);
      y1 = Math.max(y1, point.y);
    }
    const nextPixels: MappedPixel[][] = Array.from({ length: y1 - y0 + 1 }, () => emptyRow(x1 - x0 + 1));
    for (const point of placed) {
      nextPixels[point.y - y0][point.x - x0] = point.cell;
    }
    return { ...layer, pixels: nextPixels, offsetX: x0, offsetY: y0 };
  });
}

export function moveLayer(layers: BeadLayer[], layerId: string, direction: 'up' | 'down'): BeadLayer[] {
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return layers;
  const swapWith = direction === 'up' ? index + 1 : index - 1;
  if (swapWith < 0 || swapWith >= layers.length) return layers;
  const next = [...layers];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}

export { recalculateColorStats };
