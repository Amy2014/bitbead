import { transparentColorData } from './pixelEditingUtils';

// 定义像素化模式
export enum PixelationMode {
  Dominant = 'dominant', // 卡通模式（主色）
  Average = 'average',   // 真实模式（平均色）
  Perceptual = 'perceptual', // 感知色差（CIEDE2000 + 抖动）
}

// 定义色号系统类型
export type ColorSystem = 'MARD' | 'MARD221' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

// --- 必要的类型定义 ---
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface OklabColor {
  l: number;
  a: number;
  b: number;
}

interface LabColor {
  L: number;
  a: number;
  b: number;
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
}

// --- 辅助函数 ---

// 转换 Hex 到 RGB
export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function rgbToOklab(rgb: RgbColor): OklabColor {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
  };
}

const oklabCache = new Map<string, OklabColor>();

function getOklabColor(rgb: RgbColor): OklabColor {
  const cacheKey = `${rgb.r},${rgb.g},${rgb.b}`;
  const cached = oklabCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const oklab = rgbToOklab(rgb);
  oklabCache.set(cacheKey, oklab);
  return oklab;
}

// 使用 Oklab 空间计算颜色距离，并保持与现有 0-100 阈值输入兼容。
export function colorDistance(rgb1: RgbColor, rgb2: RgbColor): number {
  const oklab1 = getOklabColor(rgb1);
  const oklab2 = getOklabColor(rgb2);

  const dl = oklab1.l - oklab2.l;
  const da = oklab1.a - oklab2.a;
  const db = oklab1.b - oklab2.b;

  return Math.sqrt(dl * dl + da * da + db * db) * 100;
}

// 查找最接近的颜色
export function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[]
): PaletteColor {
  if (!palette || palette.length === 0) {
      console.error("findClosestPaletteColor: Palette is empty or invalid!");
      // 提供一个健壮的回退
      return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  let minDistance = Infinity;
  let closestColor = palette[0];

  for (const paletteColor of palette) {
    const distance = colorDistance(targetRgb, paletteColor.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
    if (distance === 0) break; // 完全匹配，提前退出
  }
  return closestColor;
}


// --- 核心像素化计算逻辑 ---

/**
 * 计算图像指定区域的代表色（根据所选模式）
 * @param imageData 包含像素数据的 ImageData 对象
 * @param startX 区域起始 X 坐标
 * @param startY 区域起始 Y 坐标
 * @param width 区域宽度
 * @param height 区域高度
 * @param mode 计算模式 ('dominant' 或 'average')
 * @returns 代表色的 RGB 对象，或 null（如果区域无效或全透明）
 */
function sampleOpaquePixel(data: Uint8ClampedArray, imgWidth: number, x: number, y: number): RgbColor | null {
    const index = (y * imgWidth + x) * 4;
    if (data[index + 3] < 128) return null;
    return { r: data[index], g: data[index + 1], b: data[index + 2] };
}

const CENTER_COLOR_MIN_SHARE = 0.02;
export const INTRA_CELL_SIMILARITY = 10;
export const AA_PREPROCESS_VERSION = 'fringe-v2';

function rgbNearPacked(a: number, b: number, maxDelta = 16): boolean {
    if (a === b) return true;
    const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
    const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
    const db = (a & 255) - (b & 255);
    return Math.abs(dr) <= maxDelta && Math.abs(dg) <= maxDelta && Math.abs(db) <= maxDelta;
}

/**
 * 只处理抗锯齿杂边：3×3 里孤立、且不像描边的像素，吸附到邻域主色。
 * 热路径只用整数 RGB，避免整图像素做 Oklab。
 */
export function collapseAdjacentSimilarPixels(source: ImageData, _similarity = INTRA_CELL_SIMILARITY): ImageData {
    const width = source.width;
    const height = source.height;
    const input = source.data;
    const output = new ImageData(width, height);
    output.data.set(input);
    const out = output.data;

    const packed = new Uint32Array(9);
    const groupKey = new Uint32Array(9);
    const groupCount = new Uint8Array(9);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (input[i + 3] < 128) continue;

            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= width) continue;
                    const ni = (ny * width + nx) * 4;
                    if (input[ni + 3] < 128) continue;
                    packed[n++] = (input[ni] << 16) | (input[ni + 1] << 8) | input[ni + 2];
                }
            }
            if (n < 5) continue;

            let groups = 0;
            for (let p = 0; p < n; p++) {
                const color = packed[p];
                let g = 0;
                while (g < groups && !rgbNearPacked(color, groupKey[g])) g++;
                if (g === groups) {
                    groupKey[groups] = color;
                    groupCount[groups] = 1;
                    groups++;
                } else {
                    groupCount[g]++;
                }
            }

            const self = (input[i] << 16) | (input[i + 1] << 8) | input[i + 2];
            let selfCount = 1;
            let dom = 0;
            for (let g = 0; g < groups; g++) {
                if (rgbNearPacked(self, groupKey[g])) selfCount = groupCount[g];
                if (groupCount[g] > groupCount[dom]) dom = g;
            }

            if (selfCount > 2 || groupCount[dom] < 5 || selfCount >= groupCount[dom]) continue;
            const snap = groupKey[dom];
            out[i] = (snap >> 16) & 255;
            out[i + 1] = (snap >> 8) & 255;
            out[i + 2] = snap & 255;
        }
    }
    return output;
}

