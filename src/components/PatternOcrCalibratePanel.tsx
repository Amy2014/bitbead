'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getColorKeyByHex, getHexByMard221Key, getMard221Keys, ColorSystem } from '../utils/colorSystemUtils';
import { MappedPixel } from '../utils/pixelation';
import { transparentColorData } from '../utils/pixelEditingUtils';
import type { PatternCellThumb } from '../utils/patternOcr';
import { isEmptyPatternCell } from '../utils/patternOcr';

const EMPTY_ID = '__EMPTY__';
const HISTORY_LIMIT = 40;

interface PatternOcrCalibratePanelProps {
  mappedData: MappedPixel[][];
  thumbs: PatternCellThumb[];
  imageSrc: string;
  selectedColorSystem: ColorSystem;
  onSave: (next: MappedPixel[][]) => void;
  onCancel: () => void;
}

function cloneGrid(data: MappedPixel[][]): MappedPixel[][] {
  return data.map((row) => row.map((cell) => ({ ...cell })));
}

const CalibrateCell = React.memo(function CalibrateCell({
  id,
  index,
  src,
  selected,
  title,
  onPick,
}: {
  id: string;
  index: number;
  src: string;
  selected: boolean;
  title: string;
  onPick: (event: React.MouseEvent, index: number, id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onPick(event, index, id)}
      className={`overflow-hidden rounded border bg-white p-0 ${
        selected ? 'border-sky-500 ring-2 ring-sky-400' : 'border-gray-200 dark:border-gray-600'
      }`}
      title={title}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="pointer-events-none block h-12 w-full object-cover" />
      ) : (
        <span className="block h-12 w-full bg-gray-100" />
      )}
    </button>
  );
});

