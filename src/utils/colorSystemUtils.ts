import { PaletteColor } from './pixelation';
import colorSystemMapping from '../app/colorSystemMapping.json';
import mard221PaletteData from '../app/mard221Palette.json';
import mard221CommunityPaletteData from '../app/mard221CommunityPalette.json';

// 定义色号系统类型并导出
export type ColorSystem = 'MARD' | 'MARD221' | 'MARD221社区' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

// 色号系统选项
export const colorSystemOptions = [
  { key: 'MARD', name: 'MARD' },
  { key: 'MARD221', name: 'MARD 221' },
  { key: 'MARD221社区', name: 'MARD 221 社区' },
  { key: 'COCO', name: 'COCO' },
  { key: '漫漫', name: '漫漫' },
  { key: '盼盼', name: '盼盼' },
  { key: '咪小窝', name: '咪小窝' },
];

// 类型定义
type ColorMapping = Record<string, Record<ColorSystem, string>>;
const typedColorSystemMapping = colorSystemMapping as ColorMapping;

type Mard221Entry = { key: string; hex: string };

function buildMard221Maps(list: Mard221Entry[]) {
  const hexToCode = new Map<string, string>();
  const codeToHex = new Map<string, string>();
  list.forEach((item) => {
    const hex = item.hex.toUpperCase();
    hexToCode.set(hex, item.key);
    codeToHex.set(item.key, hex);
  });
  return { list, hexToCode, codeToHex };
}

const mard221Stock = buildMard221Maps(mard221PaletteData as Mard221Entry[]);
const mard221Community = buildMard221Maps(mard221CommunityPaletteData as Mard221Entry[]);

function mard221Table(colorSystem?: ColorSystem) {
  return colorSystem === 'MARD221社区' ? mard221Community : mard221Stock;
}

export function getMard221Keys(): string[] {
  return mard221Stock.list.map((item) => item.key);
}

export function getHexByMard221Key(code: string, colorSystem?: ColorSystem): string | undefined {
  const normalized = normalizeMard221Code(code);
  if (!normalized) return undefined;
  return mard221Table(colorSystem).codeToHex.get(normalized);
}

export function normalizeMard221Code(code: string): string | undefined {
  const match = code.trim().toUpperCase().match(/^([A-Z]+)0*([0-9]+)$/);
  if (!match) return undefined;
  const candidate = `${match[1]}${parseInt(match[2], 10)}`;
  return mard221Stock.codeToHex.has(candidate) || mard221Community.codeToHex.has(candidate)
    ? candidate
    : undefined;
}

function lookupMard221Code(hexValue: string, colorSystem?: ColorSystem): string | undefined {
  const normalizedHex = hexValue.toUpperCase();
  const table = mard221Table(colorSystem);
  const direct = table.hexToCode.get(normalizedHex);
  if (direct) return direct;
  const other = colorSystem === 'MARD221社区' ? mard221Stock : mard221Community;
  const viaOther = other.hexToCode.get(normalizedHex);
  if (viaOther) return viaOther;
  const mardCode = typedColorSystemMapping[normalizedHex]?.MARD;
  if (mardCode) {
    return normalizeMard221Code(mardCode);
  }
  return undefined;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function isMard221System(colorSystem: ColorSystem): boolean {
  return colorSystem === 'MARD221' || colorSystem === 'MARD221社区';
}

function paletteFromMard221List(list: Mard221Entry[]): PaletteColor[] {
  return list
    .map(({ hex }) => {
      const rgb = parseHexRgb(hex);
      if (!rgb) return null;
      const normalized = hex.toUpperCase();
      return { key: normalized, hex: normalized, rgb };
    })
    .filter((color): color is PaletteColor => color !== null);
}

export function getMard221Palette(): PaletteColor[] {
  return paletteFromMard221List(mard221Stock.list);
}

export function getMard221CommunityPalette(): PaletteColor[] {
  return paletteFromMard221List(mard221Community.list);
}

// 获取所有可用的hex值
export function getAllHexValues(): string[] {
  return Object.keys(typedColorSystemMapping);
}

// 获取所有MARD色号到hex值的映射（用于向后兼容）
export function getMardToHexMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  Object.entries(typedColorSystemMapping).forEach(([hex, colorData]) => {
    const mardKey = colorData.MARD;
    if (mardKey) {
      mapping[mardKey] = hex;
    }
  });
  return mapping;
}

// 从colorSystemMapping.json加载完整的颜色映射数据
export function loadFullColorMapping(): Map<string, Record<ColorSystem, string>> {
  const mapping = new Map<string, Record<ColorSystem, string>>();
  Object.entries(colorSystemMapping).forEach(([baseKey, colorData]) => {
    mapping.set(baseKey, colorData as Record<ColorSystem, string>);
  });
  return mapping;
}

// 将色板转换到指定色号系统
export function convertPaletteToColorSystem(
  palette: PaletteColor[],
  colorSystem: ColorSystem
): PaletteColor[] {
  return palette.map(color => {
    if (isMard221System(colorSystem)) {
      const code = lookupMard221Code(color.hex, colorSystem);
      return code ? { ...color, key: code } : color;
    }
    const colorMapping = typedColorSystemMapping[color.hex.toUpperCase()];
    if (colorMapping && colorMapping[colorSystem]) {
      return {
        ...color,
        key: colorMapping[colorSystem]
      };
    }
    return color; // 如果找不到映射，保持原样
  });
}