function cellColorKey(color: RgbColor): string {
    return `${color.r},${color.g},${color.b}`;
}

function groupSimilarCellColors(
    colors: Map<string, { rgb: RgbColor; count: number }>
): Map<string, string> {
    const keys = [...colors.keys()];
    const parent = new Map(keys.map((key) => [key, key]));
    const find = (key: string): string => {
        let cur = key;
        while (parent.get(cur) !== cur) {
            const next = parent.get(cur);
            if (!next) break;
            parent.set(cur, parent.get(next) || next);
            cur = next;
        }
        return cur;
    };
    const counts = new Map([...colors.entries()].map(([key, value]) => [key, value.count]));

    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const a = keys[i];
            const b = keys[j];
            if (colorDistance(colors.get(a)!.rgb, colors.get(b)!.rgb) >= INTRA_CELL_SIMILARITY) {
                continue;
            }
            const rootA = find(a);
            const rootB = find(b);
            if (rootA === rootB) continue;
            if ((counts.get(rootA) || 0) >= (counts.get(rootB) || 0)) {
                parent.set(rootB, rootA);
                counts.set(rootA, (counts.get(rootA) || 0) + (counts.get(rootB) || 0));
            } else {
                parent.set(rootA, rootB);
                counts.set(rootB, (counts.get(rootB) || 0) + (counts.get(rootA) || 0));
            }
        }
    }

    const remap = new Map<string, string>();
    keys.forEach((key) => remap.set(key, find(key)));
    return remap;
}

function sampleNearestGridPixel(
    imageData: ImageData,
    i: number,
    j: number,
    N: number,
    M: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    centerMinShare: number,
    skipGrouping: boolean,
    useCenterColor: boolean
): RgbColor | null {
    const data = imageData.data;
    const imgWidth = imageData.width;
    const imgHeight = imageData.height;
    const cx = Math.min(imgWidth - 1, Math.max(0, Math.floor((i + 0.5) * imgWidth / N)));
    const cy = Math.min(imgHeight - 1, Math.max(0, Math.floor((j + 0.5) * imgHeight / M)));
    const center = sampleOpaquePixel(data, imgWidth, cx, cy);

    const colors = new Map<string, { rgb: RgbColor; count: number }>();
    let opaqueCount = 0;
    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const color = sampleOpaquePixel(data, imgWidth, x, y);
            if (!color) continue;
            opaqueCount++;
            const key = cellColorKey(color);
            const existing = colors.get(key);
            if (existing) {
                existing.count++;
            } else {
                colors.set(key, { rgb: color, count: 1 });
            }
        }
    }

    if (opaqueCount === 0) {
        return null;
    }

    const grouped = skipGrouping ? null : groupSimilarCellColors(colors);
    const groupCount = new Map<string, number>();
    colors.forEach((value, key) => {
        const root = grouped ? (grouped.get(key) || key) : key;
        groupCount.set(root, (groupCount.get(root) || 0) + value.count);
    });

    const dominantKey = [...groupCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (useCenterColor && center) {
        const centerRoot = grouped
            ? (grouped.get(cellColorKey(center)) || cellColorKey(center))
            : cellColorKey(center);
        const centerCount = groupCount.get(centerRoot) || 0;
        if (centerCount >= 2 && centerCount / opaqueCount >= centerMinShare) {
            return colors.get(centerRoot)?.rgb || center;
        }
    }
    return colors.get(dominantKey)?.rgb || center;
}

function calculateCellRepresentativeColor(
    imageData: ImageData,
    startX: number,
    startY: number,
    width: number,
    height: number,
    mode: PixelationMode
): RgbColor | null {
    const data = imageData.data;
    const imgWidth = imageData.width;
    let rSum = 0, gSum = 0, bSum = 0;
    let pixelCount = 0;

    const endX = startX + width;
    const endY = startY + height;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = (y * imgWidth + x) * 4;
            if (data[index + 3] < 128) continue;

            pixelCount++;
            rSum += data[index];
            gSum += data[index + 1];
            bSum += data[index + 2];
        }
    }

    if (pixelCount === 0) {
        return null;
    }

    return {
        r: Math.round(rSum / pixelCount),
        g: Math.round(gSum / pixelCount),
        b: Math.round(bSum / pixelCount),
    };
}

