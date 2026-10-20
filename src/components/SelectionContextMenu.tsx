'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';
import { SelectionColorStat } from '../utils/pixelEditingUtils';

type SelectionContextMenuProps = {
  x: number;
  y: number;
  colors: SelectionColorStat[];
  selectedColorSystem: ColorSystem;
  onClear: () => void;
  onFill: () => void;
  onPickReplaceSource: (color: { key: string; color: string }) => void;
  onCancelSelection: () => void;
  onClose: () => void;
};

export default function SelectionContextMenu({
  x,
  y,
  colors,
  selectedColorSystem,
  onClear,
  onFill,
  onPickReplaceSource,
  onCancelSelection,
  onClose,
}: SelectionContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const pos = useMemo(() => {
    const menuW = replaceOpen ? 420 : 168;
    const menuH = Math.min(360, 44 + (replaceOpen ? Math.max(colors.length, 1) * 36 : 140));
    const left = Math.min(Math.max(8, x), window.innerWidth - menuW - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - menuH - 8);
    return { left, top };
  }, [x, y, replaceOpen, colors.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="fixed z-[80] flex items-start"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="min-w-[148px] overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-600 dark:bg-gray-800">
        <button
          type="button"
          className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
          onClick={onClear}
        >
          清空
        </button>
        <button
          type="button"
          className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
          onClick={onFill}
        >
          填充
        </button>
        <button
          type="button"
          className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
            replaceOpen ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'text-gray-800 dark:text-gray-100'
          }`}
          onClick={() => setReplaceOpen((open) => !open)}
        >
          替换
          <span className="text-[10px] text-gray-400">▸</span>
        </button>
        <button
          type="button"
          className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700"
          onClick={onCancelSelection}
        >
          取消选区
        </button>
      </div>
      {replaceOpen && (
        <div className="ml-1 max-h-72 min-w-[240px] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-600 dark:bg-gray-800">
          {colors.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">选区内没有可替换的色块</p>
          ) : (
            colors.map((item) => {
              const code = getColorKeyByHex(item.hex, selectedColorSystem);
              const percent = `${Math.round(item.ratio * 1000) / 10}%`;
              return (
                <button
                  key={item.hex}
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => onPickReplaceSource({ key: item.key, color: item.hex })}
                >
                  <span
                    className="inline-flex h-6 min-w-7 items-center justify-center rounded border border-black/10 px-1 font-mono text-[10px] font-semibold"
                    style={{ backgroundColor: item.hex }}
                  >
                    {code}
                  </span>
                  <span className="flex-1 font-mono text-xs text-gray-700 dark:text-gray-200">{code}</span>
                  <span className="text-[11px] tabular-nums text-gray-500">{item.count}</span>
                  <span className="w-12 text-right text-[11px] tabular-nums text-gray-400">{percent}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