// 获取指定色号系统的显示键 - 基于hex值的简化版本
export function getDisplayColorKey(hexValue: string, colorSystem: ColorSystem): string {
  // 对于特殊键（如透明键），直接返回原键
  if (hexValue === 'ERASE' || hexValue.length === 0 || hexValue === '?') {
    return hexValue;
  }
  
  // 标准化hex值（确保大写）
  const normalizedHex = hexValue.toUpperCase();
  
  if (isMard221System(colorSystem)) {
    return lookupMard221Code(normalizedHex, colorSystem) || '?';
  }

  // 通过hex值从colorSystemMapping获取目标色号系统的值
  const colorMapping = typedColorSystemMapping[normalizedHex];
  if (colorMapping && colorMapping[colorSystem]) {
    return colorMapping[colorSystem];
  }
  
  return '?'; // 如果找不到映射，返回 '?'
}

// 将色号键转换到hex值（支持任意色号系统）
export function convertColorKeyToHex(displayKey: string, colorSystem: ColorSystem): string {
  // 如果已经是hex值，直接返回
  if (displayKey.startsWith('#') && displayKey.length === 7) {
    return displayKey.toUpperCase();
  }
  
  if (isMard221System(colorSystem)) {
    return mard221Table(colorSystem).codeToHex.get(displayKey) || displayKey;
  }

  // 在colorSystemMapping中查找对应的hex值
  for (const [hex, mapping] of Object.entries(typedColorSystemMapping)) {
    if (mapping[colorSystem] === displayKey) {
      return hex;
    }
  }
  
  return displayKey; // 如果找不到映射，返回原键
}

// 验证颜色在指定系统中是否有效
export function isValidColorInSystem(hexValue: string, colorSystem: ColorSystem): boolean {
  if (isMard221System(colorSystem)) {
    return mard221Table(colorSystem).hexToCode.has(hexValue.toUpperCase());
  }
  const mapping = typedColorSystemMapping[hexValue];
  return mapping && mapping[colorSystem] !== undefined;
}

// 通过hex值获取指定色号系统的色号
export function getColorKeyByHex(hexValue: string, colorSystem: ColorSystem): string {
  // 标准化hex值（确保大写）
  const normalizedHex = hexValue.toUpperCase();
  
  if (isMard221System(colorSystem)) {
    return lookupMard221Code(normalizedHex, colorSystem) || '?';
  }

  // 查找映射
  const mapping = typedColorSystemMapping[normalizedHex];
  if (mapping && mapping[colorSystem]) {
    return mapping[colorSystem];
  }
  
  // 如果找不到映射，返回 '?'
  return '?';
}

// 将hex颜色转换为HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  // 移除 # 符号
  const cleanHex = hex.replace('#', '');
  
  // 转换为RGB
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// 按色相排序颜色
export function sortColorsByHue<T extends { color: string }>(colors: T[]): T[] {
  return colors.slice().sort((a, b) => {
    const hslA = hexToHsl(a.color);
    const hslB = hexToHsl(b.color);
    
    // 首先按色相排序
    if (Math.abs(hslA.h - hslB.h) > 5) { // 增加色相容差，让更相近的色相归为一组
      return hslA.h - hslB.h;
    }
    
    // 色相相近时，按明度排序（从浅到深）
    if (Math.abs(hslA.l - hslB.l) > 3) {
      return hslB.l - hslA.l; // 浅色（高明度）在前，深色（低明度）在后
    }
    
    // 明度也相近时，按饱和度排序（高饱和度在前，让鲜艳的颜色更突出）
    return hslB.s - hslA.s;
  });
}

function seriesPrefix(displayKey: string, colorSystem: ColorSystem): string {
  if (colorSystem === '盼盼' || colorSystem === '咪小窝') {
    if (/^\d+$/.test(displayKey)) {
      const num = parseInt(displayKey, 10);
      if (num <= 20) return '1-20';
      if (num <= 50) return '21-50';
      if (num <= 100) return '51-100';
      if (num <= 200) return '101-200';
      return '200+';
    }
    return '其他';
  }
  return displayKey.match(/^[A-Z]+/)?.[0] || '其他';
}

function compareDisplayKeys(a: string, b: string, colorSystem: ColorSystem): number {
  if (colorSystem === '盼盼' || colorSystem === '咪小窝') {
    return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
  }
  const prefixA = a.match(/^[A-Z]+/)?.[0] || '';
  const prefixB = b.match(/^[A-Z]+/)?.[0] || '';
  if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
  return (parseInt(a.replace(/^[A-Z]+/, ''), 10) || 0) - (parseInt(b.replace(/^[A-Z]+/, ''), 10) || 0);
}

function compareSeriesPrefixes(a: string, b: string): number {
  if (a === '其他') return 1;
  if (b === '其他') return -1;
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, 'en');
}

export type ColorSeriesGroup = {
  prefix: string;
  colors: PaletteColor[];
};

/** 按当前色号系统的字母系列（A/B/C…）或数字段分组，组内按色号排序。 */
export function groupColorsBySeries(
  colors: PaletteColor[],
  colorSystem: ColorSystem
): ColorSeriesGroup[] {
  const groups = new Map<string, PaletteColor[]>();
  colors.forEach((color) => {
    const displayKey = getDisplayColorKey(color.hex, colorSystem);
    const prefix = seriesPrefix(displayKey, colorSystem);
    const list = groups.get(prefix);
    if (list) list.push(color);
    else groups.set(prefix, [color]);
  });
  groups.forEach((list) => {
    list.sort((a, b) =>
      compareDisplayKeys(
        getDisplayColorKey(a.hex, colorSystem),
        getDisplayColorKey(b.hex, colorSystem),
        colorSystem
      )
    );
  });
  return Array.from(groups.keys())
    .sort(compareSeriesPrefixes)
    .map((prefix) => ({ prefix, colors: groups.get(prefix) || [] }));
} 