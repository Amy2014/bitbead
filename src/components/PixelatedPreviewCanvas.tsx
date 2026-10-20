'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, PointerEvent, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { GridRect, normalizeGridRect } from '../utils/pixelEditingUtils';

interface PixelatedPreviewCanvasProps {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  isManualColoringMode: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onInteraction: (
    clientX: number,
    clientY: number,
    pageX: number,
    pageY: number,
    isClick: boolean,
    isTouchEnd?: boolean
  ) => void;
  highlightColorKey?: string | null;
  onHighlightComplete?: () => void;
  isolateColorKey?: string | null;
  showGrid?: boolean;
  interactive?: boolean;
  transparentExternal?: boolean;
  selectionMode?: boolean;
  selectionRect?: GridRect | null;
  onMarqueeComplete?: (rect: GridRect, clientX: number, clientY: number) => void;
  onSelectionContextMenu?: (clientX: number, clientY: number) => void;
  boardBackgroundColor?: string | null;
}

// 绘制像素化画布的函数
const drawPixelatedCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement | null,
  dims: { N: number; M: number } | null,
  highlightColorKey?: string | null,
  isHighlighting?: boolean,
  showGrid: boolean = true,
  transparentExternal: boolean = false,
  isolateColorKey?: string | null,
  selectionRect?: GridRect | null,
  boardBackgroundColor?: string | null
) => {
  if (!canvas || !dims || !dataToDraw) {
    console.warn("drawPixelatedCanvas: Missing required parameters");
    return;
  }
  
  const pixelatedCtx = canvas.getContext('2d');
  if (!pixelatedCtx) {
    console.error("Failed to get 2D context for pixelated canvas");
    return;
  }

  // Respect current dark mode preference
  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  // Define colors based on mode
  const externalBackgroundColor =
    boardBackgroundColor || (isDarkMode ? '#374151' : '#F3F4F6');
  const gridLineColor = isDarkMode ? '#4B5563' : '#DDDDDD'; // gray-600 : lighter gray

  const { N, M } = dims;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const cellWidthOutput = outputWidth / N;
  const cellHeightOutput = outputHeight / M;

  pixelatedCtx.clearRect(0, 0, outputWidth, outputHeight);
  pixelatedCtx.imageSmoothingEnabled = false;
  pixelatedCtx.lineWidth = 0.5;

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const cellData = dataToDraw[j]?.[i];
      if (!cellData) continue;

      const drawX = Math.floor(i * cellWidthOutput);
      const drawY = Math.floor(j * cellHeightOutput);
      const cellW = Math.max(1, Math.floor((i + 1) * cellWidthOutput) - drawX);
      const cellH = Math.max(1, Math.floor((j + 1) * cellHeightOutput) - drawY);
      // 效果图无网格时多画 1px，避免非整数格子留下细缝
      const fillW = showGrid || i === N - 1 ? cellW : cellW + 1;
      const fillH = showGrid || j === M - 1 ? cellH : cellH + 1;

      const isHollow =
        cellData.isExternal ||
        cellData.key === 'ERASE' ||
        (typeof cellData.color === 'string' && cellData.color.toLowerCase() === 'transparent');
      if (isHollow) {
        if (!transparentExternal) {
          pixelatedCtx.fillStyle = externalBackgroundColor;
          pixelatedCtx.fillRect(drawX, drawY, fillW, fillH);
        }
      } else if (
        isolateColorKey &&
        cellData.color.toUpperCase() !== isolateColorKey.toUpperCase()
      ) {
        if (!transparentExternal) {
          pixelatedCtx.fillStyle = externalBackgroundColor;
          pixelatedCtx.fillRect(drawX, drawY, fillW, fillH);
        }
      } else {
        pixelatedCtx.fillStyle = cellData.color;
        pixelatedCtx.fillRect(drawX, drawY, fillW, fillH);
      }

      // 如果正在高亮且当前单元格不是目标颜色，添加半透明黑色蒙版
      if (!isolateColorKey && isHighlighting && highlightColorKey && !isHollow) {
        let shouldDim = false;
        
        if (cellData.isExternal) {
          shouldDim = !transparentExternal;
        } else {
          // 内部单元格：如果颜色不匹配则变深色
          shouldDim = cellData.color.toUpperCase() !== highlightColorKey.toUpperCase();
        }
        
        if (shouldDim) {
          pixelatedCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // 60% 透明度的黑色蒙版
          pixelatedCtx.fillRect(drawX, drawY, fillW, fillH);
        }
      }

      if (showGrid) {
        pixelatedCtx.strokeStyle = gridLineColor;
        pixelatedCtx.strokeRect(drawX + 0.5, drawY + 0.5, cellW, cellH);
      }
    }
  }

  if (selectionRect) {
    const sel = normalizeGridRect(selectionRect);
    const x = Math.floor(sel.c0 * cellWidthOutput);
    const y = Math.floor(sel.r0 * cellHeightOutput);
    const w = Math.max(1, Math.floor((sel.c1 + 1) * cellWidthOutput) - x);
    const h = Math.max(1, Math.floor((sel.r1 + 1) * cellHeightOutput) - y);
    pixelatedCtx.fillStyle = 'rgba(37, 99, 235, 0.18)';
    pixelatedCtx.fillRect(x, y, w, h);
    pixelatedCtx.strokeStyle = '#2563eb';
    pixelatedCtx.lineWidth = 2;
    pixelatedCtx.setLineDash([5, 3]);
    pixelatedCtx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    pixelatedCtx.setLineDash([]);
  }
};

