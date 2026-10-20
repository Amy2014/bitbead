'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const PAN_THRESHOLD_SQ = 36;

interface ZoomPanViewportProps {
  children: React.ReactNode;
  className?: string;
  /** 为 false 时左键不平移，留给点选/上色；改用中键或右键拖动 */
  allowLeftPan?: boolean;
  /** 为 false 时右键不平移，留给选区菜单 */
  allowRightPan?: boolean;
  /** 内容或布局变化时重新自适应完整显示 */
  fitKey?: string | number;
}

export default function ZoomPanViewport({
  children,
  className = '',
  allowLeftPan = true,
  allowRightPan = true,
  fitKey,
}: ZoomPanViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const userZoomedRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const fitContent = useCallback(() => {
    const vp = viewportRef.current;
    const inner = innerRef.current;
    if (!vp || !inner) return;
    const cs = getComputedStyle(vp);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const vw = vp.clientWidth - padL - padR;
    const vh = vp.clientHeight - padT - padB;
    const cw = inner.offsetWidth;
    const ch = inner.offsetHeight;
    if (cw < 2 || ch < 2 || vw < 2 || vh < 2) return;
    const scale = Math.min(vw / cw, vh / ch);
    const x = padL + (vw - cw * scale) / 2;
    const y = padT + (vh - ch * scale) / 2;
    setTransform({ x, y, scale });
  }, []);

  useEffect(() => {
    userZoomedRef.current = false;
    const id = requestAnimationFrame(() => fitContent());
    return () => cancelAnimationFrame(id);
  }, [fitKey, fitContent]);

  useEffect(() => {
    const vp = viewportRef.current;
    const inner = innerRef.current;
    if (!vp || !inner) return;

    const onResize = () => {
      if (!userZoomedRef.current) fitContent();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(vp);
    ro.observe(inner);
    inner.querySelectorAll('img, canvas').forEach((el) => ro.observe(el));

    const imgs = inner.querySelectorAll('img');
    const onLoad = () => {
      if (!userZoomedRef.current) fitContent();
    };
    imgs.forEach((img) => img.addEventListener('load', onLoad));

    return () => {
      ro.disconnect();
      imgs.forEach((img) => img.removeEventListener('load', onLoad));
    };
  }, [fitKey, children, fitContent]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      userZoomedRef.current = true;
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
    if (button === 2) return allowRightPan;
    return button === 1;
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
      userZoomedRef.current = true;
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
        if (suppressClickRef.current || !allowRightPan) event.preventDefault();
      }}
      onDoubleClick={() => {
        userZoomedRef.current = false;
        fitContent();
      }}
    >
      <div
        ref={innerRef}
        className="inline-block origin-top-left will-change-transform"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
