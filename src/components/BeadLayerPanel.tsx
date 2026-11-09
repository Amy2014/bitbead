'use client';

import React from 'react';
import { BeadLayer, layerOffsetRange, layerSize } from '../utils/beadLayers';

interface BeadLayerPanelProps {
  layers: BeadLayer[];
  activeLayerId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onMerge: () => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onOffsetChange: (id: string, offsetX: number, offsetY: number) => void;
}

export default function BeadLayerPanel({
  layers,
  activeLayerId,
  onSelect,
  onAdd,
  onMerge,
  onDelete,
  onMove,
  onOffsetChange,
}: BeadLayerPanelProps) {
  const visual = [...layers].reverse();
  const active = layers.find((layer) => layer.id === activeLayerId) || null;
  const range = active ? layerOffsetRange(layers, active.id) : null;
  const size = active ? layerSize(active) : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">图层</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onAdd}
            className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
          >
            添加拼豆图层
          </button>
          <button
            type="button"
            onClick={onMerge}
            disabled={layers.length < 2}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700"
          >
            合并图层
          </button>
        </div>
      </div>
      {layers.length === 0 && (
        <p className="text-[11px] leading-snug text-gray-400">导入本工具 CSV 后会叠在当前图上方，空格透明。</p>
      )}
      <div className="flex max-h-40 flex-col gap-1 overflow-auto">
        {visual.map((layer, visualIndex) => {
          const dataIndex = layers.length - 1 - visualIndex;
          const selected = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                selected
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/40'
                  : 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(layer.id)}
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium"
              >
                {layer.name}
              </button>
              <button
                type="button"
                title="上移"
                disabled={dataIndex >= layers.length - 1}
                onClick={() => onMove(layer.id, 'up')}
                className="h-6 w-6 rounded text-[11px] disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                title="下移"
                disabled={dataIndex <= 0}
                onClick={() => onMove(layer.id, 'down')}
                className="h-6 w-6 rounded text-[11px] disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                title="删除"
                disabled={layers.length < 2}
                onClick={() => onDelete(layer.id)}
                className="h-6 w-6 rounded text-[11px] text-red-500 disabled:opacity-30"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {active && range && size && layers.length >= 2 && (
        <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2 dark:border-gray-700">
          <p className="text-[11px] text-gray-500">位置（格）· {active.name}</p>
          <label className="block text-[11px] text-gray-600 dark:text-gray-300">
            左右 {active.offsetX}
            <input
              type="range"
              min={range.minX}
              max={Math.max(range.minX, range.maxX)}
              step={1}
              value={active.offsetX}
              onChange={(e) => onOffsetChange(active.id, Number(e.target.value), active.offsetY)}
              className="mt-0.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-sky-500"
            />
          </label>
          <label className="block text-[11px] text-gray-600 dark:text-gray-300">
            上下 {active.offsetY}
            <input
              type="range"
              min={range.minY}
              max={Math.max(range.minY, range.maxY)}
              step={1}
              value={active.offsetY}
              onChange={(e) => onOffsetChange(active.id, active.offsetX, Number(e.target.value))}
              className="mt-0.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-sky-500"
            />
          </label>
        </div>
      )}
    </div>
  );
}