/**
 * 根据原始图像数据、网格尺寸、调色板和模式计算像素化网格数据。
 * @param originalCtx 原始图像的 Canvas 2D Context
 * @param imgWidth 原始图像宽度
 * @param imgHeight 原始图像高度
 * @param N 网格横向数量
 * @param M 网格纵向数量
 * @param palette 当前使用的调色板
 * @param mode 像素化模式 (Dominant/Average)
 * @param t1FallbackColor T1 或其他备用颜色数据
 * @returns 计算后的 MappedPixel 网格数据
 */
export function calculatePixelGrid(
    originalCtx: CanvasRenderingContext2D,
    imgWidth: number,
    imgHeight: number,
    N: number,
    M: number,
    palette: PaletteColor[],
    mode: PixelationMode,
    t1FallbackColor: PaletteColor, // 传入备用色
    maxColorCount: number = 20,
    centerMinShare: number = CENTER_COLOR_MIN_SHARE,
    sourceImageData?: ImageData | null,
    useCenterColor: boolean = false
): MappedPixel[][] {
    console.log(`Calculating pixel grid with mode: ${mode}`);
    const mappedData: MappedPixel[][] = Array(M).fill(null).map(() => Array(N).fill({ key: t1FallbackColor.key, color: t1FallbackColor.hex }));
    const cellWidthOriginal = imgWidth / N;
    const cellHeightOriginal = imgHeight / M;

    let fullImageData: ImageData | null = sourceImageData || null;
    if (!fullImageData) {
        try {
            fullImageData = originalCtx.getImageData(0, 0, imgWidth, imgHeight);
        } catch (e) {
            console.error("Failed to get full image data:", e);
            return mappedData;
        }
    }

    const cellRgb: (RgbColor | null)[][] = Array.from({ length: M }, () => Array(N).fill(null));
    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const startXOriginal = Math.floor(i * cellWidthOriginal);
            const startYOriginal = Math.floor(j * cellHeightOriginal);
            const endXOriginal = Math.min(imgWidth, Math.ceil((i + 1) * cellWidthOriginal));
            const endYOriginal = Math.min(imgHeight, Math.ceil((j + 1) * cellHeightOriginal));
            const currentCellWidth = Math.max(1, endXOriginal - startXOriginal);
            const currentCellHeight = Math.max(1, endYOriginal - startYOriginal);

            cellRgb[j][i] = mode === PixelationMode.Average
                ? calculateCellRepresentativeColor(
                    fullImageData,
                    startXOriginal,
                    startYOriginal,
                    currentCellWidth,
                    currentCellHeight,
                    mode
                )
                : sampleNearestGridPixel(
                    fullImageData,
                    i,
                    j,
                    N,
                    M,
                    startXOriginal,
                    startYOriginal,
                    endXOriginal,
                    endYOriginal,
                    centerMinShare,
                    Boolean(sourceImageData),
                    useCenterColor
                );
        }
    }

    if (mode === PixelationMode.Perceptual) {
        return quantizePerceptualGrid(cellRgb, palette, t1FallbackColor, maxColorCount);
    }

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const representativeRgb = cellRgb[j][i];
            if (representativeRgb) {
                const closestBead = findClosestPaletteColor(representativeRgb, palette);
                mappedData[j][i] = { key: closestBead.key, color: closestBead.hex };
            } else {
                mappedData[j][i] = { ...transparentColorData };
            }
        }
    }
    capMappedDataToMaxColors(mappedData, cellRgb, palette, maxColorCount);
    console.log(`Pixel grid calculation complete for mode: ${mode}`);
    return mappedData;
}

function rgbToLab(rgb: RgbColor): LabColor {
    const toLinear = (channel: number) => {
        const c = channel / 255;
        return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
    const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function hueAngle(b: number, ap: number): number {
    if (ap === 0 && b === 0) return 0;
    const h = Math.atan2(b, ap) * 180 / Math.PI;
    return h < 0 ? h + 360 : h;
}

function ciede2000(lab1: LabColor, lab2: LabColor): number {
    const { L: L1, a: a1, b: b1 } = lab1;
    const { L: L2, a: a2, b: b2 } = lab2;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cab = (C1 + C2) / 2;
    const Cab7 = Cab ** 7;
    const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + 25 ** 7)));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const h1p = hueAngle(b1, a1p);
    const h2p = hueAngle(b2, a2p);
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) {
        if (Math.abs(h1p - h2p) > 180) {
            hbp += h1p + h2p < 360 ? 360 : -360;
        }
        hbp /= 2;
    }
    const T =
        1 -
        0.17 * Math.cos((hbp - 30) * Math.PI / 180) +
        0.24 * Math.cos((2 * hbp) * Math.PI / 180) +
        0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) -
        0.2 * Math.cos((4 * hbp - 63) * Math.PI / 180);
    const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
    const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
    const SC = 1 + 0.045 * Cbp;
    const SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;
    const dL = dLp / SL;
    const dC = dCp / SC;
    const dH = dHp / SH;
    return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

