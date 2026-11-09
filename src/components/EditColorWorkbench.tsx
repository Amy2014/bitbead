'use client';

import React, { useMemo, useState } from 'react';
import { ColorSystem, getColorKeyByHex, groupColorsBySeries } from '../utils/colorSystemUtils';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';
import { ColorReplaceState } from '../hooks/useManualEditingState';
import { findClosestPaletteColorCiede2000, hexToRgb, PaletteColor } from '../utils/pixelation';

export type PatternColor = {
  hex: string;
  color: string;
  key: string;
  count: number;
};

function swatchInk(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '#111827';
  const n = parseInt(raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return y > 168 ? '#111827' : '#ffffff';
}

function ToolButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-amber-500 bg-amber-500 text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

type SharedProps = {
  colors: PatternColor[];
  selectedColorSystem: ColorSystem;
  selectedColor: { key: string; color: string } | null;
  onBrushSelect: (color: { key: string; color: string }) => void;
  onLibrarySelect?: (color: { key: string; color: string }) => void;
};

export function EditBrushStrip({
  colors,
  selectedColorSystem,
  selectedColor,
  onBrushSelect,
  onLibrarySelect,
  isEraseMode,
  onEraseToggle,
  colorReplaceState,
  onColorReplaceToggle,
  canUndo,
  onUndo,
  onPickEraser,
  onMirrorHorizontal,
  onMirrorVertical,
  onRotateCw,
  onRotateCcw,
  onRotateByDegrees,
  libraryColors,
  isSelectMode,
  onSelectModeToggle,
  selectionHint,
  isPickingBoardColor,
  onPickBoardColorToggle,
  boardBackgroundColor,
}: SharedProps & {
  isEraseMode: boolean;
  onEraseToggle: () => void;
  colorReplaceState: ColorReplaceState;
  onColorReplaceToggle: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onPickEraser: () => void;
  onMirrorHorizontal: () => void;
  onMirrorVertical: () => void;
  onRotateCw: () => void;
  onRotateCcw: () => void;
  onRotateByDegrees: (degrees: number) => void;
  libraryColors: PaletteColor[];
  isSelectMode?: boolean;
  onSelectModeToggle?: () => void;
  selectionHint?: string | null;
  isPickingBoardColor?: boolean;
  onPickBoardColorToggle?: () => void;
  boardBackgroundColor?: string | null;
}) {
  const eraserSelected = selectedColor?.key === TRANSPARENT_KEY;
  const brushActive =
    !!selectedColor &&
    !eraserSelected &&
    !isEraseMode &&
    !colorReplaceState.isActive &&
    !isSelectMode &&
    !isPickingBoardColor;
  const [rotateDegrees, setRotateDegrees] = useState(0);
  const [sampledHex, setSampledHex] = useState<string | null>(null);
  const [eyedropperError, setEyedropperError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const librarySeries = useMemo(
    () => groupColorsBySeries(libraryColors, selectedColorSystem),
    [libraryColors, selectedColorSystem]
  );

  const selectedCode =
    selectedColor && selectedColor.key !== TRANSPARENT_KEY
      ? getColorKeyByHex(selectedColor.color, selectedColorSystem)
      : eraserSelected
        ? '橡皮'
        : '未选';

  const handleEyedropper = async () => {
    setEyedropperError(null);
    const EyeDropperCtor = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropperCtor) {
      setEyedropperError('当前浏览器不支持屏幕取色（需 Chrome / Edge）');
      return;
    }
    try {
      setIsPicking(true);
      const result = await new EyeDropperCtor().open();
      const sampled = result.sRGBHex.toUpperCase();
      setSampledHex(sampled);
      const rgb = hexToRgb(sampled);
      if (!rgb || libraryColors.length === 0) return;
      const closest = findClosestPaletteColorCiede2000(rgb, libraryColors);
      if (closest) {
        onBrushSelect({ key: closest.hex.toUpperCase(), color: closest.hex.toUpperCase() });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setEyedropperError('取色已取消或失败');
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToolButton
          active={brushActive}
          title="画笔"
          onClick={() => {
            if (colors[0]) onBrushSelect({ key: colors[0].key, color: colors[0].color });
          }}
        >
          画笔
        </ToolButton>
        <ToolButton active={eraserSelected} title="橡皮擦" onClick={onPickEraser}>
          橡皮
        </ToolButton>
        <ToolButton active={isEraseMode} title="区域擦除" onClick={onEraseToggle}>
          区域擦除
        </ToolButton>
        <ToolButton
          active={colorReplaceState.isActive}
          title="批量替换"
          onClick={onColorReplaceToggle}
        >
          替换
        </ToolButton>
        <ToolButton active={!!isSelectMode} title="拖动框选区域" onClick={onSelectModeToggle}>
          选区
        </ToolButton>
        <ToolButton disabled={!canUndo} title="撤回" onClick={onUndo}>
          撤回
        </ToolButton>
        <ToolButton title="左右镜像整张拼豆图" onClick={onMirrorHorizontal}>
          左右镜像
        </ToolButton>
        <ToolButton title="上下镜像整张拼豆图" onClick={onMirrorVertical}>
          上下镜像
        </ToolButton>
        <ToolButton title="整图顺时针旋转 90°" onClick={onRotateCw}>
          顺时针90°
        </ToolButton>
        <ToolButton title="整图逆时针旋转 90°" onClick={onRotateCcw}>
          逆时针90°
        </ToolButton>
        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 dark:border-gray-600 dark:bg-gray-800">
          <span className="whitespace-nowrap text-[11px] text-gray-500">任意角</span>
          <button
            type="button"
            className="h-6 w-6 rounded text-xs"
            onClick={() => setRotateDegrees((d) => Math.max(-180, d - 1))}
          >
            −
          </button>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={rotateDegrees}
            onChange={(e) => setRotateDegrees(Number(e.target.value))}
            className="h-2 w-24 cursor-pointer appearance-none rounded-full bg-gray-200 accent-amber-500"
          />
          <input
            type="number"
            min={-180}
            max={180}
            step={1}
            value={rotateDegrees}
            onChange={(e) => setRotateDegrees(Number(e.target.value) || 0)}
            className="h-6 w-12 rounded border border-gray-200 bg-white px-1 text-[11px] dark:border-gray-600 dark:bg-gray-700"
          />
          <span className="text-[11px] text-gray-400">°</span>
          <button
            type="button"
            disabled={rotateDegrees === 0}
            className="h-6 rounded px-1.5 text-[11px] text-amber-700 disabled:opacity-40 dark:text-amber-300"
            onClick={() => {
              onRotateByDegrees(rotateDegrees);
              setRotateDegrees(0);
            }}
          >
            应用
          </button>
        </div>
        <ToolButton
          active={!!isPickingBoardColor}
          title="从色区3选择豆板背景色"
          onClick={onPickBoardColorToggle}
        >
          豆板色
          <span
            className="ml-0.5 inline-block h-3.5 w-3.5 rounded-sm border border-black/20"
            style={{ backgroundColor: boardBackgroundColor || '#F3F4F6' }}
          />
        </ToolButton>
        {colorReplaceState.isActive && (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {colorReplaceState.step === 'select-source'
              ? '点拼豆图或色区2，选择要被替换的颜色'
              : '在色区2或色区3选择替换成的颜色'}
          </span>
        )}
        {isSelectMode && (
          <span className="text-xs text-blue-700 dark:text-blue-300">
            {selectionHint || '按住拖动框选；松手后用右键菜单清空 / 填充 / 替换'}
          </span>
        )}
        {isPickingBoardColor && (
          <span className="text-xs text-blue-700 dark:text-blue-300">在色区3选择豆板背景色</span>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">色区2 · 画笔色号</p>
          <p className="text-[11px] text-gray-400">
            {colorReplaceState.isActive
              ? colorReplaceState.step === 'select-source'
                ? '点这里选择要被替换的颜色'
                : '也可点这里选择替换成的颜色'
              : '点选设置画笔，与图上颜色同步'}
          </p>
        </div>
        <div className="flex max-h-[calc(2.25rem*4+0.375rem*3)] flex-wrap gap-1.5 overflow-y-auto">
          {colors.map((c) => {
            const code = getColorKeyByHex(c.color, selectedColorSystem);
            const isBrush =
              selectedColor?.key !== TRANSPARENT_KEY &&
              selectedColor?.color.toUpperCase() === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => onBrushSelect({ key: c.key, color: c.color })}
                className={`relative flex h-9 min-w-9 items-center justify-center rounded-md border px-1 font-mono text-[10px] font-semibold leading-none ${
                  isBrush
                    ? 'border-gray-900 ring-2 ring-amber-400 dark:border-white'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                style={{ backgroundColor: c.color, color: swatchInk(c.color) }}
                title={`${code} · 设为画笔`}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-900/40">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-[10px] text-gray-400">当前</span>
            {selectedColor && selectedColor.key !== TRANSPARENT_KEY ? (
              <>
                <span
                  className="inline-flex h-7 min-w-8 items-center justify-center rounded border border-black/10 px-1 font-mono text-[10px] font-semibold"
                  style={{ backgroundColor: selectedColor.color, color: swatchInk(selectedColor.color) }}
                >
                  {selectedCode}
                </span>
                <span className="font-mono text-[10px] text-gray-600 dark:text-gray-300">{selectedColor.color.toUpperCase()}</span>
              </>
            ) : (
              <span className="text-[11px] text-gray-500">{selectedCode}</span>
            )}
          </div>
          <div className="mx-0.5 h-6 w-px bg-gray-200 dark:bg-gray-600" />
          <ToolButton active={isPicking} title="从屏幕任意位置取色，再对到当前色库" onClick={handleEyedropper}>
            取色器
          </ToolButton>
          {sampledHex ? (
            <div className="flex items-center gap-1.5" title="取样得到的实际颜色">
              <span
                className="h-7 w-7 shrink-0 rounded border border-gray-300 dark:border-gray-500"
                style={{ backgroundColor: sampledHex }}
              />
              <div className="leading-tight">
                <p className="text-[10px] text-gray-400">取样色</p>
                <p className="font-mono text-[10px] text-gray-700 dark:text-gray-200">{sampledHex}</p>
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-gray-400">可点取色器从屏幕取色</span>
          )}
        </div>
        {eyedropperError && (
          <p className="mt-1 text-[10px] text-red-500">{eyedropperError}</p>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">色区3 · 当前色库</p>
          <p className="text-[11px] text-gray-400">
            {isPickingBoardColor
              ? '点这里选择豆板背景色'
              : colorReplaceState.isActive && colorReplaceState.step === 'select-target'
              ? '点这里选择替换成的颜色（可含图上没有的色）'
              : `全色库按色系排列 · ${libraryColors.length} 色`}
          </p>
        </div>
        <div
          className={`max-h-56 overflow-y-auto rounded-md border p-1.5 ${
            isPickingBoardColor || (colorReplaceState.isActive && colorReplaceState.step === 'select-target')
              ? 'border-amber-400 ring-2 ring-amber-200 dark:border-amber-500 dark:ring-amber-900/40'
              : 'border-gray-200 dark:border-gray-600'
          }`}
        >
          <div className="space-y-1.5">
            {librarySeries.map((group) => (
              <div key={group.prefix}>
                <div className="sticky top-0 z-10 mb-0.5 flex items-center gap-1.5 bg-white/95 px-0.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-900/95 dark:text-gray-400">
                  <span>{group.prefix} 系</span>
                  <span className="text-gray-300 dark:text-gray-600">{group.colors.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.colors.map((c) => {
                    const hex = c.hex.toUpperCase();
                    const code = getColorKeyByHex(hex, selectedColorSystem);
                    const isBrush =
                      selectedColor?.key !== TRANSPARENT_KEY &&
                      selectedColor?.color.toUpperCase() === hex;
                    const isBoard = boardBackgroundColor?.toUpperCase() === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => (onLibrarySelect ?? onBrushSelect)({ key: hex, color: hex })}
                        className={`flex h-7 min-w-7 items-center justify-center rounded border px-0.5 font-mono text-[9px] font-semibold leading-none ${
                          isBoard && isPickingBoardColor
                            ? 'border-gray-900 ring-2 ring-blue-400 dark:border-white'
                            : isBrush
                            ? 'border-gray-900 ring-2 ring-amber-400 dark:border-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                        style={{ backgroundColor: hex, color: swatchInk(hex) }}
                        title={`${code} ${hex}`}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditColorInventory({
  colors,
  selectedColorSystem,
  isolateLockedHex,
  isolatePreviewHex,
  onIsolateHover,
  onIsolateToggle,
  onExcludeColor,
}: {
  colors: PatternColor[];
  selectedColorSystem: ColorSystem;
  isolateLockedHex: string | null;
  isolatePreviewHex: string | null;
  onIsolateHover: (hex: string | null) => void;
  onIsolateToggle: (hex: string) => void;
  onExcludeColor: (hex: string) => void;
}) {
  const total = colors.reduce((sum, c) => sum + c.count, 0) || 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">色区1 · 当前色号</p>
        <p className="text-[11px] text-gray-400">
          {isolateLockedHex ? '已锁定，再点取消' : '点色号锁定，点删除排除并重映射'}
        </p>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        onMouseLeave={() => onIsolateHover(null)}
      >
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 dark:bg-gray-900">
            <tr>
              <th className="px-2 py-1.5 font-medium">色号</th>
              <th className="px-2 py-1.5 font-medium text-right">颗数</th>
              <th className="px-2 py-1.5 font-medium text-right">%</th>
              <th className="px-2 py-1.5 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => {
              const code = getColorKeyByHex(c.color, selectedColorSystem);
              const locked = isolateLockedHex === c.hex;
              const preview = !isolateLockedHex && isolatePreviewHex === c.hex;
              return (
                <tr
                  key={c.hex}
                  onMouseEnter={() => onIsolateHover(c.hex)}
                  onClick={() => onIsolateToggle(c.hex)}
                  className={`cursor-pointer border-t border-gray-100 dark:border-gray-700 ${
                    locked
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : preview
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-flex h-6 min-w-8 items-center justify-center rounded border border-black/10 px-1 font-mono text-[10px] font-semibold"
                        style={{ backgroundColor: c.color, color: swatchInk(c.color) }}
                      >
                        {code}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {c.count}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">
                    {((c.count / total) * 100).toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      title={`排除 ${code}（与首页去除杂色相同，会映射到最近可用色）`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onExcludeColor(c.hex);
                      }}
                      className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
