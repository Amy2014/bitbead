'use client';

import React, { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo, useCallback } from 'react';
import Script from 'next/script';
import InstallPWA from '../components/InstallPWA';

// 导入像素化工具和类型
import {
  PixelationMode,
  calculatePixelGrid,
  RgbColor,
  PaletteColor,
  MappedPixel,
  hexToRgb,
  colorDistance,
  findClosestPaletteColor,
  collapseAdjacentSimilarPixels,
  INTRA_CELL_SIMILARITY,
  AA_PREPROCESS_VERSION,
  removeEdgeConnectedBackground
} from '../utils/pixelation';

// 导入新的类型和组件
import { GridDownloadOptions } from '../types/downloadTypes';
import DownloadSettingsModal, { gridLineColorOptions } from '../components/DownloadSettingsModal';
import { downloadImage, importCsvData } from '../utils/imageDownloader';

import { 
  colorSystemOptions, 
  convertPaletteToColorSystem, 
  getColorKeyByHex,
  getMardToHexMapping,
  getMard221Palette,
  sortColorsByHue,
  ColorSystem 
} from '../utils/colorSystemUtils';

// 添加自定义动画样式
const floatAnimation = `
  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
    100% { transform: translateY(0px); }
  }
  .animate-float {
    animation: float 3s ease-in-out infinite;
  }
`;

// Helper function for sorting color keys - 保留原有实现，因为未在utils中导出
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function BeadValueSlider({
  label,
  value,
  min,
  max,
  step = 1,
  accentClass,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  accentClass: string;
  onChange: (value: number) => void;
}) {
  const display = Number.isInteger(step) ? String(value) : value.toFixed(step < 1 ? 1 : 0);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">{display}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`减少${label}`}
          onClick={() => onChange(clampNumber(Number((value - step).toFixed(4)), min, max))}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-base leading-none text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
          className={`h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 dark:bg-gray-600 ${accentClass}`}
        />
        <button
          type="button"
          aria-label={`增加${label}`}
          onClick={() => onChange(clampNumber(Number((value + step).toFixed(4)), min, max))}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-base leading-none text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          +
        </button>
      </div>
    </div>
  );
}

// --- Define available palette key sets ---
// 从colorSystemMapping.json获取所有MARD色号
const mardToHexMapping = getMardToHexMapping();

// Pre-process the FULL palette data once - 使用colorSystemMapping而不是beadPaletteData
const fullBeadPalette: PaletteColor[] = Object.entries(mardToHexMapping)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      console.warn(`Invalid hex code "${hex}" for MARD key "${mardKey}". Skipping.`);
      return null;
    }
    // 使用hex值作为key，符合新的架构设计
    return { key: hex, hex, rgb };
  })
  .filter((color): color is PaletteColor => color !== null);

const mard221BeadPalette: PaletteColor[] = getMard221Palette();

// ++ Add definition for background color keys ++

// 1. 导入新组件
import PixelatedPreviewCanvas from '../components/PixelatedPreviewCanvas';
import ZoomPanViewport from '../components/ZoomPanViewport';
import EffectPosterStudio from '../components/EffectPosterStudio';
import GridTooltip from '../components/GridTooltip';
import CustomPaletteEditor from '../components/CustomPaletteEditor';
import FloatingColorPalette from '../components/FloatingColorPalette';
import FloatingToolbar from '../components/FloatingToolbar';
import { EditBrushStrip, EditColorInventory, PatternColor } from '../components/EditColorWorkbench';
import MagnifierTool from '../components/MagnifierTool';
import MagnifierSelectionOverlay from '../components/MagnifierSelectionOverlay';
import { loadPaletteSelections, savePaletteSelections, presetToSelections, PaletteSelections } from '../utils/localStorageUtils';
import {
  TRANSPARENT_KEY,
  transparentColorData,
  GridRect,
  collectSelectionColorStats,
  applySelectionClear,
  applySelectionFill,
  applySelectionReplace,
  recalculateColorStats,
} from '../utils/pixelEditingUtils';
import SelectionContextMenu from '../components/SelectionContextMenu';

// 1. 导入新的 DonationModal 组件
import DonationModal from '../components/DonationModal';
import FocusModePreDownloadModal from '../components/FocusModePreDownloadModal';