export default function PatternOcrCalibratePanel({
  mappedData,
  thumbs,
  imageSrc,
  selectedColorSystem,
  onSave,
  onCancel,
}: PatternOcrCalibratePanelProps) {
  const [draft, setDraft] = useState(() => cloneGrid(mappedData));
  const [dirty, setDirty] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetKey, setTargetKey] = useState(getMard221Keys()[0] || 'A1');
  const [historyLen, setHistoryLen] = useState(0);
  const historyRef = useRef<MappedPixel[][][]>([]);
  const lastCellIndexRef = useRef<number | null>(null);
  const dict = getMard221Keys();
  const [previewSrc, setPreviewSrc] = useState<Record<string, string>>({});
  const pickRef = useRef<(event: React.MouseEvent, index: number, id: string) => void>(() => undefined);

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const next: Record<string, string> = {};
      thumbs.forEach((thumb) => {
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, 48, 48);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, thumb.x, thumb.y, thumb.w, thumb.h, 0, 0, 48, 48);
        next[`${thumb.row}:${thumb.col}`] = canvas.toDataURL('image/jpeg', 0.7);
      });
      if (!cancelled) setPreviewSrc(next);
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc, thumbs]);

  const groups = useMemo(() => {
    const counts = new Map<string, { id: string; hex: string; label: string; count: number }>();
    let empty = 0;
    draft.forEach((row) => {
      row.forEach((cell) => {
        if (isEmptyPatternCell(cell)) {
          empty++;
          return;
        }
        const hex = cell.color.toUpperCase();
        const label = getColorKeyByHex(hex, selectedColorSystem);
        const prev = counts.get(hex);
        if (prev) prev.count++;
        else counts.set(hex, { id: hex, hex, label, count: 1 });
      });
    });
    const list = [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
    list.push({ id: EMPTY_ID, hex: '#FFFFFF', label: '空', count: empty });
    return list;
  }, [draft, selectedColorSystem]);

  const cellsForActive = useMemo(() => {
    if (!activeId) return [];
    return thumbs.filter((thumb) => {
      const cell = draft[thumb.row]?.[thumb.col];
      if (activeId === EMPTY_ID) return isEmptyPatternCell(cell);
      return cell && !isEmptyPatternCell(cell) && cell.color.toUpperCase() === activeId;
    });
  }, [activeId, thumbs, draft]);

  const usedInImage = useMemo(
    () =>
      groups
        .filter((group) => group.id !== EMPTY_ID)
        .map((group) => ({
          ...group,
          mardKey: getColorKeyByHex(group.hex, selectedColorSystem),
        }))
        .filter((group) => group.mardKey && group.mardKey !== '?'),
    [groups, selectedColorSystem]
  );

  const cellId = (row: number, col: number) => `${row}:${col}`;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCellClick = (event: React.MouseEvent, index: number, id: string) => {
    if (event.shiftKey && lastCellIndexRef.current !== null && cellsForActive.length) {
      const start = Math.min(lastCellIndexRef.current, index);
      const end = Math.max(lastCellIndexRef.current, index);
      const rangeIds = cellsForActive.slice(start, end + 1).map((cell) => cellId(cell.row, cell.col));
      setSelected((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((rangeId) => next.add(rangeId));
        return next;
      });
      return;
    }
    lastCellIndexRef.current = index;
    toggle(id);
  };
  pickRef.current = onCellClick;
  const onPick = useCallback((event: React.MouseEvent, index: number, id: string) => {
    pickRef.current(event, index, id);
  }, []);

  const allActiveSelected =
    cellsForActive.length > 0 && cellsForActive.every((cell) => selected.has(cellId(cell.row, cell.col)));

  const selectAll = () => {
    if (allActiveSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(cellsForActive.map((c) => cellId(c.row, c.col))));
  };

  const pushHistory = (current: MappedPixel[][]) => {
    historyRef.current = [...historyRef.current, cloneGrid(current)].slice(-HISTORY_LIMIT);
    setHistoryLen(historyRef.current.length);
  };

  const applyToSelected = (nextCell: MappedPixel) => {
    if (selected.size === 0) {
      alert('请先在上方勾选格子。');
      return;
    }
    pushHistory(draft);
    setDraft((prev) => {
      const next = cloneGrid(prev);
      selected.forEach((id) => {
        const [r, c] = id.split(':').map(Number);
        if (next[r]?.[c]) next[r][c] = { ...nextCell };
      });
      return next;
    });
    setDirty(true);
    setSelected(new Set());
  };

  const undoLast = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setHistoryLen(historyRef.current.length);
    setDraft(prev);
    setDirty(historyRef.current.length > 0);
    setSelected(new Set());
  };

  const changeCode = () => {
    const hex = getHexByMard221Key(targetKey, selectedColorSystem);
    if (!hex) {
      alert('色号不在 MARD221 词典中。');
      return;
    }
    applyToSelected({ key: hex, color: hex, isExternal: false });
  };

  const deleteSelected = () => {
    applyToSelected({ ...transparentColorData });
  };

  const handleSave = () => {
    onSave(draft);
  };

  const handleCancelEdits = () => {
    if (dirty && !confirm('放弃未保存的校准？')) return;
    historyRef.current = [];
    setHistoryLen(0);
    setDraft(cloneGrid(mappedData));
    setDirty(false);
    setSelected(new Set());
  };

  const handleExit = () => {
    if (dirty && !confirm('有未保存的修改，确定退出识别？')) return;
    onCancel();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-100">
        <span>识别结果校准：底部点色号，顶部改色号。全部改完后点一次保存写入图纸。</span>
        {dirty && <span className="font-medium text-amber-700 dark:text-amber-300">有未保存修改</span>}
      </div>

      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={!activeId || cellsForActive.length === 0}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
          >
            {allActiveSelected ? '取消全选' : `全选 ${activeId ? cellsForActive.length : 0} 格`}
          </button>
          <span className="text-xs text-gray-500">已选 {selected.size}（单击多选，Shift 连选）</span>
          <span className="text-[11px] text-gray-400">全部色号</span>
          <select
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
            className="h-7 rounded border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-800"
          >
            {dict.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={changeCode}
            className="rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-700"
          >
            改为该色号
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
          >
            删除为空
          </button>
          <button
            type="button"
            onClick={undoLast}
            disabled={historyLen === 0}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
          >
            撤回
          </button>
        </div>
        <div className="flex min-h-0 items-start gap-2">
          <span className="shrink-0 pt-1 text-[11px] text-gray-400">图中色号</span>
          <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-auto">
            {usedInImage.length === 0 && <span className="text-[11px] text-gray-400">暂无</span>}
            {usedInImage.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setTargetKey(group.mardKey)}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                  targetKey === group.mardKey
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/40'
                    : 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800'
                }`}
                title={`快捷选择 ${group.mardKey}`}
              >
                <span className="h-3 w-3 rounded-sm border border-gray-300" style={{ background: group.hex }} />
                {group.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
        {!activeId && (
          <p className="p-6 text-center text-sm text-gray-400">在下方点一个色号，查看对应格子截图</p>
        )}
        {activeId && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5">
            {cellsForActive.map((cell, index) => {
              const id = cellId(cell.row, cell.col);
              return (
                <CalibrateCell
                  key={id}
                  id={id}
                  index={index}
                  src={previewSrc[id] || ''}
                  selected={selected.has(id)}
                  title={`${cell.col + 1},${cell.row + 1}`}
                  onPick={onPick}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-1 text-[11px] text-gray-500">识别出色号</p>
        <div className="flex max-h-36 flex-wrap gap-1 overflow-auto">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                setActiveId(group.id);
                setSelected(new Set());
                lastCellIndexRef.current = null;
              }}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${
                activeId === group.id
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/40'
                  : 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800'
              }`}
            >
              <span
                className="h-3.5 w-3.5 rounded-sm border border-gray-300"
                style={{
                  background:
                    group.id === EMPTY_ID
                      ? 'repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 8px 8px'
                      : group.hex,
                }}
              />
              {group.label} {group.count}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            保存到图纸
          </button>
          <button
            type="button"
            onClick={handleCancelEdits}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
          >
            放弃本次修改
          </button>
          <button
            type="button"
            onClick={handleExit}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
          >
            退出识别
          </button>
        </div>
      </div>
    </div>
  );
}
