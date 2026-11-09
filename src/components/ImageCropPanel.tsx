'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ZoomPanViewport from './ZoomPanViewport';

export type CropRect = { x: number; y: number; w: number; h: number };

interface ImageCropPanelProps {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

type DragKind = 'move' | { handle: string };

const MIN_CROP = 8;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

function clampRect(rect: CropRect, imgW: number, imgH: number): CropRect {
  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;
  if (w < MIN_CROP) w = MIN_CROP;
  if (h < MIN_CROP) h = MIN_CROP;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > imgW) w = imgW - x;
  if (y + h > imgH) h = imgH - y;
  if (w < MIN_CROP) {
    w = MIN_CROP;
    x = Math.max(0, imgW - w);
  }
  if (h < MIN_CROP) {
    h = MIN_CROP;
    y = Math.max(0, imgH - h);
  }
  return { x, y, w, h };
}

function applyHandle(rect: CropRect, handle: string, dx: number, dy: number): CropRect {
  let { x, y, w, h } = rect;
  if (handle.includes('w')) {
    const nx = x + dx;
    w += x - nx;
    x = nx;
  }
  if (handle.includes('e')) w += dx;
  if (handle.includes('n')) {
    const ny = y + dy;
    h += y - ny;
    y = ny;
  }
  if (handle.includes('s')) h += dy;
  if (w < MIN_CROP) {
    if (handle.includes('w')) x = rect.x + rect.w - MIN_CROP;
    w = MIN_CROP;
  }
  if (h < MIN_CROP) {
    if (handle.includes('n')) y = rect.y + rect.h - MIN_CROP;
    h = MIN_CROP;
  }
  return { x, y, w, h };
}

export default function ImageCropPanel({ imageSrc, onConfirm, onCancel }: ImageCropPanelProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const dragRef = useRef<{
    kind: DragKind;
    startX: number;
    startY: number;
    orig: CropRect;
  } | null>(null);

  useEffect(() => {
    setNaturalSize(null);
    setCrop(null);
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNaturalSize({ w, h });
      const pad = Math.round(Math.min(w, h) * 0.04);
      setCrop(clampRect({ x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 }, w, h));
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const toImagePoint = useCallback((clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el || !naturalSize) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = ((clientX - rect.left) / rect.width) * naturalSize.w;
    const y = ((clientY - rect.top) / rect.height) * naturalSize.h;
    return { x, y };
  }, [naturalSize]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !naturalSize || !crop) return;
    const pt = toImagePoint(event.clientX, event.clientY);
    if (!pt) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement).dataset.handle;
    if (handle) {
      dragRef.current = { kind: { handle }, startX: pt.x, startY: pt.y, orig: { ...crop } };
      return;
    }
    const inside =
      pt.x >= crop.x && pt.x <= crop.x + crop.w && pt.y >= crop.y && pt.y <= crop.y + crop.h;
    if (!inside) return;
    dragRef.current = { kind: 'move', startX: pt.x, startY: pt.y, orig: { ...crop } };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !naturalSize) return;
    const pt = toImagePoint(event.clientX, event.clientY);
    if (!pt) return;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    if (drag.kind === 'move') {
      setCrop(
        clampRect(
          { ...drag.orig, x: drag.orig.x + dx, y: drag.orig.y + dy },
          naturalSize.w,
          naturalSize.h
        )
      );
    } else {
      setCrop(clampRect(applyHandle(drag.orig, drag.kind.handle, dx, dy), naturalSize.w, naturalSize.h));
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !crop || !naturalSize) return;
    const x = Math.max(0, Math.floor(crop.x));
    const y = Math.max(0, Math.floor(crop.y));
    const w = Math.max(MIN_CROP, Math.min(naturalSize.w - x, Math.round(crop.w)));
    const h = Math.max(MIN_CROP, Math.min(naturalSize.h - y, Math.round(crop.h)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    onConfirm(canvas.toDataURL('image/png'));
  };

  const displayW = naturalSize?.w ?? 0;
  const displayH = naturalSize?.h ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
        <span>裁剪截图：拖动选区移动，拖边角调整大小。滚轮缩放，中键或右键平移。框外单击不会重画选区。</span>
        <span className="tabular-nums font-medium">
          {naturalSize && crop
            ? `${Math.round(crop.w)}×${Math.round(crop.h)} / ${naturalSize.w}×${naturalSize.h}px`
            : '读取尺寸…'}
        </span>
      </div>
      <ZoomPanViewport
        allowLeftPan={false}
        fitKey={`crop-${imageSrc}-${displayW}x${displayH}`}
        className="min-h-[280px] w-full flex-1 rounded-lg bg-gray-100 p-1.5 dark:bg-gray-700 lg:min-h-0"
      >
        <div
          className="relative inline-block max-w-none cursor-default"
          style={{ width: displayW || undefined, height: displayH || undefined }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="裁剪原图"
            className="pointer-events-none block max-w-none select-none rounded border border-gray-300 dark:border-gray-600"
            draggable={false}
            style={{ width: displayW || 'auto', height: displayH || 'auto' }}
          />
          {naturalSize && crop && (
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={displayW}
              height={displayH}
              viewBox={`0 0 ${displayW} ${displayH}`}
            >
              <path
                fill="rgba(0,0,0,0.45)"
                fillRule="evenodd"
                d={`M0 0H${displayW}V${displayH}H0Z M${crop.x} ${crop.y}H${crop.x + crop.w}V${crop.y + crop.h}H${crop.x}Z`}
              />
              <rect
                x={crop.x}
                y={crop.y}
                width={crop.w}
                height={crop.h}
                fill="none"
                stroke="rgb(139, 92, 246)"
                strokeWidth={Math.max(1, Math.min(displayW, displayH) / 400)}
              />
            </svg>
          )}
          {crop && (
            <div
              className="absolute cursor-move"
              style={{
                left: crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
              }}
            />
          )}
          {crop &&
            HANDLES.map((handle) => {
              const left = handle.includes('w')
                ? crop.x
                : handle.includes('e')
                  ? crop.x + crop.w
                  : crop.x + crop.w / 2;
              const top = handle.includes('n')
                ? crop.y
                : handle.includes('s')
                  ? crop.y + crop.h
                  : crop.y + crop.h / 2;
              const cursor =
                handle === 'n' || handle === 's'
                  ? 'ns-resize'
                  : handle === 'e' || handle === 'w'
                    ? 'ew-resize'
                    : handle === 'ne' || handle === 'sw'
                      ? 'nesw-resize'
                      : 'nwse-resize';
              return (
                <button
                  key={handle}
                  type="button"
                  data-handle={handle}
                  aria-label={`调整裁剪 ${handle}`}
                  className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-violet-500 p-0"
                  style={{ left, top, cursor }}
                />
              );
            })}
        </div>
      </ZoomPanViewport>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={!crop || !naturalSize}
          onClick={handleConfirm}
          className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          确认裁剪
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        >
          取消
        </button>
      </div>
    </div>
  );
}
