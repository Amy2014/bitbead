'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ZoomPanViewport from './ZoomPanViewport';
import { computeAlignedGridSize, type GridAlignParams } from '../utils/pixelation';

export type GridAlignValues = Required<GridAlignParams>;

interface GridAlignPanelProps {
  imageSrc: string;
  values: GridAlignValues;
  onChange: (next: GridAlignValues) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  bannerText?: string;
  onAutoDetect?: () => void;
  autoDetecting?: boolean;
  maxColorCount?: number;
  onMaxColorCountChange?: (value: number) => void;
  similarityThreshold?: number;
  onSimilarityThresholdChange?: (value: number) => void;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const CELL_SIZE_STEP = 0.2;

function snapCellSize(n: number) {
  return Math.max(1, Math.round(n / CELL_SIZE_STEP) * CELL_SIZE_STEP);
}

export default function GridAlignPanel({
  imageSrc,
  values,
  onChange,
  onConfirm,
  onCancel,
  confirming = false,
  confirmLabel = '确认转换拼豆图稿',
  cancelLabel = '取消对齐',
  bannerText = '网格对齐中：拖动滑块或方向键微调，让线落在色块缝上。确认后按格心取样，再用感知色差（WuQuant + CIEDE2000）按最大色数收色。',
  onAutoDetect,
  autoDetecting = false,
  maxColorCount,
  onMaxColorCountChange,
  similarityThreshold,
  onSimilarityThresholdChange,
}: GridAlignPanelProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setNaturalSize(null);
    const img = new window.Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onChange({ ...values, offsetX: values.offsetX - step });
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onChange({ ...values, offsetX: values.offsetX + step });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        onChange({ ...values, offsetY: values.offsetY - step });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onChange({ ...values, offsetY: values.offsetY + step });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, values]);

  const gridSize = useMemo(() => {
    if (!naturalSize) return { N: 0, M: 0 };
    return computeAlignedGridSize(naturalSize.w, naturalSize.h, values);
  }, [naturalSize, values]);

  const displayW = naturalSize?.w ?? 0;
  const displayH = naturalSize?.h ?? 0;
  const cell = Math.max(1, values.cellSize);

  const gridLines = useMemo(() => {
    if (!naturalSize || gridSize.N <= 0 || gridSize.M <= 0) {
      return { verts: [] as number[], hors: [] as number[] };
    }
    const verts: number[] = [];
    const hors: number[] = [];
    for (let i = 0; i <= gridSize.N; i++) {
      verts.push(values.offsetX + i * cell);
    }
    for (let j = 0; j <= gridSize.M; j++) {
      hors.push(values.offsetY + j * cell);
    }
    return { verts, hors };
  }, [naturalSize, gridSize, values.offsetX, values.offsetY, cell]);

  const setField = (patch: Partial<GridAlignValues>) => {
    onChange({ ...values, ...patch });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
        <span>
          {bannerText}
        </span>
        <span className="tabular-nums font-medium">
          {naturalSize ? `${naturalSize.w}×${naturalSize.h}px → ${gridSize.N}×${gridSize.M} 格` : '读取尺寸…'}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            格子大小（px，步进 0.2）
            <input
              type="range"
              min={1}
              max={Math.max(2, Math.floor((naturalSize?.w || 64) / 2))}
              step={CELL_SIZE_STEP}
              value={values.cellSize}
              onChange={(e) => setField({ cellSize: snapCellSize(Number(e.target.value)) })}
              className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-emerald-500 dark:bg-gray-600"
            />
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                className="h-7 w-7 rounded border border-gray-200 bg-white text-sm dark:border-gray-600 dark:bg-gray-700"
                onClick={() => setField({ cellSize: snapCellSize(values.cellSize - CELL_SIZE_STEP) })}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                step={CELL_SIZE_STEP}
                value={Number(values.cellSize.toFixed(1))}
                onChange={(e) => setField({ cellSize: snapCellSize(Number(e.target.value) || 1) })}
                className="h-7 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-700"
              />
              <button
                type="button"
                className="h-7 w-7 rounded border border-gray-200 bg-white text-sm dark:border-gray-600 dark:bg-gray-700"
                onClick={() => setField({ cellSize: snapCellSize(values.cellSize + CELL_SIZE_STEP) })}
              >
                +
              </button>
            </div>
          </label>

          {(
            [
              ['左偏移 offsetX', 'offsetX'],
              ['上偏移 offsetY', 'offsetY'],
              ['右裁边', 'marginRight'],
              ['下裁边', 'marginBottom'],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              {label}
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-gray-200 bg-white text-sm dark:border-gray-600 dark:bg-gray-700"
                  onClick={() => setField({ [key]: values[key] - 1 })}
                >
                  −
                </button>
                <input
                  type="number"
                  step={1}
                  value={values[key]}
                  onChange={(e) => setField({ [key]: Number(e.target.value) || 0 })}
                  className="h-7 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-700"
                />
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-gray-200 bg-white text-sm dark:border-gray-600 dark:bg-gray-700"
                  onClick={() => setField({ [key]: values[key] + 1 })}
                >
                  +
                </button>
              </div>
            </label>
          ))}

          {onMaxColorCountChange && maxColorCount != null && (
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              最大色数
              <span className="ml-2 tabular-nums text-gray-500">{maxColorCount}</span>
              <input
                type="range"
                min={1}
                max={300}
                value={maxColorCount}
                onChange={(e) => onMaxColorCountChange(Number(e.target.value))}
                className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-sky-500 dark:bg-gray-600"
              />
            </label>
          )}
          {onSimilarityThresholdChange && similarityThreshold != null && (
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              颜色合并阈值
              <span className="ml-2 tabular-nums text-gray-500">{similarityThreshold}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={similarityThreshold}
                onChange={(e) => onSimilarityThresholdChange(Number(e.target.value))}
                className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-amber-500 dark:bg-gray-600"
              />
            </label>
          )}

          <p className="text-[11px] leading-snug text-gray-400">
            方向键微调偏移（Shift=5px）。右/下裁边用来丢掉白边或不完整的半格。最大色数按感知贡献收色，不是按颗数砍低频色。
          </p>

          <div className="flex flex-col gap-2 pt-1">
            {onAutoDetect && (
              <button
                type="button"
                disabled={confirming || autoDetecting || !naturalSize}
                onClick={onAutoDetect}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
              >
                {autoDetecting ? '自动切格中…' : '自动切格'}
              </button>
            )}
            <button
              type="button"
              disabled={confirming || gridSize.N < 1 || gridSize.M < 1}
              onClick={onConfirm}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirming ? '处理中…' : confirmLabel}
            </button>
            <button
              type="button"
              disabled={confirming}
              onClick={onCancel}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={confirming || !naturalSize}
              onClick={() => {
                if (!naturalSize) return;
                const guess = clamp(Math.round(naturalSize.w / 50), 4, 32);
                onChange({
                  cellSize: guess,
                  offsetX: 0,
                  offsetY: 0,
                  marginRight: 0,
                  marginBottom: 0,
                });
              }}
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              重置偏移
            </button>
          </div>
        </div>

        <ZoomPanViewport
          fitKey={`align-${imageSrc}-${displayW}x${displayH}`}
          className="min-h-[280px] w-full flex-1 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-700 lg:min-h-0"
        >
          <div
            className="relative inline-block max-w-none"
            style={{ width: displayW || undefined, height: displayH || undefined }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="对齐原图"
              className="block max-w-none rounded border border-gray-300 dark:border-gray-600"
              draggable={false}
              style={{ width: displayW || 'auto', height: displayH || 'auto', imageRendering: 'pixelated' }}
            />
            {naturalSize && gridSize.N > 0 && gridSize.M > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={displayW}
                height={displayH}
                viewBox={`0 0 ${displayW} ${displayH}`}
              >
                <rect
                  x={values.offsetX}
                  y={values.offsetY}
                  width={gridSize.N * cell}
                  height={gridSize.M * cell}
                  fill="rgba(16, 185, 129, 0.06)"
                  stroke="rgba(16, 185, 129, 0.85)"
                  strokeWidth={Math.max(1, cell / 20)}
                />
                {gridLines.verts.map((x, idx) => (
                  <line
                    key={`v-${idx}`}
                    x1={x}
                    y1={values.offsetY}
                    x2={x}
                    y2={values.offsetY + gridSize.M * cell}
                    stroke="rgba(16, 185, 129, 0.55)"
                    strokeWidth={Math.max(0.5, cell / 40)}
                  />
                ))}
                {gridLines.hors.map((y, idx) => (
                  <line
                    key={`h-${idx}`}
                    x1={values.offsetX}
                    y1={y}
                    x2={values.offsetX + gridSize.N * cell}
                    y2={y}
                    stroke="rgba(16, 185, 129, 0.55)"
                    strokeWidth={Math.max(0.5, cell / 40)}
                  />
                ))}
              </svg>
            )}
          </div>
        </ZoomPanViewport>
      </div>
    </div>
  );
}