function ensureSquareGridCanvas(canvas: HTMLCanvasElement, N: number, M: number) {
  if (N < 1 || M < 1) return;
  const gridAspect = N / M;
  const currentAspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 0;
  const aspectMismatch = Math.abs(currentAspect - gridAspect) > 0.02;
  const tooSmall = canvas.width < 8 || canvas.height < 8;
  if (!aspectMismatch && !tooSmall) return;

  const baseWidth = 500;
  const minCell = 4;
  let cell = Math.max(minCell, Math.round(baseWidth / N));
  if (N > 100) {
    const maxWidth = typeof window !== 'undefined' ? Math.min(1200, window.innerWidth * 0.9) : 1200;
    cell = Math.max(minCell, Math.floor(maxWidth / N));
  }
  canvas.width = N * cell;
  canvas.height = M * cell;
}

const PixelatedPreviewCanvas: React.FC<PixelatedPreviewCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  isManualColoringMode,
  canvasRef,
  onInteraction,
  highlightColorKey,
  onHighlightComplete,
  isolateColorKey = null,
  showGrid = true,
  interactive = true,
  transparentExternal = false,
  selectionMode = false,
  selectionRect = null,
  onMarqueeComplete,
  onSelectionContextMenu,
  boardBackgroundColor = null,
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [draftRect, setDraftRect] = useState<GridRect | null>(null);
  const marqueeRef = useRef<{
    pointerId: number;
    startCell: { i: number; j: number };
  } | null>(null);
  const suppressClickRef = useRef(false);

  // Effect to detect dark mode changes and update state
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDarkMode = () => {
        const isDark = document.documentElement.classList.contains('dark');
        // Only update state if it actually changes
        if (isDark !== darkModeState) {
            setDarkModeState(isDark);
        }
    };

    // Initial check
    checkDarkMode();

    // Use MutationObserver to watch for class changes on <html>
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Cleanup observer on component unmount
    return () => observer.disconnect();

  }, [darkModeState]); // Depend on darkModeState to re-run if needed externally

  // Update useEffect for drawing to depend on darkModeState as well
  useEffect(() => {
    // Ensure darkModeState is not null before drawing
    if (mappedPixelData && gridDimensions && canvasRef.current && darkModeState !== null) {
      ensureSquareGridCanvas(canvasRef.current, gridDimensions.N, gridDimensions.M);
      drawPixelatedCanvas(
        mappedPixelData,
        canvasRef.current,
        gridDimensions,
        highlightColorKey,
        isHighlighting,
        showGrid,
        transparentExternal,
        isolateColorKey,
        draftRect ?? selectionRect,
        boardBackgroundColor
      );
    }
  }, [mappedPixelData, gridDimensions, canvasRef, darkModeState, highlightColorKey, isHighlighting, showGrid, transparentExternal, isolateColorKey, draftRect, selectionRect, boardBackgroundColor]);

  // 处理高亮效果
  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      // 0.3秒后结束高亮
      const timer = setTimeout(() => {
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  // --- 鼠标事件处理 ---
  
  // 鼠标移动时显示提示
  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
  };

  // 鼠标离开时隐藏提示
  const handleMouseLeave = () => {
    // 鼠标离开时总是隐藏tooltip
    onInteraction(0, 0, 0, 0, false, true);
  };

  const cellFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !gridDimensions) return null;
    const rect = canvas.getBoundingClientRect();
    const { N, M } = gridDimensions;
    const i = Math.floor(((clientX - rect.left) / rect.width) * N);
    const j = Math.floor(((clientY - rect.top) / rect.height) * M);
    if (i < 0 || j < 0 || i >= N || j >= M) return null;
    return { i, j };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!selectionMode || !interactive) return;
    if (event.button !== 0) return;
    const cell = cellFromClient(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = true;
    marqueeRef.current = {
      pointerId: event.pointerId,
      startCell: cell,
    };
    setDraftRect({ c0: cell.i, r0: cell.j, c1: cell.i, r1: cell.j });
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!selectionMode) return;
    const session = marqueeRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const cell = cellFromClient(event.clientX, event.clientY);
    if (!cell) return;
    setDraftRect({
      c0: session.startCell.i,
      r0: session.startCell.j,
      c1: cell.i,
      r1: cell.j,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!selectionMode) return;
    const session = marqueeRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    marqueeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const cell = cellFromClient(event.clientX, event.clientY) ?? session.startCell;
    const rect = normalizeGridRect({
      c0: session.startCell.i,
      r0: session.startCell.j,
      c1: cell.i,
      r1: cell.j,
    });
    setDraftRect(null);
    onMarqueeComplete?.(rect, event.clientX, event.clientY);
  };

  const handleContextMenu = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!selectionMode) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectionContextMenu?.(event.clientX, event.clientY);
  };

  // 鼠标点击处理（用于手动上色模式）
  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (selectionMode || suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // 鼠标点击行为保持不变：
    // 手动模式下：上色
    // 非手动模式下：切换tooltip
    onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, isManualColoringMode);
  };

  // --- 触摸事件处理 ---
  // 用于检测触摸移动的参考
  const handleTouchStart = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    // 记录起始位置并重置移动标志
    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      pageX: touch.pageX,
      pageY: touch.pageY
    };
    touchMovedRef.current = false;

    // 在非手动模式下，触摸开始时仍然可以立即显示/切换tooltip，提供即时反馈
    if (!isManualColoringMode) {
        onInteraction(touch.clientX, touch.clientY, touch.pageX, touch.pageY, false);
    }
    // 注意：此处不再触发手动上色 (isClick: true)
  };
  
  // 触摸移动时检测是否需要隐藏提示
  const handleTouchMove = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch || !touchStartPosRef.current) return;
    
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    
    // 如果移动超过阈值，则标记为已移动，并隐藏tooltip
    // 增加一个稍大的阈值，以更好地区分点击和微小的手指抖动/滑动意图
    if (!touchMovedRef.current && (dx > 10 || dy > 10)) {
      touchMovedRef.current = true;
      // 一旦确定是移动，就隐藏tooltip
      onInteraction(0, 0, 0, 0, false, true);
    }
  };
  
  // 触摸结束时不再自动隐藏提示框
  const handleTouchEnd = () => {
    if (selectionMode) {
      touchStartPosRef.current = null;
      touchMovedRef.current = false;
      return;
    }
    // 检查是否是手动模式，并且触摸没有移动（判定为点击）
    if (isManualColoringMode && !touchMovedRef.current && touchStartPosRef.current) {
      // 使用触摸开始时的坐标来执行上色操作
      const { x, y, pageX, pageY } = touchStartPosRef.current;
      onInteraction(x, y, pageX, pageY, true); // isClick: true 表示执行上色
    }
    // 如果是非手动模式下的点击 (isManualColoringMode=false, touchMovedRef=false)
    // Tooltip 的显示/隐藏切换已在 touchstart 处理，touchend 时无需额外操作

    // 重置触摸状态
    touchStartPosRef.current = null;
    touchMovedRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={interactive ? handleMouseMove : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
      onClick={interactive ? handleClick : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerUp : undefined}
      onContextMenu={interactive ? handleContextMenu : undefined}
      onTouchStart={interactive ? handleTouchStart : undefined}
      onTouchMove={interactive ? handleTouchMove : undefined}
      onTouchEnd={interactive ? handleTouchEnd : undefined}
      onTouchCancel={interactive ? handleTouchEnd : undefined}
      className={`block rounded border border-gray-300 dark:border-gray-600 ${
        !interactive ? 'cursor-default' : selectionMode ? 'cursor-crosshair' : isManualColoringMode ? 'cursor-pointer' : 'cursor-grab'
      }`}
      style={{
        imageRendering: 'pixelated',
        touchAction: selectionMode ? 'none' : undefined,
      }}
    />
  );
};

export default PixelatedPreviewCanvas; 