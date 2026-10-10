'use client';

import React, { useEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const PAN_THRESHOLD_SQ = 36;

interface ZoomPanViewportProps {
  children: React.ReactNode;
  className?: string;
  /** 为 false 时左键不平移，留给点选/上色；改用中键或右键拖动 */
  allowLeftPan?: boolean;
}

export default function ZoomPanViewport({
  children,
  className = '',
  allowLeftPan = true,
}: ZoomPanViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const { x, y, scale } = transformRef.current;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      if (Math.abs(next - scale) < 1e-6) return;
      setTransform({
        scale: next,
        x: mx - ((mx - x) / scale) * next,
        y: my - ((my - y) / scale) * next,
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const isPanButton = (button: number) => {
    if (button === 0) return allowLeftPan;
    return button === 1 || button === 2;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanButton(event.button)) return;
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: transformRef.current.x,
      origY: transformRef.current.y,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < PAN_THRESHOLD_SQ) return;
    if (!drag.moved) {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.moved = true;
      suppressClickRef.current = true;
    }
    setTransform({
      scale: transformRef.current.scale,
      x: drag.origX + dx,
      y: drag.origY + dy,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    suppressClickRef.current = false;
  };

  return (
    <div
      ref={viewportRef}
      className={`relative overflow-hidden touch-none ${allowLeftPan ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      onContextMenu={(event) => {
        if (suppressClickRef.current) event.preventDefault();
      }}
    >
      <div
        className="w-full origin-top-left will-change-transform"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