export default function Home() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [originalPreviewSrc, setOriginalPreviewSrc] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<number>(50);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0);
  const [maxColorCount, setMaxColorCount] = useState<number>(20);
  const [useCenterColorShare, setUseCenterColorShare] = useState<boolean>(false);
  const [centerColorMinSharePercent, setCenterColorMinSharePercent] = useState<number>(2);
  // 添加像素化模式状态
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.Dominant); // 默认为卡通模式
  
  // 新增：色号系统选择状态
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD221');
  
  const [activeBeadPalette, setActiveBeadPalette] = useState<PaletteColor[]>(() => {
      return mard221BeadPalette;
  });
  // 状态变量：存储被排除的颜色（hex值）
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  const [showExcludedColors, setShowExcludedColors] = useState<boolean>(false);
  const [speckCountThreshold, setSpeckCountThreshold] = useState<string>('10');
  // 用于记录初始网格颜色（hex值），用于显示排除功能
  const [initialGridColorKeys, setInitialGridColorKeys] = useState<Set<string>>(new Set());
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [colorCounts, setColorCounts] = useState<{ [key: string]: { count: number; color: string } } | null>(null);
  const [totalBeadCount, setTotalBeadCount] = useState<number>(0);
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, key: string, color: string } | null>(null);
  const [remapTrigger, setRemapTrigger] = useState<number>(0);
  const [isManualColoringMode, setIsManualColoringMode] = useState<boolean>(false);
  const [isEffectStudioOpen, setIsEffectStudioOpen] = useState<boolean>(false);
  const [effectArtworkSrc, setEffectArtworkSrc] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<MappedPixel | null>(null);
  // 新增：一键擦除模式状态
  const [isEraseMode, setIsEraseMode] = useState<boolean>(false);
  // 新增状态变量：控制打赏弹窗
  const [isDonationModalOpen, setIsDonationModalOpen] = useState<boolean>(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<PaletteSelections>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState<boolean>(false);
  const [isCustomPalette, setIsCustomPalette] = useState<boolean>(false);
  
  // ++ 新增：下载设置相关状态 ++
  const [isDownloadSettingsOpen, setIsDownloadSettingsOpen] = useState<boolean>(false);
  const [downloadOptions, setDownloadOptions] = useState<GridDownloadOptions>({
    showGrid: true,
    gridInterval: 10,
    showCoordinates: true,
    showCellNumbers: true,
    gridLineColor: gridLineColorOptions[0].value,
    includeStats: true, // 默认包含统计信息
    exportCsv: false // 默认不导出CSV
  });

  // 新增：高亮相关状态
  const [highlightColorKey, setHighlightColorKey] = useState<string | null>(null);
  const [isolateLockedHex, setIsolateLockedHex] = useState<string | null>(null);
  const [isolateHoverHex, setIsolateHoverHex] = useState<string | null>(null);
  const isolateColorKey = isolateLockedHex ?? isolateHoverHex;

  // 新增：完整色板切换状态
  const [showFullPalette, setShowFullPalette] = useState<boolean>(false);
  
  // 新增：颜色替换相关状态
  const [colorReplaceState, setColorReplaceState] = useState<{
    isActive: boolean;
    step: 'select-source' | 'select-target';
    sourceColor?: { key: string; color: string };
  }>({
    isActive: false,
    step: 'select-source'
  });
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isPickingBoardColor, setIsPickingBoardColor] = useState(false);
  const [boardBackgroundHex, setBoardBackgroundHex] = useState<string | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<GridRect | null>(null);
  const [selectionMenuPos, setSelectionMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionPending, setSelectionPending] = useState<
    null | { kind: 'replace'; source: { key: string; color: string } }
  >(null);

  // 新增：组件挂载状态
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // 新增：悬浮调色盘状态
  const [isFloatingPaletteOpen, setIsFloatingPaletteOpen] = useState<boolean>(true);

  // 新增：放大镜状态
  const [isMagnifierActive, setIsMagnifierActive] = useState<boolean>(false);
  const [magnifierSelectionArea, setMagnifierSelectionArea] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // 新增：活跃工具层级管理
  const [activeFloatingTool, setActiveFloatingTool] = useState<'palette' | 'magnifier' | null>(null);

  // 新增：专心拼豆模式进入前下载提醒弹窗
  const [isFocusModePreDownloadModalOpen, setIsFocusModePreDownloadModalOpen] = useState<boolean>(false);

  // 新增：编辑撤回历史栈（多步）
  interface EditSnapshot {
    mappedPixelData: MappedPixel[][];
    colorCounts: { [key: string]: { count: number; color: string } };
    totalBeadCount: number;
  }
  const [editHistory, setEditHistory] = useState<EditSnapshot[]>([]);

  // 新增：一键去背景撤回快照（单步）
  const [bgRemovalSnapshot, setBgRemovalSnapshot] = useState<EditSnapshot | null>(null);

  // 新增：轻量提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // 放大镜切换处理函数
  const handleToggleMagnifier = () => {
    const newActiveState = !isMagnifierActive;
    setIsMagnifierActive(newActiveState);
    
    // 如果关闭放大镜，清除选择区域，重新开始
    if (!newActiveState) {
      setMagnifierSelectionArea(null);
    }
  };

  // 激活工具处理函数
  const handleActivatePalette = () => {
    setActiveFloatingTool('palette');
  };

  const handleActivateMagnifier = () => {
    setActiveFloatingTool('magnifier');
  };

  // --- 撤回功能 ---

  // 保存编辑快照到历史栈
  const saveEditSnapshot = useCallback(() => {
    if (!mappedPixelData || !colorCounts) return;
    const snapshot: EditSnapshot = {
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: { ...colorCounts },
      totalBeadCount,
    };
    setEditHistory(prev => [...prev.slice(-49), snapshot]);
  }, [mappedPixelData, colorCounts, totalBeadCount]);

  // 编辑模式多步撤回
  const handleUndoEdit = useCallback(() => {
    if (editHistory.length === 0) return;
    const snapshot = editHistory[editHistory.length - 1];
    setMappedPixelData(snapshot.mappedPixelData);
    setColorCounts(snapshot.colorCounts);
    setTotalBeadCount(snapshot.totalBeadCount);
    setEditHistory(prev => prev.slice(0, -1));
    showToast('已撤回上一步');
  }, [editHistory, showToast]);

  const handleMirrorPattern = useCallback((axis: 'horizontal' | 'vertical') => {
    if (!mappedPixelData) return;
    saveEditSnapshot();
    if (axis === 'horizontal') {
      setMappedPixelData(
        mappedPixelData.map((row) => [...row].reverse().map((cell) => ({ ...cell })))
      );
      showToast('已左右镜像');
    } else {
      setMappedPixelData(
        [...mappedPixelData].reverse().map((row) => row.map((cell) => ({ ...cell })))
      );
      showToast('已上下镜像');
    }
  }, [mappedPixelData, saveEditSnapshot, showToast]);

  // 一键去背景单步撤回
  const handleUndoBgRemoval = useCallback(() => {
    if (!bgRemovalSnapshot) return;
    setMappedPixelData(bgRemovalSnapshot.mappedPixelData);
    setColorCounts(bgRemovalSnapshot.colorCounts);
    setTotalBeadCount(bgRemovalSnapshot.totalBeadCount);
    setBgRemovalSnapshot(null);
    showToast('已撤回背景去除');
  }, [bgRemovalSnapshot, showToast]);

  // 清空编辑历史（参数变化、退出编辑模式等时调用）
  const clearEditHistory = useCallback(() => {
    setEditHistory([]);
  }, []);

  // 放大镜像素编辑处理函数
  const cellMatchesIsolate = (cell: MappedPixel | undefined) => {
    if (!isolateLockedHex) return true;
    if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return false;
    return (cell.color || '').toUpperCase() === isolateLockedHex;
  };

  const handleMagnifierPixelEdit = (row: number, col: number, colorData: { key: string; color: string }) => {
    if (!mappedPixelData) return;

    const oldPixel = mappedPixelData[row][col];
    if (!oldPixel || oldPixel.key === colorData.key) return;
    if (!cellMatchesIsolate(oldPixel)) return;

    // 创建新的像素数据
    const newMappedPixelData = mappedPixelData.map((rowData, r) =>
      rowData.map((pixel, c) => {
        if (r === row && c === col) {
          return {
            key: colorData.key,
            color: colorData.color
          } as MappedPixel;
        }
        return pixel;
      })
    );

    saveEditSnapshot();
    setMappedPixelData(newMappedPixelData);

    // 更新颜色统计
    if (colorCounts) {
      const newColorCounts = { ...colorCounts };

      // 减少原颜色的计数
      if (newColorCounts[oldPixel.key]) {
        newColorCounts[oldPixel.key].count--;
        if (newColorCounts[oldPixel.key].count === 0) {
          delete newColorCounts[oldPixel.key];
        }
      }

      // 增加新颜色的计数
      if (newColorCounts[colorData.key]) {
        newColorCounts[colorData.key].count++;
      } else {
        newColorCounts[colorData.key] = {
          count: 1,
          color: colorData.color
        };
      }

      setColorCounts(newColorCounts);

      // 更新总计数
      const newTotal = Object.values(newColorCounts).reduce((sum, item) => sum + item.count, 0);
      setTotalBeadCount(newTotal);
    }
  };

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const collapsedCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement>(null);
  const effectCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageProcessCacheRef = useRef<{
    src: string;
    version: string;
    width: number;
    height: number;
    original: ImageData;
    collapsed: ImageData;
  } | null>(null);
  const csvImportLockRef = useRef<{ src: string; n: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalPreviewInputRef = useRef<HTMLInputElement>(null);
  // ++ 添加: Ref for import file input ++
  const importPaletteInputRef = useRef<HTMLInputElement>(null);
  //const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // ++ Re-add touch refs needed for tooltip logic ++
  //const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  //const touchMovedRef = useRef<boolean>(false);

  // ++ Add a ref for the main element ++
  const mainRef = useRef<HTMLElement>(null);

  const catalogPalette = selectedColorSystem === 'MARD221' ? mard221BeadPalette : fullBeadPalette;

  // --- Derived State ---

  // Update active palette based on selection and exclusions
  useEffect(() => {
    const newActiveBeadPalette = catalogPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex] !== false;
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 根据选择的色号系统转换调色板
    const convertedPalette = convertPaletteToColorSystem(newActiveBeadPalette, selectedColorSystem);
    setActiveBeadPalette(convertedPalette);
  }, [catalogPalette, customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // ++ Calculate unique colors currently on the grid for the palette ++
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    // 使用hex值进行去重，避免多个MARD色号对应同一个目标色号系统值时产生重复key
    const uniqueColorsMap = new Map<string, MappedPixel>();
    mappedPixelData.flat().forEach(cell => {
      if (cell && cell.color && !cell.isExternal) {
        const hexKey = cell.color.toUpperCase();
        if (!uniqueColorsMap.has(hexKey)) {
          // 存储hex值作为key，保持颜色信息
          uniqueColorsMap.set(hexKey, { key: cell.key, color: cell.color });
        }
      }
    });
    
    // 转换为数组并为每个hex值生成对应的色号系统显示
    const originalColors = Array.from(uniqueColorsMap.values());
    
    const colorData = originalColors.map(color => {
      const displayKey = getColorKeyByHex(color.color.toUpperCase(), selectedColorSystem);
      return {
        key: displayKey,
        color: color.color
      };
    });

    // 使用色相排序而不是色号排序
    return sortColorsByHue(colorData);
  }, [mappedPixelData, selectedColorSystem]);

  const patternColors: PatternColor[] = useMemo(() => {
    if (!colorCounts) return [];
    return Object.entries(colorCounts)
      .filter(([, data]) => data.count > 0)
      .map(([hex, data]) => ({
        hex: hex.toUpperCase(),
        color: data.color,
        key: hex.toUpperCase(),
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [colorCounts]);

  // 初始化时从本地存储加载自定义色板选择
  useEffect(() => {
    // 尝试从localStorage加载
    const savedSelections = loadPaletteSelections();
    if (savedSelections && Object.keys(savedSelections).length > 0) {
      console.log('从localStorage加载的数据键数量:', Object.keys(savedSelections).length);
      // 验证加载的数据是否都是有效的hex值
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const validSelections: PaletteSelections = {};
      let hasValidData = false;
      let validCount = 0;
      let invalidCount = 0;
      
      Object.entries(savedSelections).forEach(([key, value]) => {
        // 严格验证：键必须是有效的hex格式，并且存在于调色板中
        if (/^#[0-9A-F]{6}$/i.test(key) && allHexValues.includes(key.toUpperCase())) {
          validSelections[key.toUpperCase()] = value;
          hasValidData = true;
          validCount++;
        } else {
          invalidCount++;
        }
      });
      
      console.log(`验证结果: 有效键 ${validCount} 个, 无效键 ${invalidCount} 个`);
      
      if (hasValidData) {
        setCustomPaletteSelections(validSelections);
    setIsCustomPalette(true);
    } else {
        console.log('所有数据都无效，清除localStorage并重新初始化');
        // 如果本地数据无效，清除localStorage并默认选择所有颜色
        localStorage.removeItem('customPerlerPaletteSelections');
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
    } else {
      console.log('没有localStorage数据，默认选择所有颜色');
      // 如果没有保存的选择，默认选择所有颜色
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
  }, []); // 只在组件首次加载时执行

  useEffect(() => {
    setCustomPaletteSelections((prev) => {
      let changed = false;
      const next = { ...prev };
      catalogPalette.forEach((color) => {
        const hex = color.hex.toUpperCase();
        if (next[hex] === undefined) {
          next[hex] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [catalogPalette]);

  // 更新 activeBeadPalette 基于自定义选择和排除列表
  useEffect(() => {
    const newActiveBeadPalette = catalogPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex] !== false;
      // 使用hex值进行排除检查
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    setActiveBeadPalette(convertPaletteToColorSystem(newActiveBeadPalette, selectedColorSystem));
  }, [catalogPalette, customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // --- Event Handlers ---

  // 专心拼豆模式相关处理函数
  const handleEnterFocusMode = () => {
    setIsFocusModePreDownloadModalOpen(true);
  };

  const handleProceedToFocusMode = () => {
    // 保存数据到localStorage供专心拼豆模式使用
    localStorage.setItem('focusMode_pixelData', JSON.stringify(mappedPixelData));
    localStorage.setItem('focusMode_gridDimensions', JSON.stringify(gridDimensions));
    localStorage.setItem('focusMode_colorCounts', JSON.stringify(colorCounts));
    localStorage.setItem('focusMode_selectedColorSystem', selectedColorSystem);
    
    // 跳转到专心拼豆页面
    window.location.href = '/focus';
  };

  // 添加一个安全的文件输入触发函数
  const triggerFileInput = useCallback(() => {
    // 检查组件是否已挂载
    if (!isMounted) {
      console.warn("组件尚未完全挂载，延迟触发文件选择");
      setTimeout(() => triggerFileInput(), 200);
      return;
    }
    
    // 检查 ref 是否存在
    if (fileInputRef.current) {
      try {
        fileInputRef.current.click();
      } catch (error) {
        console.error("触发文件选择失败:", error);
        // 如果直接点击失败，尝试延迟执行
        setTimeout(() => {
          try {
            fileInputRef.current?.click();
          } catch (retryError) {
            console.error("重试触发文件选择失败:", retryError);
          }
        }, 100);
      }
    } else {
      // 如果 ref 不存在，延迟重试
      console.warn("文件输入引用不存在，将在100ms后重试");
      setTimeout(() => {
        if (fileInputRef.current) {
          try {
            fileInputRef.current.click();
          } catch (error) {
            console.error("延迟触发文件选择失败:", error);
          }
        }
      }, 100);
    }
  }, [isMounted]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 检查文件类型是否支持
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();
      
      // 支持的图片类型
      const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      // 支持的CSV MIME类型（不同浏览器可能返回不同的MIME类型）
      const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

      const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
      const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

      if (isImageFile || isCsvFile) {
        setExcludedColorKeys(new Set()); // ++ 重置排除列表 ++
        processFile(file);
      } else {
        alert(`不支持的文件类型: ${file.type || '未知'}。请选择 JPG、PNG、GIF 格式的图片文件，或 CSV 数据文件。\n文件名: ${file.name}`);
        console.warn(`Unsupported file type: ${file.type}, file name: ${file.name}`);
      }
    }
    // 重置文件输入框的值，这样用户可以重新选择同一个文件
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        
        // 使用与handleFileChange相同的文件类型检查逻辑
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();
        
        // 支持的图片类型
        const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        // 支持的CSV MIME类型（不同浏览器可能返回不同的MIME类型）
        const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

        const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
        const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

        if (isImageFile || isCsvFile) {
          setExcludedColorKeys(new Set()); // ++ 重置排除列表 ++
          processFile(file);
        } else {
          alert(`不支持的文件类型: ${file.type || '未知'}。请拖放 JPG、PNG、GIF 格式的图片文件，或 CSV 数据文件。\n文件名: ${file.name}`);
          console.warn(`Unsupported file type: ${file.type}, file name: ${file.name}`);
        }
      }
    } catch (error) {
      console.error("处理拖拽文件时发生错误:", error);
      alert("处理文件时发生错误，请重试。");
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 根据mappedPixelData生成合成的originalImageSrc
  const generateSyntheticImageFromPixelData = (pixelData: MappedPixel[][], dimensions: { N: number; M: number }): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('无法创建canvas上下文');
      return '';
    }
    
    // 设置画布尺寸，每个像素用8x8像素来表示以确保清晰度
    const pixelSize = 8;
    canvas.width = dimensions.N * pixelSize;
    canvas.height = dimensions.M * pixelSize;
    
    // 绘制每个像素
    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return;
        ctx.fillStyle = cell.color;
        ctx.fillRect(
          colIndex * pixelSize,
          rowIndex * pixelSize,
          pixelSize,
          pixelSize
        );
      });
    });
    
    // 转换为dataURL
    return canvas.toDataURL('image/png');
  };

  const sizeImportedBeadCanvases = (N: number, M: number) => {
    const aspectRatio = M / Math.max(N, 1);
    const baseWidth = 500;
    const minCellSize = 4;
    const recommendedCellSize = 6;
    let outputWidth = baseWidth;
    if (N > 100) {
      const maxWidth = Math.min(1200, window.innerWidth * 0.9);
      outputWidth = Math.min(
        maxWidth,
        Math.max(baseWidth, N * recommendedCellSize, N * minCellSize)
      );
    }
    const outputHeight = Math.max(1, Math.round(outputWidth * aspectRatio));
    if (pixelatedCanvasRef.current) {
      pixelatedCanvasRef.current.width = outputWidth;
      pixelatedCanvasRef.current.height = outputHeight;
    }
    if (effectCanvasRef.current) {
      effectCanvasRef.current.width = outputWidth;
      effectCanvasRef.current.height = outputHeight;
    }
  };

  const processFile = (file: File) => {
    // 检查文件类型
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      // 处理CSV文件
      console.log('正在导入CSV文件...');
      importCsvData(file)
        .then(({ mappedPixelData, gridDimensions }) => {
          console.log(`成功导入CSV文件: ${gridDimensions.N}x${gridDimensions.M}`);
          
          // 设置导入的数据
          setMappedPixelData(mappedPixelData);
          setGridDimensions(gridDimensions);
          setOriginalImageSrc(null);
          setOriginalPreviewSrc(null);
          
          // 计算颜色统计
          const colorCountsMap: { [key: string]: { count: number; color: string } } = {};
          let totalCount = 0;
          
          mappedPixelData.forEach(row => {
            row.forEach(cell => {
              if (cell && !cell.isExternal) {
                const colorKey = cell.color.toUpperCase();
                if (colorCountsMap[colorKey]) {
                  colorCountsMap[colorKey].count++;
                } else {
                  colorCountsMap[colorKey] = {
                    count: 1,
                    color: cell.color
                  };
                }
                totalCount++;
              }
            });
          });
          
          setColorCounts(colorCountsMap);
          setTotalBeadCount(totalCount);
          setInitialGridColorKeys(new Set(Object.keys(colorCountsMap)));
          
          // 根据mappedPixelData生成合成的originalImageSrc（透明格保持透明，避免再映射成白豆）
          const syntheticImageSrc = generateSyntheticImageFromPixelData(mappedPixelData, gridDimensions);
          csvImportLockRef.current = { src: syntheticImageSrc, n: gridDimensions.N };
          sizeImportedBeadCanvases(gridDimensions.N, gridDimensions.M);
          setOriginalImageSrc(syntheticImageSrc);
          setOriginalPreviewSrc(syntheticImageSrc);
          
          // 重置状态
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setIsEraseMode(false);
          
          // 设置格子数量为导入的尺寸，避免重新映射时尺寸被修改
          setGranularity(gridDimensions.N);
          
          alert(`成功导入CSV文件！图纸尺寸：${gridDimensions.N}x${gridDimensions.M}，共使用${Object.keys(colorCountsMap).length}种颜色。`);
        })
        .catch(error => {
          console.error('CSV导入失败:', error);
          alert(`CSV导入失败：${error.message}`);
        });
    } else {
      // 处理图片文件
      const applyImageSrc = (result: string) => {
        csvImportLockRef.current = null;
        setOriginalImageSrc(result);
        setOriginalPreviewSrc(result);
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setTotalBeadCount(0);
        setInitialGridColorKeys(new Set()); // ++ 重置初始键 ++
        // ++ 重置横轴格子数量为默认值 ++
        const defaultGranularity = 100;
        setGranularity(defaultGranularity);
        setRemapTrigger(prev => prev + 1); // Trigger full remap for new image
      };

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

      if (isGif) {
        // GIF 走 createImageBitmap，规范保证返回首帧（default image），再烘焙为 PNG dataURL
        createImageBitmap(file)
          .then((bitmap) => {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 上下文');
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            applyImageSrc(canvas.toDataURL('image/png'));
          })
          .catch((error) => {
            console.error('GIF 处理失败:', error);
            alert('无法读取 GIF 文件。');
            setInitialGridColorKeys(new Set());
          });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          applyImageSrc(e.target?.result as string);
        };
        reader.onerror = () => {
          console.error("文件读取失败");
          alert("无法读取文件。");
          setInitialGridColorKeys(new Set()); // ++ 重置初始键 ++
        };
        reader.readAsDataURL(file);
      }
      // ++ Reset manual coloring mode when a new file is processed ++
      setIsManualColoringMode(false);
      setSelectedColor(null);
      setIsEraseMode(false);
      setIsPickingBoardColor(false);
      setBoardBackgroundHex(null);
    }
  };

  const handleReplaceOriginalPreview = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件（JPG / PNG / GIF）。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOriginalPreviewSrc(reader.result);
      }
    };
    reader.onerror = () => {
      alert('无法读取图片。');
    };
    reader.readAsDataURL(file);
  };

  // 处理一键擦除模式切换
  const handleEraseToggle = () => {
    // 确保在手动上色模式下才能使用擦除功能
    if (!isManualColoringMode) {
      return;
    }
    
    // 如果当前在颜色替换模式，先退出替换模式
    if (colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    setIsEraseMode(!isEraseMode);
    // 如果开启擦除模式，取消选中的颜色
    if (!isEraseMode) {
      setSelectedColor(null);
      setIsSelectMode(false);
      setMarqueeRect(null);
      setSelectionMenuPos(null);
      setSelectionPending(null);
      setIsPickingBoardColor(false);
    }
  };

  // 添加像素化模式切换处理函数
  const handlePixelationModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newMode = event.target.value as PixelationMode;
    if (Object.values(PixelationMode).includes(newMode)) {
        setPixelationMode(newMode);
        setRemapTrigger(prev => prev + 1); // 触发重新映射
        setIsManualColoringMode(false); // 退出手动模式
        setSelectedColor(null);
    } else {
        console.warn(`无效的像素化模式: ${newMode}`);
    }
  };

  // 修改pixelateImage函数接收模式参数
  const pixelateImage = (imageSrc: string, detailLevel: number, threshold: number, currentPalette: PaletteColor[], mode: PixelationMode, colorLimit: number, centerSharePercent: number = 2, useCenterColor: boolean = false) => {
    console.log(`Attempting to pixelate with detail: ${detailLevel}, threshold: ${threshold}, mode: ${mode}, max colors: ${colorLimit}`);
    const originalCanvas = originalCanvasRef.current;
    const pixelatedCanvas = pixelatedCanvasRef.current;

    if (!originalCanvas || !pixelatedCanvas) { console.error("Canvas ref(s) not available."); return; }
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
    const pixelatedCtx = pixelatedCanvas.getContext('2d');
    if (!originalCtx || !pixelatedCtx) { console.error("Canvas context(s) not found."); return; }
    console.log("Canvas contexts obtained.");

    if (currentPalette.length === 0) {
        console.error("Cannot pixelate: The selected color palette is empty (likely due to exclusions).");
        alert("错误：当前可用颜色板为空（可能所有颜色都被排除了），无法处理图像。请尝试恢复部分颜色。");
        // Clear previous results visually
        pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
        setMappedPixelData(null);
        setGridDimensions(null);
        // Keep colorCounts potentially showing the last valid counts? Or clear them too?
        // setColorCounts(null); // Decide if clearing counts is desired when palette is empty
        // setTotalBeadCount(0);
        return; // Stop processing
    }
    const t1FallbackColor = currentPalette.find(p => p.key === 'T1')
                         || currentPalette.find(p => p.hex.toUpperCase() === '#FFFFFF')
                         || currentPalette[0]; // 使用第一个可用颜色作为备用
    console.log("Using fallback color for empty cells:", t1FallbackColor);

    const paintCollapsedPreview = (data: ImageData, force = false) => {
      const canvas = collapsedCanvasRef.current;
      if (!canvas) return;
      if (!force && canvas.width === data.width && canvas.height === data.height) return;
      canvas.width = data.width;
      canvas.height = data.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.putImageData(data, 0, 0);
    };

    const processLoadedImage = (imgWidth: number, imgHeight: number, sourceData: ImageData) => {
      const aspectRatio = imgHeight / imgWidth;
      const N = detailLevel;
      const M = Math.max(1, Math.round(N * aspectRatio));
      if (N <= 0 || M <= 0) { console.error("Invalid grid dimensions:", { N, M }); return; }
      console.log(`Grid size: ${N}x${M}`);

      // 动态调整画布尺寸：当格子数量大于100时，增加画布尺寸以保持每个格子的可见性
      const baseWidth = 500;
      const minCellSize = 4; // 每个格子的最小尺寸（像素）
      const recommendedCellSize = 6; // 推荐的格子尺寸（像素）
      
      let outputWidth = baseWidth;
      
      // 如果格子数量大于100，计算需要的画布宽度
      if (N > 100) {
        const requiredWidthForMinSize = N * minCellSize;
        const requiredWidthForRecommendedSize = N * recommendedCellSize;
        
        // 使用推荐尺寸，但不超过屏幕宽度的90%（最大1200px）
        const maxWidth = Math.min(1200, window.innerWidth * 0.9);
        outputWidth = Math.min(maxWidth, Math.max(baseWidth, requiredWidthForRecommendedSize));
        
        // 确保不小于最小要求
        outputWidth = Math.max(outputWidth, requiredWidthForMinSize);
        
        console.log(`Large grid detected (${N} columns). Adjusted canvas width from ${baseWidth} to ${outputWidth}px (cell size: ${Math.round(outputWidth / N)}px)`);
      }
      
      const outputHeight = Math.round(outputWidth * aspectRatio);
      
      // 在控制台提示用户画布尺寸变化
      if (N > 100) {
        console.log(`💡 由于格子数量较多 (${N}x${M})，画布已自动放大以保持清晰度。可以使用水平滚动查看完整图像。`);
      }
      pixelatedCanvas.width = outputWidth; pixelatedCanvas.height = outputHeight;
      if (effectCanvasRef.current) {
        effectCanvasRef.current.width = outputWidth;
        effectCanvasRef.current.height = outputHeight;
      }
      console.log(`Canvas dimensions: Original ${imgWidth}x${imgHeight}, Output ${outputWidth}x${outputHeight}`);

      const initialMappedData = calculatePixelGrid(
          originalCtx,
          imgWidth,
          imgHeight,
          N,
          M,
          currentPalette, 
          mode,
          t1FallbackColor,
          colorLimit,
          Math.max(0, centerSharePercent) / 100,
          sourceData,
          useCenterColor
      );
      console.log(`Initial data mapping complete using mode ${mode}. Starting global color merging...`);

      // --- 新的全局颜色合并逻辑 ---
      const keyToRgbMap = new Map<string, RgbColor>();
      const keyToColorDataMap = new Map<string, PaletteColor>();
      currentPalette.forEach(p => {
        keyToRgbMap.set(p.key, p.rgb);
        keyToColorDataMap.set(p.key, p);
      });

      // 2. 统计初始颜色数量
      const initialColorCounts: { [key: string]: number } = {};
      initialMappedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
              initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
          }
      });
      console.log("Initial color counts:", initialColorCounts);

      // 3. 创建一个颜色排序列表，按出现频率从高到低排序
      const colorsByFrequency = Object.entries(initialColorCounts)
          .sort((a, b) => b[1] - a[1])  // 按频率降序排序
          .map(entry => entry[0]);      // 只保留颜色键
      
      if (colorsByFrequency.length === 0) {
          console.log("No non-background colors found! Skipping merging.");
      }

      console.log("Colors sorted by frequency:", colorsByFrequency);
      
      // 4. 复制初始数据，准备合并
      const mergedData: MappedPixel[][] = initialMappedData.map(row => 
          row.map(cell => ({ ...cell, isExternal: cell.isExternal ?? false }))
      );
      
      // 5. 处理相似颜色合并（感知色差模式已在网格内完成收色，不再二次合并）
      const similarityThresholdValue = threshold;
      
      // 已被合并（替换）的颜色集合
      const replacedColors = new Set<string>();
      
      // 对每个颜色按频率从高到低处理
      for (let i = 0; mode !== PixelationMode.Perceptual && i < colorsByFrequency.length; i++) {
          const currentKey = colorsByFrequency[i];
          
          // 如果当前颜色已经被合并到更频繁的颜色中，跳过
          if (replacedColors.has(currentKey)) continue;
          
          const currentRgb = keyToRgbMap.get(currentKey);
          if (!currentRgb) {
              console.warn(`RGB not found for key ${currentKey}. Skipping.`);
              continue;
          }
          
          // 检查剩余的低频颜色
          for (let j = i + 1; j < colorsByFrequency.length; j++) {
              const lowerFreqKey = colorsByFrequency[j];
              
              // 如果低频颜色已被替换，跳过
              if (replacedColors.has(lowerFreqKey)) continue;
              
              const lowerFreqRgb = keyToRgbMap.get(lowerFreqKey);
              if (!lowerFreqRgb) {
                  console.warn(`RGB not found for key ${lowerFreqKey}. Skipping.`);
                  continue;
              }
              
              // 计算颜色距离
              const dist = colorDistance(currentRgb, lowerFreqRgb);
              
              // 如果距离小于阈值，将低频颜色替换为高频颜色
              if (dist < similarityThresholdValue) {
                  console.log(`Merging color ${lowerFreqKey} into ${currentKey} (Distance: ${dist.toFixed(2)})`);
                  
                  // 标记这个颜色已被替换
                  replacedColors.add(lowerFreqKey);
                  
                  // 替换所有使用这个低频颜色的单元格
                  for (let r = 0; r < M; r++) {
                      for (let c = 0; c < N; c++) {
                          if (mergedData[r][c].key === lowerFreqKey) {
                              const colorData = keyToColorDataMap.get(currentKey);
                              if (colorData) {
                                  mergedData[r][c] = {
                                      key: currentKey,
                                      color: colorData.hex,
                                      isExternal: false
                                  };
                              }
                          }
                      }
                  }
              }
          }
      }
      
      if (replacedColors.size > 0) {
          console.log(`Merged ${replacedColors.size} less frequent similar colors into more frequent ones.`);
      } else {
          console.log("No colors were similar enough to merge.");
      }
      // --- 结束新的全局颜色合并逻辑 ---

      // --- 绘制和状态更新 ---
      if (pixelatedCanvasRef.current) {
        setMappedPixelData(mergedData);
        setGridDimensions({ N, M });

        const counts: { [key: string]: { count: number; color: string } } = {};
        let totalCount = 0;
        mergedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal) {
            // 使用hex值作为统计键值，而不是色号
            const hexKey = cell.color;
            if (!counts[hexKey]) {
              counts[hexKey] = { count: 0, color: cell.color };
            }
            counts[hexKey].count++;
            totalCount++;
          }
        });
        setColorCounts(counts);
        setTotalBeadCount(totalCount);
        setInitialGridColorKeys(new Set(Object.keys(counts)));
        console.log("Color counts updated based on merged data (after merging):", counts);
        console.log("Total bead count (total beads):", totalCount);
        console.log("Stored initial grid color keys:", Object.keys(counts));
      } else {
        console.error("Pixelated canvas ref is null, skipping draw call in pixelateImage.");
      }
    };

    const cache = imageProcessCacheRef.current;
    if (cache && cache.src === imageSrc && cache.version === AA_PREPROCESS_VERSION) {
      paintCollapsedPreview(cache.collapsed);
      const sourceData = mode === PixelationMode.Average ? cache.original : cache.collapsed;
      processLoadedImage(cache.width, cache.height, sourceData);
    } else {
      const img = new window.Image();
      img.onerror = (error: Event | string) => {
        console.error("Image loading failed:", error);
        alert("无法加载图片。");
        setOriginalImageSrc(null);
        setOriginalPreviewSrc(null);
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setInitialGridColorKeys(new Set());
      };
      img.onload = () => {
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;
        originalCtx.drawImage(img, 0, 0, img.width, img.height);
        const original = originalCtx.getImageData(0, 0, img.width, img.height);
        const collapsed = collapseAdjacentSimilarPixels(original, INTRA_CELL_SIMILARITY);
        imageProcessCacheRef.current = {
          src: imageSrc,
          version: AA_PREPROCESS_VERSION,
          width: img.width,
          height: img.height,
          original,
          collapsed,
        };
        paintCollapsedPreview(collapsed, true);
        const sourceData = mode === PixelationMode.Average ? original : collapsed;
        processLoadedImage(img.width, img.height, sourceData);
      };
      img.src = imageSrc;
    }
    setIsManualColoringMode(false);
    setSelectedColor(null);
  }; // 正确闭合 pixelateImage 函数

  // 当 remapTrigger 变化时清空撤回历史（参数调整/颜色排除/新图上传等均会触发 remap）
  useEffect(() => {
    clearEditHistory();
    setBgRemovalSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapTrigger, granularity, similarityThreshold, maxColorCount, centerColorMinSharePercent, useCenterColorShare, pixelationMode]);

  // 修改useEffect中的pixelateImage调用，加入模式参数
  useEffect(() => {
    if (originalImageSrc && activeBeadPalette.length > 0) {
       const timeoutId = setTimeout(() => {
         const csvLock = csvImportLockRef.current;
         if (csvLock && csvLock.src === originalImageSrc && csvLock.n === granularity) {
           return;
         }
         csvImportLockRef.current = null;
         if (originalImageSrc && originalCanvasRef.current && collapsedCanvasRef.current && pixelatedCanvasRef.current && activeBeadPalette.length > 0) {
           console.log("useEffect triggered: Processing image due to src, granularity, threshold, palette selection, mode or remap trigger.");
           pixelateImage(originalImageSrc, granularity, similarityThreshold, activeBeadPalette, pixelationMode, maxColorCount, centerColorMinSharePercent, useCenterColorShare);
         } else {
            console.warn("useEffect check failed inside timeout: Refs or active palette not ready/empty.");
         }
       }, 220);
       return () => clearTimeout(timeoutId);
    } else if (originalImageSrc && activeBeadPalette.length === 0) {
        console.warn("Image selected, but the active palette is empty after exclusions. Cannot process. Clearing preview.");
        const pixelatedCanvas = pixelatedCanvasRef.current;
        const pixelatedCtx = pixelatedCanvas?.getContext('2d');
        if (pixelatedCtx && pixelatedCanvas) {
            pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
            // Draw a message on the canvas?
            pixelatedCtx.fillStyle = '#6b7280'; // gray-500
            pixelatedCtx.font = '16px sans-serif';
            pixelatedCtx.textAlign = 'center';
            pixelatedCtx.fillText('无可用颜色，请恢复部分排除的颜色', pixelatedCanvas.width / 2, pixelatedCanvas.height / 2);
        }
        setMappedPixelData(null);
        setGridDimensions(null);
        // Keep colorCounts to allow user to un-exclude colors
        // setColorCounts(null);
        // setTotalBeadCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImageSrc, granularity, similarityThreshold, maxColorCount, centerColorMinSharePercent, useCenterColorShare, activeBeadPalette, pixelationMode, remapTrigger, selectedColorSystem]);

  useEffect(() => {
    const src = pixelatedCanvasRef.current;
    const dst = effectCanvasRef.current;
    if (src && dst && src.width > 0 && (dst.width !== src.width || dst.height !== src.height)) {
      dst.width = src.width;
      dst.height = src.height;
    }
  }, [mappedPixelData, gridDimensions]);

  // 确保文件输入框引用在组件挂载后正确设置
  useEffect(() => {
    // 延迟执行，确保DOM完全渲染
    const timer = setTimeout(() => {
      if (!fileInputRef.current) {
        console.warn("文件输入框引用在组件挂载后仍为null，这可能会导致上传功能异常");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 设置组件挂载状态
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 添加URL重定向检查
  useEffect(() => {
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      const currentHostname = window.location.hostname;
      const targetDomain = 'https://perlerbeadsold.zippland.com/';
      
      // 排除localhost和127.0.0.1等本地开发环境
      const isLocalhost = currentHostname === 'localhost' || 
                         currentHostname === '127.0.0.1' || 
                         currentHostname.startsWith('192.168.') ||
                         currentHostname.startsWith('10.') ||
                         currentHostname.endsWith('.local');
      
      // 检查当前URL是否不是目标域名，且不是本地开发环境
      if (!currentUrl.startsWith(targetDomain) && !isLocalhost) {
        console.log(`当前URL: ${currentUrl}`);
        console.log(`目标URL: ${targetDomain}`);
        console.log('正在重定向到官方域名...');
        
        // 保留当前路径和查询参数
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const currentHash = window.location.hash;
        
        // 构建完整的目标URL
        let redirectUrl = targetDomain;
        
        // 如果不是根路径，添加路径
        if (currentPath && currentPath !== '/') {
          redirectUrl = redirectUrl.replace(/\/$/, '') + currentPath;
        }
        
        // 添加查询参数和哈希
        redirectUrl += currentSearch + currentHash;
        
        // 执行重定向
        window.location.replace(redirectUrl);
      } else if (isLocalhost) {
        console.log(`检测到本地开发环境 (${currentHostname})，跳过重定向`);
      }
    }
  }, []); // 只在组件首次挂载时执行

    // --- Download function (ensure filename includes palette) ---
    const handleDownloadRequest = (options?: GridDownloadOptions) => {
        // 调用移动到utils/imageDownloader.ts中的downloadImage函数
        downloadImage({
          mappedPixelData,
          gridDimensions,
          colorCounts,
          totalBeadCount,
          options: options || downloadOptions,
          activeBeadPalette,
          selectedColorSystem
        });
    };

    // --- Handler to toggle color exclusion ---
    const handleToggleExcludeColor = (hexKey: string) => {
        const currentExcluded = excludedColorKeys;
        const isExcluding = !currentExcluded.has(hexKey);

        if (isExcluding) {
            console.log(`---------\nAttempting to EXCLUDE color: ${hexKey}`);

            // --- 确保初始颜色键已记录 ---
            if (initialGridColorKeys.size === 0) {
                console.error("Cannot exclude color: Initial grid color keys not yet calculated.");
                alert("无法排除颜色，初始颜色数据尚未准备好，请稍候。");
                return;
            }
            console.log("Initial Grid Hex Keys:", Array.from(initialGridColorKeys));
            console.log("Currently Excluded Hex Keys (before this op):", Array.from(currentExcluded));

            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.add(hexKey);

            // --- 使用初始颜色键进行重映射目标逻辑 ---
            // 1. 从初始网格颜色集合开始（hex值）
            const potentialRemapHexKeys = new Set(initialGridColorKeys);
            console.log("Step 1: Potential Hex Keys (from initial):", Array.from(potentialRemapHexKeys));

            // 2. 移除当前要排除的hex键
            potentialRemapHexKeys.delete(hexKey);
            console.log(`Step 2: Potential Hex Keys (after removing ${hexKey}):`, Array.from(potentialRemapHexKeys));

            // 3. 移除任何*其他*当前也被排除的hex键
            currentExcluded.forEach(excludedHexKey => {
                potentialRemapHexKeys.delete(excludedHexKey);
            });
            console.log("Step 3: Potential Hex Keys (after removing other current exclusions):", Array.from(potentialRemapHexKeys));

            // 4. 基于剩余的hex值创建重映射调色板
            const remapTargetPalette = catalogPalette.filter(color => potentialRemapHexKeys.has(color.hex.toUpperCase()));
            const remapTargetHexKeys = remapTargetPalette.map(p => p.hex.toUpperCase());
            console.log("Step 4: Remap Target Palette Hex Keys:", remapTargetHexKeys);

            // 5. *** 关键检查 ***：如果在考虑所有排除项后，没有*初始*颜色可供映射，则阻止此次排除
            if (remapTargetPalette.length === 0) {
                console.warn(`Cannot exclude color '${hexKey}'. No other valid colors from the initial grid remain after considering all current exclusions.`);
                alert(`无法排除颜色 ${hexKey}，因为图中最初存在的其他可用颜色也已被排除。请先恢复部分其他颜色。`);
                console.log("---------");
                return; // 停止排除过程
            }
            console.log(`Remapping target palette (based on initial grid colors minus all exclusions) contains ${remapTargetPalette.length} colors.`);

            // 查找被排除颜色的RGB值用于重映射
            const excludedColorData = catalogPalette.find(p => p.hex.toUpperCase() === hexKey);
            // 检查排除颜色的数据是否存在
             if (!excludedColorData || !mappedPixelData || !gridDimensions) {
                 console.error("Cannot exclude color: Missing data for remapping.");
                 alert("无法排除颜色，缺少必要数据。");
                console.log("---------");
                 return;
             }

            console.log(`Remapping cells currently using excluded color: ${hexKey}`);
            // 仅在需要重映射时创建深拷贝
            const newMappedData = mappedPixelData.map(row => row.map(cell => ({...cell})));
            let remappedCount = 0;
            const { N, M } = gridDimensions;
            let firstReplacementHex: string | null = null;

            for (let j = 0; j < M; j++) {
                for (let i = 0; i < N; i++) {
                const cell = newMappedData[j]?.[i];
                    // 此条件正确地仅针对具有排除hex值的单元格
                    if (cell && !cell.isExternal && cell.color.toUpperCase() === hexKey) {
                        // *** 使用派生的 remapTargetPalette 查找最接近的颜色 ***
                    const replacementColor = findClosestPaletteColor(excludedColorData.rgb, remapTargetPalette);
                        if (!firstReplacementHex) firstReplacementHex = replacementColor.hex;
                        newMappedData[j][i] = { 
                            ...cell, 
                            key: replacementColor.key, 
                            color: replacementColor.hex 
                        };
                    remappedCount++;
                }
                }
            }
            console.log(`Remapped ${remappedCount} cells. First replacement hex found was: ${firstReplacementHex || 'N/A'}`);

            // 同时更新状态
            setExcludedColorKeys(nextExcludedKeys); // 应用此颜色的排除
            setMappedPixelData(newMappedData); // 使用重映射的数据更新

            // 基于*新*映射数据重新计算计数（以hex为键）
            const newCounts: { [hexKey: string]: { count: number; color: string } } = {};
            let newTotalCount = 0;
            newMappedData.flat().forEach(cell => {
                if (cell && cell.color && !cell.isExternal) {
                    const cellHex = cell.color.toUpperCase();
                    if (!newCounts[cellHex]) {
                        newCounts[cellHex] = { count: 0, color: cellHex };
                }
                    newCounts[cellHex].count++;
                    newTotalCount++;
                }
            });
            setColorCounts(newCounts);
            setTotalBeadCount(newTotalCount);
            console.log("State updated after exclusion and local remap based on initial grid colors.");
            console.log("---------");

            // ++ 在更新状态后，重新绘制 Canvas ++
            if (pixelatedCanvasRef.current && gridDimensions) {
              setMappedPixelData(newMappedData);
              // 不要调用 setGridDimensions，因为颜色排除不需要改变网格尺寸
            } else {
               console.error("Canvas ref or grid dimensions missing, skipping draw call in handleToggleExcludeColor.");
            }

        } else {
            // --- Re-including ---
            console.log(`---------\nAttempting to RE-INCLUDE color: ${hexKey}`);
            console.log(`Re-including color: ${hexKey}. Triggering full remap.`);
            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.delete(hexKey);
            setExcludedColorKeys(nextExcludedKeys);
            // 此处无需重置 initialGridColorKeys，完全重映射会通过 pixelateImage 重新计算它
            setRemapTrigger(prev => prev + 1); // *** KEPT setRemapTrigger here for re-inclusion ***
            console.log("---------");
        }
        // ++ Exit manual mode if colors are excluded/included ++
        setIsManualColoringMode(false);
        setSelectedColor(null);
        clearEditHistory();
        setBgRemovalSnapshot(null);
    };

    const handleExcludeByCountThreshold = () => {
      const threshold = parseInt(speckCountThreshold, 10);
      if (Number.isNaN(threshold) || threshold < 0) {
        alert('请输入有效的颗数阈值（大于等于 0 的整数）。');
        return;
      }
      if (!colorCounts || !mappedPixelData || !gridDimensions) {
        alert('请先生成图纸后再筛选杂色。');
        return;
      }
      if (initialGridColorKeys.size === 0) {
        alert('无法筛选：初始颜色数据尚未准备好，请稍候。');
        return;
      }

      const toExclude = Object.keys(colorCounts).filter((hexKey) => {
        return !excludedColorKeys.has(hexKey) && colorCounts[hexKey].count <= threshold;
      });
      if (toExclude.length === 0) {
        showToast(`没有颗数 ≤ ${threshold} 的色号`);
        return;
      }

      const nextExcludedKeys = new Set(excludedColorKeys);
      toExclude.forEach((hexKey) => nextExcludedKeys.add(hexKey));

      const potentialRemapHexKeys = new Set(initialGridColorKeys);
      nextExcludedKeys.forEach((hexKey) => potentialRemapHexKeys.delete(hexKey));
      const remapTargetPalette = catalogPalette.filter((color) =>
        potentialRemapHexKeys.has(color.hex.toUpperCase())
      );
      if (remapTargetPalette.length === 0) {
        alert('无法按阈值排除：剩余可用色号不足。请降低阈值或先恢复部分颜色。');
        return;
      }

      const replacementByHex = new Map<string, PaletteColor>();
      for (const hexKey of toExclude) {
        const excludedColorData = catalogPalette.find(
          (p) => p.hex.toUpperCase() === hexKey.toUpperCase()
        );
        if (!excludedColorData) continue;
        replacementByHex.set(
          hexKey.toUpperCase(),
          findClosestPaletteColor(excludedColorData.rgb, remapTargetPalette)
        );
      }

      const newMappedData = mappedPixelData.map((row) => row.map((cell) => ({ ...cell })));
      const { N, M } = gridDimensions;
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
          const cell = newMappedData[j]?.[i];
          if (!cell || cell.isExternal) continue;
          const replacement = replacementByHex.get(cell.color.toUpperCase());
          if (!replacement) continue;
          newMappedData[j][i] = {
            ...cell,
            key: replacement.key,
            color: replacement.hex,
          };
        }
      }

      const newCounts: { [hexKey: string]: { count: number; color: string } } = {};
      let newTotalCount = 0;
      newMappedData.flat().forEach((cell) => {
        if (cell && cell.color && !cell.isExternal) {
          const cellHex = cell.color.toUpperCase();
          if (!newCounts[cellHex]) {
            newCounts[cellHex] = { count: 0, color: cellHex };
          }
          newCounts[cellHex].count++;
          newTotalCount++;
        }
      });

      setExcludedColorKeys(nextExcludedKeys);
      setMappedPixelData(newMappedData);
      setColorCounts(newCounts);
      setTotalBeadCount(newTotalCount);
      setIsManualColoringMode(false);
      setSelectedColor(null);
      clearEditHistory();
      setBgRemovalSnapshot(null);
      showToast(`已排除 ${toExclude.length} 个色号（颗数 ≤ ${threshold}）`);
    };

  // 一键去背景：识别边缘主色并洪水填充去除
  const handleAutoRemoveBackground = () => {
    if (!mappedPixelData || !gridDimensions) {
      alert('请先生成图纸后再使用一键去背景。');
      return;
    }

    const { data: newPixelData, removed } = removeEdgeConnectedBackground(mappedPixelData);
    if (removed === 0) {
      alert('边缘没有可识别的背景颜色。');
      return;
    }

    // 保存快照用于单步撤回
    setBgRemovalSnapshot({
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: colorCounts ? { ...colorCounts } : {},
      totalBeadCount,
    });
    // 去背景会大幅改变数据，清空编辑撤回历史
    setEditHistory([]);

    setMappedPixelData(newPixelData);

    const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
    let newTotalCount = 0;
    newPixelData.flat().forEach(cell => {
      if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
        const cellHex = cell.color.toUpperCase();
        if (!newColorCounts[cellHex]) {
          newColorCounts[cellHex] = {
            count: 0,
            color: cellHex
          };
        }
        newColorCounts[cellHex].count++;
        newTotalCount++;
      }
    });

    setColorCounts(newColorCounts);
    setTotalBeadCount(newTotalCount);
    setInitialGridColorKeys(new Set(Object.keys(newColorCounts)));
  };

  // --- Tooltip Logic ---

  // --- Canvas Interaction ---

  // 洪水填充擦除函数
  const floodFillErase = (startRow: number, startCol: number, targetKey: string) => {
    if (!mappedPixelData || !gridDimensions) return;
    if (!cellMatchesIsolate(mappedPixelData[startRow]?.[startCol])) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    
    // 使用栈实现非递归洪水填充
    const stack = [{ row: startRow, col: startCol }];
    
    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      
      // 检查边界
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        continue;
      }
      
      const currentCell = newPixelData[row][col];
      
      // 检查是否是目标颜色且不是外部区域
      if (!currentCell || currentCell.isExternal || currentCell.key !== targetKey) {
        continue;
      }
      
      // 标记为已访问
      visited[row][col] = true;
      
      // 擦除当前像素（设为透明）
      newPixelData[row][col] = { ...transparentColorData };
      
      // 添加相邻像素到栈中
      stack.push(
        { row: row - 1, col }, // 上
        { row: row + 1, col }, // 下
        { row, col: col - 1 }, // 左
        { row, col: col + 1 }  // 右
      );
    }
    
    // 更新状态
    saveEditSnapshot();
    setMappedPixelData(newPixelData);

    // 重新计算颜色统计
    if (colorCounts) {
      const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
      let newTotalCount = 0;
      
      newPixelData.flat().forEach(cell => {
        if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
          const cellHex = cell.color.toUpperCase();
          if (!newColorCounts[cellHex]) {
            newColorCounts[cellHex] = {
              count: 0,
              color: cellHex
            };
          }
          newColorCounts[cellHex].count++;
          newTotalCount++;
        }
      });
      
      setColorCounts(newColorCounts);
      setTotalBeadCount(newTotalCount);
    }
  };

  // ++ Re-introduce the combined interaction handler ++
  const handleCanvasInteraction = (
    clientX: number, 
    clientY: number, 
    pageX: number, 
    pageY: number, 
    isClick: boolean = false,
    isTouchEnd: boolean = false
  ) => {
    // 如果是触摸结束或鼠标离开事件，隐藏提示
    if (isTouchEnd) {
      setTooltipData(null);
      return;
    }

    const canvas = pixelatedCanvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions) {
      setTooltipData(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const { N, M } = gridDimensions;
    const cellWidthOutput = canvas.width / N;
    const cellHeightOutput = canvas.height / M;

    const i = Math.floor(canvasX / cellWidthOutput);
    const j = Math.floor(canvasY / cellHeightOutput);

    if (i >= 0 && i < N && j >= 0 && j < M) {
      const cellData = mappedPixelData[j][i];

      // 颜色替换模式逻辑 - 选择源颜色
      if (isClick && colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 执行选择源颜色
          handleCanvasColorSelect({
            key: cellData.key,
            color: cellData.color
          });
          setTooltipData(null);
        }
        return;
      }

      // 一键擦除模式逻辑
      if (isClick && isEraseMode) {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 执行洪水填充擦除
          floodFillErase(j, i, cellData.key);
          setIsEraseMode(false); // 擦除完成后退出擦除模式
          setTooltipData(null);
        }
        return;
      }

      if (isClick && isSelectMode) {
        return;
      }

      // Manual Coloring Logic - 保持原有的上色逻辑
      if (isClick && isManualColoringMode && selectedColor) {
        // 手动上色模式逻辑保持不变
        // ...现有代码...
        const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
        const currentCell = newPixelData[j]?.[i];

        if (!currentCell) return;
        if (!cellMatchesIsolate(currentCell)) return;

        const previousKey = currentCell.key;
        const wasExternal = currentCell.isExternal;
        
        let newCellData: MappedPixel;
        
        if (selectedColor.key === TRANSPARENT_KEY) {
          newCellData = { ...transparentColorData };
        } else {
          newCellData = { ...selectedColor, isExternal: false };
        }

        // Only update if state changes
        if (newCellData.key !== previousKey || newCellData.isExternal !== wasExternal) {
          saveEditSnapshot();
          newPixelData[j][i] = newCellData;
          setMappedPixelData(newPixelData);

          // Update color counts
          if (colorCounts) {
            const newColorCounts = { ...colorCounts };
            let newTotalCount = totalBeadCount;

            // 处理之前颜色的减少（使用hex值）
            if (!wasExternal && previousKey !== TRANSPARENT_KEY) {
              const previousCell = mappedPixelData[j][i];
              const previousHex = previousCell?.color?.toUpperCase();
              if (previousHex && newColorCounts[previousHex]) {
                newColorCounts[previousHex].count--;
                if (newColorCounts[previousHex].count <= 0) {
                  delete newColorCounts[previousHex];
              }
              newTotalCount--;
              }
            }

            // 处理新颜色的增加（使用hex值）
            if (!newCellData.isExternal && newCellData.key !== TRANSPARENT_KEY) {
              const newHex = newCellData.color.toUpperCase();
              if (!newColorCounts[newHex]) {
                newColorCounts[newHex] = {
                  count: 0,
                  color: newHex
                };
              }
              newColorCounts[newHex].count++;
              newTotalCount++;
            }

            setColorCounts(newColorCounts);
            setTotalBeadCount(newTotalCount);
          }
        }
        
      }
      // Tooltip：编辑模式悬停也显示色号；非编辑模式保持点击切换
      if (!isClick || !isManualColoringMode) {
        // 只有单元格实际有内容（非背景/外部区域）才会显示提示
        if (cellData && !cellData.isExternal && cellData.key) {
          // 检查是否已经显示了提示框，并且是否点击的是同一个位置
          // 对于移动设备，位置可能有细微偏差，所以我们检查单元格索引而不是具体坐标
          if (tooltipData) {
            // 如果已经有提示框，计算当前提示框对应的格子的索引
            const tooltipRect = canvas.getBoundingClientRect();
            
            // 还原提示框位置为相对于canvas的坐标
            const prevX = tooltipData.x; // 页面X坐标
            const prevY = tooltipData.y; // 页面Y坐标
            
            // 转换为相对于canvas的坐标
            const prevCanvasX = (prevX - tooltipRect.left) * scaleX;
            const prevCanvasY = (prevY - tooltipRect.top) * scaleY;
            
            // 计算之前显示提示框位置对应的网格索引
            const prevCellI = Math.floor(prevCanvasX / cellWidthOutput);
            const prevCellJ = Math.floor(prevCanvasY / cellHeightOutput);
            
            // 非编辑模式点击同一格才切换隐藏；编辑模式悬停持续显示
            if (isClick && i === prevCellI && j === prevCellJ) {
              setTooltipData(null);
              return;
            }
          }
          
          // 计算相对于main元素的位置
          const mainElement = mainRef.current;
          if (mainElement) {
            const mainRect = mainElement.getBoundingClientRect();
            // 计算相对于main元素的坐标
            const relativeX = pageX - mainRect.left - window.scrollX;
            const relativeY = pageY - mainRect.top - window.scrollY;
            
            // 如果是移动/悬停到一个新的有效格子，或者点击了不同的格子，则显示提示
            setTooltipData({
              x: relativeX,
              y: relativeY,
              key: cellData.key,
              color: cellData.color,
            });
          } else {
            // 如果没有找到main元素，使用原始坐标
            setTooltipData({
              x: pageX,
              y: pageY,
              key: cellData.key,
              color: cellData.color,
            });
          }
        } else {
          // 如果点击/悬停在外部区域或背景上，隐藏提示
          setTooltipData(null);
        }
      }
    } else {
      // 如果点击/悬停在画布外部，隐藏提示
      setTooltipData(null);
    }
  };

  // 处理自定义色板中单个颜色的选择变化
  const handleSelectionChange = (hexValue: string, isSelected: boolean) => {
    const normalizedHex = hexValue.toUpperCase();
    setCustomPaletteSelections(prev => ({
      ...prev,
      [normalizedHex]: isSelected
    }));
    setIsCustomPalette(true);
  };

  // 保存自定义色板并应用
  const handleSaveCustomPalette = () => {
    savePaletteSelections(customPaletteSelections);
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    // 触发图像重新处理
    setRemapTrigger(prev => prev + 1);
    // 退出手动上色模式
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  // ++ 新增：导出自定义色板配置 ++
  const handleExportCustomPalette = () => {
    const selectedHexValues = Object.entries(customPaletteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([hexValue]) => hexValue);

    if (selectedHexValues.length === 0) {
      alert("当前没有选中的颜色，无法导出。");
      return;
    }

    // 导出格式：仅基于hex值
    const exportData = {
      version: "3.0", // 新版本号
      selectedHexValues: selectedHexValues,
      exportDate: new Date().toISOString(),
      totalColors: selectedHexValues.length
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom-perler-palette.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ++ 新增：处理导入的色板文件 ++
  const handleImportPaletteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 检查文件格式
        if (!Array.isArray(data.selectedHexValues)) {
          throw new Error("无效的文件格式：文件必须包含 'selectedHexValues' 数组。");
        }

        console.log("检测到基于hex值的色板文件");

        const importedHexValues = data.selectedHexValues as string[];
        const validHexValues: string[] = [];
        const invalidHexValues: string[] = [];

        // 验证hex值
        importedHexValues.forEach(hex => {
          const normalizedHex = hex.toUpperCase();
          const colorData = catalogPalette.find(color => color.hex.toUpperCase() === normalizedHex);
          if (colorData) {
            validHexValues.push(normalizedHex);
          } else {
            invalidHexValues.push(hex);
          }
        });

        if (invalidHexValues.length > 0) {
          console.warn("导入时发现无效的hex值:", invalidHexValues);
          alert(`导入完成，但以下颜色无效已被忽略：\n${invalidHexValues.join(', ')}`);
        }

        if (validHexValues.length === 0) {
          alert("导入的文件中不包含任何有效的颜色。");
          return;
        }

        console.log(`成功验证 ${validHexValues.length} 个有效的hex值`);

        // 基于有效的hex值创建新的selections对象
        const allHexValues = catalogPalette.map(color => color.hex.toUpperCase());
        const newSelections = presetToSelections(allHexValues, validHexValues);
        setCustomPaletteSelections(newSelections);
        setIsCustomPalette(true); // 标记为自定义
        alert(`成功导入 ${validHexValues.length} 个颜色！`);

      } catch (error) {
        console.error("导入色板配置失败:", error);
        alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        // 重置文件输入，以便可以再次导入相同的文件
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.onerror = () => {
      alert("读取文件失败。");
       // 重置文件输入
      if (event.target) {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ++ 新增：触发导入文件选择 ++
  const triggerImportPalette = () => {
    importPaletteInputRef.current?.click();
  };

  // 新增：处理颜色高亮
  const handleHighlightColor = (colorHex: string) => {
    setHighlightColorKey(colorHex);
  };

  // 新增：高亮完成回调
  const handleHighlightComplete = () => {
    setHighlightColorKey(null);
  };

  // 新增：切换完整色板显示
  const handleToggleFullPalette = () => {
    setShowFullPalette(!showFullPalette);
  };

  const commitMappedPixelData = (next: MappedPixel[][]) => {
    saveEditSnapshot();
    setMappedPixelData(next);
    const stats = recalculateColorStats(next);
    setColorCounts(stats.colorCounts);
    setTotalBeadCount(stats.totalCount);
  };

  const handlePickBoardColorToggle = () => {
    if (isPickingBoardColor) {
      setIsPickingBoardColor(false);
      return;
    }
    setIsEraseMode(false);
    setColorReplaceState({ isActive: false, step: 'select-source' });
    setSelectedColor(null);
    setIsSelectMode(false);
    setMarqueeRect(null);
    setSelectionMenuPos(null);
    setSelectionPending(null);
    setIsPickingBoardColor(true);
  };

  const handleSelectModeToggle = () => {
    if (isSelectMode) {
      setIsSelectMode(false);
      setMarqueeRect(null);
      setSelectionMenuPos(null);
      setSelectionPending(null);
      return;
    }
    setIsEraseMode(false);
    setColorReplaceState({ isActive: false, step: 'select-source' });
    setSelectedColor(null);
    setHighlightColorKey(null);
    setIsPickingBoardColor(false);
    setIsSelectMode(true);
    setMarqueeRect(null);
    setSelectionMenuPos(null);
    setSelectionPending(null);
  };

  const handleMarqueeComplete = (rect: GridRect, clientX: number, clientY: number) => {
    setMarqueeRect(rect);
    setSelectionPending(null);
    setSelectionMenuPos({ x: clientX, y: clientY });
  };

  const handleSelectionContextMenu = (clientX: number, clientY: number) => {
    if (!marqueeRect) return;
    setSelectionMenuPos({ x: clientX, y: clientY });
  };

  const handleSelectionClear = () => {
    if (!mappedPixelData || !marqueeRect) return;
    const { next, changed } = applySelectionClear(mappedPixelData, marqueeRect);
    if (changed) commitMappedPixelData(next);
    setSelectionMenuPos(null);
    setSelectionPending(null);
  };

  const handleSelectionFillWait = () => {
    if (!mappedPixelData || !marqueeRect) return;
    if (!selectedColor || selectedColor.key === TRANSPARENT_KEY) {
      showToast('请先选择画笔颜色');
      return;
    }
    const { next, changed } = applySelectionFill(mappedPixelData, marqueeRect, selectedColor);
    if (changed) commitMappedPixelData(next);
    setSelectionMenuPos(null);
    setSelectionPending(null);
  };

  const handleSelectionReplaceSource = (source: { key: string; color: string }) => {
    setSelectionPending({ kind: 'replace', source });
    setHighlightColorKey(source.color);
    setSelectionMenuPos(null);
  };

  const applySelectionColor = (colorData: { key: string; color: string }) => {
    if (!mappedPixelData || !marqueeRect || !selectionPending) return false;
    if (colorData.key === TRANSPARENT_KEY) return false;
    if (selectionPending.kind !== 'replace') return false;
    const { next, changed } = applySelectionReplace(
      mappedPixelData,
      marqueeRect,
      selectionPending.source,
      colorData
    );
    if (changed) commitMappedPixelData(next);
    setHighlightColorKey(null);
    setSelectionPending(null);
    return true;
  };

  const selectionColorStats = useMemo(() => {
    if (!mappedPixelData || !marqueeRect) return [];
    return collectSelectionColorStats(mappedPixelData, marqueeRect);
  }, [mappedPixelData, marqueeRect]);

  const selectionHint =
    selectionPending?.kind === 'replace'
      ? '在色区2或色区3选择替换成的颜色'
      : marqueeRect
        ? '右键选区打开菜单：清空 / 填充 / 替换'
        : null;

  // 新增：处理颜色选择，同时管理模式切换
  const handleColorSelect = (colorData: { key: string; color: string; isExternal?: boolean }) => {
    if (isSelectMode && selectionPending && applySelectionColor(colorData)) {
      return;
    }
    // 如果选择的是橡皮擦（透明色）且当前在颜色替换模式，退出替换模式
    if (colorData.key === TRANSPARENT_KEY && colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    // 选择任何颜色（包括橡皮擦）时，都应该退出一键擦除模式
    if (isEraseMode) {
      setIsEraseMode(false);
    }
    
    // 设置选中的颜色
    setSelectedColor(colorData);
  };

  // 新增：颜色替换相关处理函数
  const handleColorReplaceToggle = () => {
    setColorReplaceState(prev => {
      if (prev.isActive) {
        // 退出替换模式
        return {
          isActive: false,
          step: 'select-source'
        };
      } else {
        // 进入替换模式
        // 只退出冲突的模式，但保持在手动上色模式下
        setIsEraseMode(false);
        setSelectedColor(null);
        setIsSelectMode(false);
        setMarqueeRect(null);
        setSelectionMenuPos(null);
        setSelectionPending(null);
        setIsPickingBoardColor(false);
        return {
          isActive: true,
          step: 'select-source'
        };
      }
    });
  };

  // 新增：处理从画布选择源颜色
  const handleCanvasColorSelect = (colorData: { key: string; color: string }) => {
    if (colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
      // 高亮显示选中的颜色
      setHighlightColorKey(colorData.color);
      // 进入第二步：选择目标颜色
      setColorReplaceState({
        isActive: true,
        step: 'select-target',
        sourceColor: colorData
      });
    }
  };

  // 新增：执行颜色替换
  const handleColorReplace = (sourceColor: { key: string; color: string }, targetColor: { key: string; color: string }) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    let replaceCount = 0;

    // 遍历所有像素，替换匹配的颜色
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const currentCell = newPixelData[j][i];
        if (currentCell && !currentCell.isExternal && 
            currentCell.color.toUpperCase() === sourceColor.color.toUpperCase()) {
          // 替换颜色
          newPixelData[j][i] = {
            key: targetColor.key,
            color: targetColor.color,
            isExternal: false
          };
          replaceCount++;
        }
      }
    }

    if (replaceCount > 0) {
      // 更新像素数据
      saveEditSnapshot();
      setMappedPixelData(newPixelData);

      // 重新计算颜色统计
      if (colorCounts) {
        const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
        let newTotalCount = 0;

        newPixelData.flat().forEach(cell => {
          if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
            const cellHex = cell.color.toUpperCase();
            if (!newColorCounts[cellHex]) {
              newColorCounts[cellHex] = {
                count: 0,
                color: cellHex
              };
            }
            newColorCounts[cellHex].count++;
            newTotalCount++;
          }
        });

        setColorCounts(newColorCounts);
        setTotalBeadCount(newTotalCount);
      }

      console.log(`颜色替换完成：将 ${replaceCount} 个 ${sourceColor.key} 替换为 ${targetColor.key}`);
    }

    // 退出替换模式
    setColorReplaceState({
      isActive: false,
      step: 'select-source'
    });
    
    // 清除高亮
    setHighlightColorKey(null);
  };

  // 生成完整色板数据（用户自定义色板中选中的所有颜色）
  const fullPaletteColors = useMemo(() => {
    const selectedColors: { key: string; color: string }[] = [];
    
    Object.entries(customPaletteSelections).forEach(([hexValue, isSelected]) => {
      if (isSelected) {
        // 根据选择的色号系统获取显示的色号
        const displayKey = getColorKeyByHex(hexValue, selectedColorSystem);
        selectedColors.push({
          key: displayKey,
          color: hexValue
        });
      }
    });
    
    // 使用色相排序而不是色号排序
    return sortColorsByHue(selectedColors);
  }, [customPaletteSelections, selectedColorSystem]);

  return (
    <>
    {/* 添加自定义动画样式 */}
    <style dangerouslySetInnerHTML={{ __html: floatAnimation }} />
    <style dangerouslySetInnerHTML={{ __html: '@keyframes toastFadeInOut{0%{opacity:0;transform:translate(-50%,10px)}15%{opacity:1;transform:translate(-50%,0)}85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}' }} />
    
    {/* PWA 安装按钮 */}
    <InstallPWA />
    
    {/* ++ 修改：添加 onLoad 回调函数 ++ */}
    <Script
      async
      src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"
      strategy="lazyOnload"
      onLoad={() => {
        const basePV = 378536; // ++ 预设 PV 基数 ++
        const baseUV = 257864; // ++ 预设 UV 基数 ++

        const updateCount = (spanId: string, baseValue: number) => {
          const targetNode = document.getElementById(spanId);
          if (!targetNode) return;

          const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
              if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const currentValueText = targetNode.textContent?.trim() || '0';
                if (currentValueText !== '...') {
                  const currentValue = parseInt(currentValueText.replace(/,/g, ''), 10) || 0;
                  targetNode.textContent = (currentValue + baseValue).toLocaleString();
                  observer.disconnect(); // ++ 更新后停止观察 ++ 
                  // console.log(`Updated ${spanId} from ${currentValueText} to ${targetNode.textContent}`);
                  break; // 处理完第一个有效更新即可
                }
              }
            }
          });

          observer.observe(targetNode, { childList: true, characterData: true, subtree: true });

          // ++ 处理初始值已经是数字的情况 (如果脚本加载很快) ++
          const initialValueText = targetNode.textContent?.trim() || '0';
          if (initialValueText !== '...') {
             const initialValue = parseInt(initialValueText.replace(/,/g, ''), 10) || 0;
             targetNode.textContent = (initialValue + baseValue).toLocaleString();
             observer.disconnect(); // 已更新，无需再观察
          }
        };

        updateCount('busuanzi_value_site_pv', basePV);
        updateCount('busuanzi_value_site_uv', baseUV);
      }}
    />

    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-gray-50 to-white pb-14 dark:from-gray-800 dark:to-gray-900 font-[family-name:var(--font-geist-sans)]">
      <header className="sticky top-0 z-30 w-full border-b border-[#3a332c]/25 bg-[#1c1815] text-[#efe8dc]">
        <div className="relative z-10 mx-auto flex h-14 w-full max-w-[1920px] items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid shrink-0 grid-cols-2 gap-0.5 rounded-md bg-white/10 p-1" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-[#e07a5f]"></span>
              <span className="h-2 w-2 rounded-full bg-[#3d7ae8]"></span>
              <span className="h-2 w-2 rounded-full bg-[#d4a24a]"></span>
              <span className="h-2 w-2 rounded-full bg-[#2f9e6f]"></span>
            </div>
            <div className="min-w-0 leading-none">
              <h1 className="text-[22px] font-bold tracking-[0.18em] text-[#d4a24a]">对色局</h1>
              <p className="mt-1 text-[11px] tracking-wide text-[#9a9084]">拼豆底稿</p>
            </div>
          </div>
          <nav className="flex shrink-0 items-center gap-3 text-xs text-[#9a9084]">
            <a href="https://www.xiaohongshu.com/user/profile/623e8b080000000010007721" target="_blank" rel="noopener noreferrer" className="hover:text-[#efe8dc] transition-colors">小红书</a>
            <span className="text-[#3a332c]">·</span>
            <a href="https://github.com/Zippland/perler-beads" target="_blank" rel="noopener noreferrer" className="hover:text-[#efe8dc] transition-colors">GitHub</a>
          </nav>
        </div>
      </header>

      {/* Apply dark mode styles to the main section */}
      <main ref={mainRef} className="relative mx-auto mt-3 flex min-h-0 w-full max-w-[1920px] flex-1 flex-col px-3 sm:px-4">
        <input type="file" accept="image/jpeg, image/png, image/gif, .csv, text/csv, application/csv, text/plain" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
        <input
          type="file"
          accept="image/jpeg, image/png, image/gif, image/webp"
          onChange={handleReplaceOriginalPreview}
          ref={originalPreviewInputRef}
          className="hidden"
        />

        {!originalImageSrc && (
          <div className="mx-auto flex max-w-md flex-col items-center space-y-4">
            <div
              onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={handleDragOver}
              onClick={isMounted ? triggerFileInput : undefined}
              className={`flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-center shadow-sm dark:border-gray-600 ${isMounted ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:border-blue-500 dark:hover:bg-gray-800' : 'cursor-wait'}`}
              style={{ minHeight: '150px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="mb-3 h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">拖放图片到此处，或<span className="font-medium text-blue-600 dark:text-blue-400">点击选择文件</span></p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">支持 JPG, PNG, GIF，或 CSV</p>
            </div>
            <div className="w-full rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 shadow-sm dark:border-gray-600 dark:from-gray-800 dark:to-gray-700">
              <p className="flex items-start text-xs text-indigo-700 dark:text-indigo-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-1.5 mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>小贴士：像素图转换前请让边缘对齐格子线，切割会更准。</span>
              </p>
            </div>
          </div>
        )}

        {originalImageSrc && (
          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(248px,292px)_minmax(0,1fr)_minmax(260px,300px)] lg:items-stretch">
            <aside className="space-y-2 lg:h-full lg:overflow-y-auto">
            <div
              onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={handleDragOver}
              onClick={isMounted ? triggerFileInput : undefined}
              className={`flex w-full flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-white px-2 py-2 text-center dark:border-gray-600 dark:bg-gray-800 ${isMounted ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500' : 'cursor-wait'}`}
            >
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">换图 / 导入 CSV</p>
              <p className="text-[11px] text-gray-400">点击或拖放替换</p>
            </div>
            {!isManualColoringMode && (
              <div className="grid w-full grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <BeadValueSlider
                  label="横轴切割数量"
                  value={granularity}
                  min={10}
                  max={300}
                  accentClass="accent-rose-500"
                  onChange={setGranularity}
                />
                <BeadValueSlider
                  label="颜色合并阈值"
                  value={similarityThreshold}
                  min={0}
                  max={100}
                  accentClass="accent-amber-500"
                  onChange={setSimilarityThreshold}
                />
                <BeadValueSlider
                  label="最大色数"
                  value={maxColorCount}
                  min={1}
                  max={300}
                  accentClass="accent-sky-500"
                  onChange={setMaxColorCount}
                />

                {/* 快捷按钮 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={handleAutoRemoveBackground}
                    disabled={!mappedPixelData || !gridDimensions}
                    className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-800/40"
                  >
                    一键去背景
                  </button>
                  <button
                    onClick={handleUndoBgRemoval}
                    disabled={!bgRemovalSnapshot}
                    className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-2.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    回撤上一步
                  </button>
                  <span className="ml-auto inline-flex h-8 items-center whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {gridDimensions
                      ? `${gridDimensions.N} × ${gridDimensions.M} 格`
                      : '尺寸 —'}
                  </span>
                </div>

                {pixelationMode !== PixelationMode.Average && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">中心色判定</p>
                      <p className="text-[11px] leading-snug text-gray-400 dark:text-gray-500">
                        关=主色；开=按占比用中心色或主色
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={useCenterColorShare}
                      onClick={() => setUseCenterColorShare((prev) => !prev)}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${useCenterColorShare ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-[left] ${useCenterColorShare ? 'left-[18px]' : 'left-0.5'}`}
                      />
                    </button>
                  </div>
                  {useCenterColorShare && (
                    <BeadValueSlider
                      label="中心色占比阈值 %"
                      value={centerColorMinSharePercent}
                      min={0}
                      max={20}
                      step={0.5}
                      accentClass="accent-blue-500"
                      onChange={setCenterColorMinSharePercent}
                    />
                  )}
                </div>
                )}

                {/* Pixelation Mode Selector */}
                <div>
                  <label htmlFor="pixelationModeSelect" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">处理模式</label>
                  <div className="flex items-center gap-2">
                    <select
                      id="pixelationModeSelect"
                      value={pixelationMode}
                      onChange={handlePixelationModeChange}
                      className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    >
                      <option value={PixelationMode.Dominant} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">卡通 (主色)</option>
                      <option value={PixelationMode.Average} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">真实 (平均)</option>
                      <option value={PixelationMode.Perceptual} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">感知色差 (image-q)</option>
                    </select>
                  </div>
                </div>

                {/* 色号系统选择器 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">色号系统</label>
                  <div className="flex flex-wrap gap-1.5">
                    {colorSystemOptions.map(option => (
                      <button
                        key={option.key}
                        onClick={() => setSelectedColorSystem(option.key as ColorSystem)}
                        className={`shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          selectedColorSystem === option.key
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setIsCustomPaletteEditorOpen(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-2 text-sm font-medium text-white hover:from-blue-600 hover:to-purple-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
                    </svg>
                    管理色板 ({Object.values(customPaletteSelections).filter(Boolean).length})
                  </button>
                  {isCustomPalette && (
                    <p className="mt-0.5 text-center text-[10px] text-blue-500 dark:text-blue-400">当前使用自定义色板</p>
                  )}
                </div>
              </div>
            )}

            {isManualColoringMode && mappedPixelData && gridDimensions && (
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <EditBrushStrip
                  colors={patternColors}
                  selectedColorSystem={selectedColorSystem}
                  selectedColor={selectedColor}
                  onBrushSelect={(colorData) => {
                    if (isPickingBoardColor) return;
                    if (isSelectMode && selectionPending && applySelectionColor(colorData)) {
                      return;
                    }
                    if (colorReplaceState.isActive) {
                      if (colorReplaceState.step === 'select-source') {
                        handleCanvasColorSelect(colorData);
                        return;
                      }
                      if (colorReplaceState.step === 'select-target' && colorReplaceState.sourceColor) {
                        handleColorReplace(colorReplaceState.sourceColor, colorData);
                        return;
                      }
                    }
                    handleColorSelect(colorData);
                  }}
                  isEraseMode={isEraseMode}
                  onEraseToggle={handleEraseToggle}
                  colorReplaceState={colorReplaceState}
                  onColorReplaceToggle={handleColorReplaceToggle}
                  canUndo={editHistory.length > 0}
                  onUndo={handleUndoEdit}
                  onPickEraser={() =>
                    handleColorSelect({ key: TRANSPARENT_KEY, color: '#FFFFFF' })
                  }
                  onMirrorHorizontal={() => handleMirrorPattern('horizontal')}
                  onMirrorVertical={() => handleMirrorPattern('vertical')}
                  libraryColors={activeBeadPalette}
                  isSelectMode={isSelectMode}
                  onSelectModeToggle={handleSelectModeToggle}
                  selectionHint={selectionHint}
                  onLibrarySelect={(colorData) => {
                    if (isPickingBoardColor) {
                      setBoardBackgroundHex(colorData.color.toUpperCase());
                      setIsPickingBoardColor(false);
                      return;
                    }
                    if (isSelectMode && selectionPending && applySelectionColor(colorData)) {
                      return;
                    }
                    if (colorReplaceState.isActive) {
                      if (colorReplaceState.step === 'select-source') {
                        handleCanvasColorSelect(colorData);
                        return;
                      }
                      if (colorReplaceState.step === 'select-target' && colorReplaceState.sourceColor) {
                        handleColorReplace(colorReplaceState.sourceColor, colorData);
                        return;
                      }
                    }
                    handleColorSelect(colorData);
                  }}
                  isPickingBoardColor={isPickingBoardColor}
                  onPickBoardColorToggle={handlePickBoardColorToggle}
                  boardBackgroundColor={boardBackgroundHex}
                />
              </div>
            )}

            {!isManualColoringMode && mappedPixelData && gridDimensions && (
              <button
                onClick={() => {
                  setIsManualColoringMode(true);
                  setSelectedColor(null);
                  setTooltipData(null);
                  setIsolateLockedHex(null);
                  setIsolateHoverHex(null);
                  setIsFloatingPaletteOpen(false);
                }}
                className="flex w-full items-center justify-center rounded-md bg-blue-600 py-2 text-sm text-white hover:bg-blue-700"
              >
                进入手动编辑
              </button>
            )}
            {isManualColoringMode && (
              <button
                onClick={() => {
                  setIsManualColoringMode(false);
                  setSelectedColor(null);
                  setTooltipData(null);
                  setIsEraseMode(false);
                  setColorReplaceState({ isActive: false, step: 'select-source' });
                  setHighlightColorKey(null);
                  setIsolateLockedHex(null);
                  setIsolateHoverHex(null);
                  setIsMagnifierActive(false);
                  setMagnifierSelectionArea(null);
                  setIsSelectMode(false);
                  setMarqueeRect(null);
                  setSelectionMenuPos(null);
                  setSelectionPending(null);
                  setIsPickingBoardColor(false);
                  clearEditHistory();
                }}
                className="flex w-full items-center justify-center rounded-md bg-gray-700 py-2 text-sm text-white hover:bg-gray-800"
              >
                退出编辑
              </button>
            )}
            </aside>

            <canvas ref={originalCanvasRef} className="hidden"></canvas>

            <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-gray-100 bg-white p-3 shadow-md dark:border-gray-700 dark:bg-gray-800 lg:h-full">
                {gridDimensions && gridDimensions.N > 100 && (
                  <div className="mb-2 shrink-0 rounded-lg border border-blue-200 bg-blue-50 p-2 text-center text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    高精度网格 ({gridDimensions.N}×{gridDimensions.M}) — 可滚动、缩放查看
                  </div>
                )}
                <div
                  className={`grid min-h-0 flex-1 gap-2 ${
                    isManualColoringMode
                      ? 'grid-cols-[minmax(0,1fr)_minmax(120px,26%)] grid-rows-2'
                      : 'grid-cols-2 grid-rows-2'
                  }`}
                >
                  <div
                    className={`flex h-full min-h-0 min-w-0 flex-col ${
                      isManualColoringMode ? 'col-start-2 row-start-1' : ''
                    }`}
                  >
                    <p className="mb-1 flex shrink-0 items-center justify-center gap-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                      原图
                      {isManualColoringMode && (
                        <button
                          type="button"
                          onClick={() => originalPreviewInputRef.current?.click()}
                          className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-normal text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        >
                          更换
                        </button>
                      )}
                    </p>
                    <ZoomPanViewport
                      fitKey={`orig-${originalPreviewSrc || originalImageSrc}-${isManualColoringMode}`}
                      className="min-h-0 w-full flex-1 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-700"
                    >
                      {(originalPreviewSrc || originalImageSrc) && (
                        <img
                          src={originalPreviewSrc || originalImageSrc || ''}
                          alt="原图"
                          className="block max-w-none rounded border border-gray-300 dark:border-gray-600"
                          draggable={false}
                        />
                      )}
                    </ZoomPanViewport>
                  </div>
                  <div className={`${isManualColoringMode ? 'hidden' : 'flex h-full min-h-0 min-w-0 flex-col'}`}>
                    <p className="mb-1 shrink-0 text-center text-xs font-medium text-gray-500 dark:text-gray-400">抗锯齿</p>
                    <ZoomPanViewport
                      fitKey={`aa-${originalImageSrc}-${gridDimensions?.N}x${gridDimensions?.M}-${remapTrigger}`}
                      className="min-h-0 w-full flex-1 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-700"
                    >
                      <canvas
                        ref={collapsedCanvasRef}
                        className="block max-w-none rounded border border-gray-300 dark:border-gray-600"
                      />
                    </ZoomPanViewport>
                  </div>
                  <div
                    className={`flex h-full min-h-0 min-w-0 flex-col ${
                      isManualColoringMode ? 'col-start-1 row-span-2 row-start-1' : ''
                    }`}
                  >
                    <p className="mb-1 shrink-0 text-center text-xs font-medium text-gray-500 dark:text-gray-400">拼豆</p>
                    <ZoomPanViewport
                      allowLeftPan={!isManualColoringMode}
                      allowRightPan={!isSelectMode}
                      fitKey={`bead-${gridDimensions?.N}x${gridDimensions?.M}-${remapTrigger}-${isManualColoringMode}`}
                      className="min-h-0 w-full flex-1 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-700"
                    >
                      <PixelatedPreviewCanvas
                        canvasRef={pixelatedCanvasRef}
                        mappedPixelData={mappedPixelData}
                        gridDimensions={gridDimensions}
                        isManualColoringMode={isManualColoringMode}
                        onInteraction={handleCanvasInteraction}
                        highlightColorKey={highlightColorKey}
                        onHighlightComplete={handleHighlightComplete}
                        isolateColorKey={isManualColoringMode ? isolateColorKey : null}
                        selectionMode={isSelectMode}
                        selectionRect={marqueeRect}
                        onMarqueeComplete={handleMarqueeComplete}
                        onSelectionContextMenu={handleSelectionContextMenu}
                        boardBackgroundColor={boardBackgroundHex}
                      />
                    </ZoomPanViewport>
                  </div>
                  <div
                    className={`flex h-full min-h-0 min-w-0 flex-col ${
                      isManualColoringMode ? 'col-start-2 row-start-2' : ''
                    }`}
                  >
                    <p className="mb-1 shrink-0 text-center text-xs font-medium text-gray-500 dark:text-gray-400">效果</p>
                    <ZoomPanViewport
                      fitKey={`fx-${gridDimensions?.N}x${gridDimensions?.M}-${remapTrigger}-${isManualColoringMode}`}
                      className="min-h-0 w-full flex-1 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-700"
                    >
                      <PixelatedPreviewCanvas
                        canvasRef={effectCanvasRef}
                        mappedPixelData={mappedPixelData}
                        gridDimensions={gridDimensions}
                        isManualColoringMode={false}
                        interactive={false}
                        showGrid={false}
                        transparentExternal
                        onInteraction={() => {}}
                        highlightColorKey={highlightColorKey}
                      />
                    </ZoomPanViewport>
                  </div>
                </div>
            </section>

            <aside className="space-y-3 lg:h-full lg:overflow-y-auto">
        {isManualColoringMode && (
          <div className="rounded-lg border border-gray-100 bg-white p-3 shadow dark:border-gray-700 dark:bg-gray-800">
            <EditColorInventory
              colors={patternColors}
              selectedColorSystem={selectedColorSystem}
              isolateLockedHex={isolateLockedHex}
              isolatePreviewHex={isolateColorKey}
              onIsolateHover={(hex) => {
                if (isolateLockedHex) return;
                setIsolateHoverHex(hex);
              }}
              onIsolateToggle={(hex) => {
                if (isolateLockedHex === hex) {
                  setIsolateLockedHex(null);
                  setIsolateHoverHex(null);
                } else {
                  setIsolateLockedHex(hex);
                  setIsolateHoverHex(hex);
                }
              }}
            />
          </div>
        )}
        {!isManualColoringMode && colorCounts && Object.keys(colorCounts).length > 0 && (
          <div className="color-stats-panel rounded-lg border border-gray-100 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
            {/* Title color */}
            <h3 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200 text-center">
              去除杂色 
            </h3>
            {/* Subtitle color */}
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">点击下方列表中的颜色可将其从可用列表中排除。总计: {totalBeadCount} 颗</p>
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <label htmlFor="speckCountThreshold" className="text-xs text-gray-600 dark:text-gray-300">
                颗数阈值
              </label>
              <input
                id="speckCountThreshold"
                type="number"
                min="0"
                value={speckCountThreshold}
                onChange={(e) => setSpeckCountThreshold(e.target.value)}
                className="h-8 w-20 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              />
              <button
                type="button"
                onClick={handleExcludeByCountThreshold}
                className="h-8 rounded-md bg-blue-500 px-3 text-sm text-white shadow-sm transition-colors hover:bg-blue-600"
              >
                确认
              </button>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">排除颗数 ≤ 阈值的色号</span>
            </div>
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-2 text-sm">
              {Object.keys(colorCounts)
                .sort(sortColorKeys)
                .map((hexKey) => {
                  // 现在key是hex值，需要通过hex获取对应色号系统的色号
                  const displayColorKey = getColorKeyByHex(hexKey, selectedColorSystem);
                  const isExcluded = excludedColorKeys.has(hexKey);
                  const count = colorCounts[hexKey].count;
                  const colorHex = colorCounts[hexKey].color;

                  return (
                    <li
                      key={hexKey}
                      onClick={() => handleToggleExcludeColor(hexKey)}
                       // Apply dark mode styles for list items (normal and excluded)
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${ 
                        isExcluded
                          ? 'bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/60 opacity-60 dark:opacity-70' // Darker red background for excluded
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={isExcluded ? `点击恢复 ${displayColorKey}` : `点击排除 ${displayColorKey}`}
                    >
                      <div className={`flex items-center space-x-2 ${isExcluded ? 'line-through' : ''}`}>
                        {/* Adjust color swatch border */}
                        <span
                          className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                          style={{ backgroundColor: isExcluded ? '#666' : colorHex }} // Darker gray for excluded swatch
                        ></span>
                        {/* Adjust text color for key (normal and excluded) */}
                        <span className={`font-mono font-medium ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{displayColorKey}</span>
                      </div>
                      {/* Adjust text color for count (normal and excluded) */}
                      <span className={`text-xs ${isExcluded ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-300'}`}>{count} 颗</span>
                    </li>
                  );
                })}
            </ul>
            {excludedColorKeys.size > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowExcludedColors(prev => !prev)}
                    className="w-full text-xs py-1.5 px-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-between"
                  >
                    <span>已排除的颜色 ({excludedColorKeys.size})</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-4 w-4 text-gray-500 dark:text-gray-400 transform transition-transform ${showExcludedColors ? 'rotate-180' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showExcludedColors && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md p-2 bg-gray-100 dark:bg-gray-800">
                      <div className="max-h-40 overflow-y-auto">
                        {Array.from(excludedColorKeys).length > 0 ? (
                          <ul className="space-y-1">
                            {Array.from(excludedColorKeys).sort(sortColorKeys).map(hexKey => {
                              const colorData = catalogPalette.find(color => color.hex.toUpperCase() === hexKey.toUpperCase());
                              return (
                                <li key={hexKey} className="flex justify-between items-center p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                                      style={{ backgroundColor: colorData?.hex || hexKey }}
                                    ></span>
                                    <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{getColorKeyByHex(hexKey, selectedColorSystem)}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      // 实现恢复单个颜色的逻辑
                                      const newExcludedKeys = new Set(excludedColorKeys);
                                      newExcludedKeys.delete(hexKey);
                                      setExcludedColorKeys(newExcludedKeys);
                                      setRemapTrigger(prev => prev + 1);
                                      setIsManualColoringMode(false);
                                      setSelectedColor(null);
                                      console.log(`Restored color: ${hexKey}`);
                                    }}
                                    className="text-xs py-0.5 px-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40"
                                  >
                                    恢复
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
                            没有排除的颜色
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          // 恢复所有颜色的逻辑
                          setExcludedColorKeys(new Set());
                          setRemapTrigger(prev => prev + 1);
                          setIsManualColoringMode(false);
                          setSelectedColor(null);
                          console.log("Restored all excluded colors");
                        }}
                        className="mt-2 w-full text-xs py-1 px-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        一键恢复所有颜色
                      </button>
                    </div>
                  )}
                </div>
            )}
          </div>
        )} {/* ++ End of HIDE Color Counts ++ */}

        {!isManualColoringMode && activeBeadPalette.length === 0 && excludedColorKeys.size > 0 && (
             <div className="rounded-lg border border-yellow-200 bg-yellow-100 p-3 text-center text-sm text-yellow-800 dark:border-yellow-800/60 dark:bg-yellow-900/50 dark:text-yellow-300">
                 当前可用颜色过少或为空。请在列表中恢复部分颜色，或更换色板。
             </div>
         )}

        {!isManualColoringMode && mappedPixelData && (
          <div className="space-y-2">
             <button
                type="button"
                onClick={() => {
                  const canvas = effectCanvasRef.current;
                  setEffectArtworkSrc(
                    canvas && canvas.width > 0 ? canvas.toDataURL('image/png') : null
                  );
                  setIsEffectStudioOpen(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3d342c] py-2.5 text-sm text-[#fbf6ef] hover:bg-[#2b241e]"
              >
                 生成效果图
             </button>
             <button
                onClick={handleEnterFocusMode}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm text-white hover:bg-purple-700"
              >
                 专心拼豆
             </button>
              <button
                onClick={() => setIsDownloadSettingsOpen(true)}
                disabled={!gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
               >
                下载拼豆图纸
              </button>
            </div>
        )}
            </aside>
          </div>
        )}

            {isCustomPaletteEditorOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                   <input
                    type="file"
                    accept=".json"
                    ref={importPaletteInputRef}
                    onChange={handleImportPaletteFile}
                    className="hidden"
                  />
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <CustomPaletteEditor
                      allColors={catalogPalette}
                      currentSelections={customPaletteSelections}
                      onSelectionChange={handleSelectionChange}
                      onSaveCustomPalette={handleSaveCustomPalette}
                      onClose={() => setIsCustomPaletteEditorOpen(false)}
                      onExportCustomPalette={handleExportCustomPalette}
                      onImportCustomPalette={triggerImportPalette}
                      selectedColorSystem={selectedColorSystem}
                    />
                  </div>
                </div>
              </div>
            )}

         {/* Tooltip Display (Needs update in GridTooltip.tsx) */}
         {tooltipData && (
            <GridTooltip tooltipData={tooltipData} selectedColorSystem={selectedColorSystem} />
          )}
          {isSelectMode && selectionMenuPos && marqueeRect && (
            <SelectionContextMenu
              x={selectionMenuPos.x}
              y={selectionMenuPos.y}
              colors={selectionColorStats}
              selectedColorSystem={selectedColorSystem}
              onClear={handleSelectionClear}
              onFill={handleSelectionFillWait}
              onPickReplaceSource={handleSelectionReplaceSource}
              onCancelSelection={handleSelectModeToggle}
              onClose={() => setSelectionMenuPos(null)}
            />
          )}

      </main>

      {/* 悬浮工具栏 */}
      <FloatingToolbar
        isManualColoringMode={isManualColoringMode}
        isPaletteOpen={isFloatingPaletteOpen}
        onTogglePalette={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
        onExitManualMode={() => {
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setTooltipData(null);
          setIsEraseMode(false);
          setColorReplaceState({
            isActive: false,
            step: 'select-source'
          });
          setHighlightColorKey(null);
          setIsolateLockedHex(null);
          setIsolateHoverHex(null);
          setIsMagnifierActive(false);
          setMagnifierSelectionArea(null);
          clearEditHistory();
        }}
        onToggleMagnifier={handleToggleMagnifier}
        isMagnifierActive={isMagnifierActive}
      />

      {/* 悬浮调色盘 */}
      {isManualColoringMode && (
        <FloatingColorPalette
          colors={currentGridColors}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          selectedColorSystem={selectedColorSystem}
          isEraseMode={isEraseMode}
          onEraseToggle={handleEraseToggle}
          fullPaletteColors={fullPaletteColors}
          showFullPalette={showFullPalette}
          onToggleFullPalette={handleToggleFullPalette}
          colorReplaceState={colorReplaceState}
          onColorReplaceToggle={handleColorReplaceToggle}
          onColorReplace={handleColorReplace}
          onHighlightColor={handleHighlightColor}
          isOpen={isFloatingPaletteOpen}
          onToggleOpen={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
          isActive={activeFloatingTool === 'palette'}
          onActivate={handleActivatePalette}
          canUndo={editHistory.length > 0}
          onUndo={handleUndoEdit}
        />
      )}

      {/* 放大镜工具 */}
      {isManualColoringMode && (
        <>
          <MagnifierTool
            isActive={isMagnifierActive}
            onToggle={handleToggleMagnifier}
            mappedPixelData={mappedPixelData}
            gridDimensions={gridDimensions}
            selectedColor={selectedColor}
            selectedColorSystem={selectedColorSystem}
            onPixelEdit={handleMagnifierPixelEdit}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            selectionArea={magnifierSelectionArea}
            onClearSelection={() => setMagnifierSelectionArea(null)}
            isFloatingActive={activeFloatingTool === 'magnifier'}
            onActivateFloating={handleActivateMagnifier}
            highlightColorKey={highlightColorKey}
          />
          
          {/* 放大镜选择覆盖层 */}
          <MagnifierSelectionOverlay
            isActive={isMagnifierActive && !magnifierSelectionArea}
            canvasRef={pixelatedCanvasRef}
            gridDimensions={gridDimensions}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            onSelectionComplete={setMagnifierSelectionArea}
          />
        </>
      )}

      <footer className="fixed bottom-0 left-0 right-0 z-30 w-full border-t border-[#3a332c]/25 bg-[#1c1815] text-[#9a9084]">
        <div className="mx-auto flex h-14 w-full max-w-[1920px] items-center justify-between gap-3 px-4 sm:px-6">
          <p className="min-w-0 truncate text-xs sm:text-sm font-medium text-[#efe8dc]/80">
            对色局 · 拼豆底稿 &copy; {new Date().getFullYear()}
          </p>
          <button
            onClick={() => setIsDonationModalOpen(true)}
            className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-300 hover:shadow-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a2 2 0 0 1 2 2v1c0 1.1-.9 2-2 2h-1" fill="#f9a8d4" />
              <path d="M6 8h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8z" fill="#f9a8d4" />
              <path d="M6 8V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1" fill="#f472b6" />
              <path d="M12 16v-4" stroke="#7d2a5a" />
              <path d="M9.5 14.5L9 16" stroke="#7d2a5a" />
              <path d="M14.5 14.5L15 16" stroke="#7d2a5a" />
            </svg>
            <span>请作者喝一杯奶茶</span>
          </button>
        </div>
      </footer>

      <EffectPosterStudio
        isOpen={isEffectStudioOpen}
        artworkSrc={effectArtworkSrc}
        onClose={() => setIsEffectStudioOpen(false)}
      />

      {/* Donation Modal - 现在使用新的组件 */}
      <DonationModal isOpen={isDonationModalOpen} onClose={() => setIsDonationModalOpen(false)} />

      {/* 使用导入的下载设置弹窗组件 */}
      <DownloadSettingsModal 
        isOpen={isDownloadSettingsOpen}
        onClose={() => setIsDownloadSettingsOpen(false)}
        options={downloadOptions}
        onOptionsChange={setDownloadOptions}
        onDownload={handleDownloadRequest}
      />

      {/* 专心拼豆模式进入前下载提醒弹窗 */}
      <FocusModePreDownloadModal
        isOpen={isFocusModePreDownloadModalOpen}
        onClose={() => setIsFocusModePreDownloadModalOpen(false)}
        onProceedWithoutDownload={handleProceedToFocusMode}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        selectedColorSystem={selectedColorSystem}
      />

      {/* 轻量提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-[200] text-sm whitespace-nowrap"
             style={{ animation: 'toastFadeInOut 2s ease-in-out' }}>
          {toastMessage}
        </div>
      )}
    </div>
   </>
  );
}