function findClosestCiede2000(
    targetRgb: RgbColor,
    palette: PaletteColor[],
    paletteLabs: LabColor[]
): PaletteColor {
    const targetLab = rgbToLab(targetRgb);
    let minDistance = Infinity;
    let closest = palette[0];
    for (let i = 0; i < palette.length; i++) {
        const distance = ciede2000(targetLab, paletteLabs[i]);
        if (distance < minDistance) {
            minDistance = distance;
            closest = palette[i];
        }
        if (distance === 0) break;
    }
    return closest;
}

function capMappedDataToMaxColors(
    mappedData: MappedPixel[][],
    cellRgb: (RgbColor | null)[][],
    palette: PaletteColor[],
    maxColorCount: number
): void {
    const colorLimit = Math.max(1, Math.floor(maxColorCount) || palette.length);
    const frequency = new Map<string, number>();
    mappedData.flat().forEach((cell) => {
        if (cell && cell.key && !cell.isExternal) {
            frequency.set(cell.key, (frequency.get(cell.key) || 0) + 1);
        }
    });
    if (frequency.size <= colorLimit) return;

    const keptKeys = new Set(
        [...frequency.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, colorLimit)
            .map(([key]) => key)
    );
    const reducedPalette = palette.filter((color) => keptKeys.has(color.key));
    if (reducedPalette.length === 0) return;

    for (let j = 0; j < mappedData.length; j++) {
        for (let i = 0; i < mappedData[j].length; i++) {
            const cell = mappedData[j][i];
            if (!cell || cell.isExternal || keptKeys.has(cell.key)) continue;
            const rgb = cellRgb[j]?.[i] || hexToRgb(cell.color);
            if (!rgb) continue;
            const replacement = findClosestPaletteColor(rgb, reducedPalette);
            mappedData[j][i] = { key: replacement.key, color: replacement.hex };
        }
    }
}

/**
 * 每格对完整色库，按面积保留最大色数，其余用格子原色对到最接近的保留色。
 */
function quantizePerceptualGrid(
    cellRgb: (RgbColor | null)[][],
    palette: PaletteColor[],
    t1FallbackColor: PaletteColor,
    maxColorCount: number
): MappedPixel[][] {
    const M = cellRgb.length;
    const N = cellRgb[0]?.length ?? 0;
    const fallback = palette[0] || t1FallbackColor;
    if (!palette.length || N === 0 || M === 0) {
        return Array.from({ length: M }, () =>
            Array.from({ length: N }, () => ({ key: fallback.key, color: fallback.hex }))
        );
    }

    const paletteLabs = palette.map((color) => rgbToLab(color.rgb));
    const frequency = new Map<string, number>();
    const paletteByKey = new Map(palette.map((color) => [color.key, color]));

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const rgb = cellRgb[j][i];
            if (!rgb) continue;
            const closest = findClosestCiede2000(rgb, palette, paletteLabs);
            frequency.set(closest.key, (frequency.get(closest.key) || 0) + 1);
        }
    }

    const colorLimit = Math.max(1, Math.min(Math.floor(maxColorCount) || frequency.size, palette.length));
    const keptKeys = [...frequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.min(colorLimit, frequency.size))
        .map(([key]) => key);
    const workingPalette = keptKeys
        .map((key) => paletteByKey.get(key))
        .filter((color): color is PaletteColor => Boolean(color));
    const reduced = workingPalette.length > 0 ? workingPalette : palette;
    const reducedLabs = reduced.map((color) => rgbToLab(color.rgb));

    const mappedData: MappedPixel[][] = Array.from({ length: M }, () =>
        Array.from({ length: N }, () => ({ ...transparentColorData }))
    );

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const rgb = cellRgb[j][i];
            if (!rgb) continue;
            const bead = findClosestCiede2000(rgb, reduced, reducedLabs);
            mappedData[j][i] = { key: bead.key, color: bead.hex };
        }
    }

    console.log(`Pixel grid calculation complete for mode: perceptual (${reduced.length} colours by area)`);
    return mappedData;
} 
