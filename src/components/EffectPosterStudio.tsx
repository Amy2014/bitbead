'use client';

import React, { useMemo, useState } from 'react';

type Finish = 'none' | 'gloss' | 'sequin' | 'velvet' | 'frost';

const FINISHES: { id: Finish; label: string }[] = [
  { id: 'none', label: '不使用' },
  { id: 'gloss', label: '提光' },
  { id: 'sequin', label: '亮片' },
  { id: 'velvet', label: '绒面' },
  { id: 'frost', label: '磨砂' },
];

const BACKGROUNDS: { id: string; label: string; color: string }[] = [
  { id: 'warm', label: '暖月', color: '#f3ead9' },
  { id: 'cool', label: '冷白', color: '#eef1f4' },
  { id: 'cream', label: '米色', color: '#e8dcc8' },
  { id: 'ink', label: '深色', color: '#2b2a28' },
  { id: 'black', label: '黑色', color: '#111111' },
  { id: 'wood', label: '木纹', color: '#c4a574' },
];

const FINISH_FILTER: Record<Finish, string> = {
  none: 'none',
  gloss: 'brightness(1.08) contrast(1.14) saturate(1.06)',
  sequin: 'none',
  velvet: 'brightness(0.96) contrast(0.88) saturate(0.92)',
  frost: 'brightness(1.02) contrast(1.08) saturate(0.72)',
};

interface EffectPosterStudioProps {
  isOpen: boolean;
  artworkSrc: string | null;
  onClose: () => void;
}

export default function EffectPosterStudio({ isOpen, artworkSrc, onClose }: EffectPosterStudioProps) {
  const [finish, setFinish] = useState<Finish>('none');
  const [showBorder, setShowBorder] = useState(false);
  const [radius, setRadius] = useState(8);
  const [showShadow, setShowShadow] = useState(false);
  const [angle, setAngle] = useState(150);
  const [distance, setDistance] = useState(8);
  const [bgId, setBgId] = useState('warm');
  const [customBg, setCustomBg] = useState('#f3ead9');
  const [logoOpacity, setLogoOpacity] = useState(35);

  const bgColor = bgId === 'custom' ? customBg : BACKGROUNDS.find((b) => b.id === bgId)?.color || '#f3ead9';
  const isDarkBg = useMemo(() => {
    const hex = bgColor.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  }, [bgColor]);

  const dropShadowCss = useMemo(() => {
    if (!showShadow) return '';
    const { x, y, blur } = shadowOffset(angle, distance, 1);
    return `drop-shadow(${x}px ${y}px ${blur}px rgba(40, 28, 18, 0.38))`;
  }, [showShadow, angle, distance]);

  const finishCss = FINISH_FILTER[finish];
  const usesFinishFilter = Boolean(finishCss) && finishCss !== 'none';
  const artFilter = [usesFinishFilter ? finishCss : '', dropShadowCss].filter(Boolean).join(' ') || 'none';

  const downloadPoster = async () => {
    if (!artworkSrc) return;
    const img = new Image();
    img.src = artworkSrc;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const W = 1500;
    const H = 2000;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const side = Math.round(W * 0.11);
    const top = Math.round(H * 0.07);
    const footer = Math.round(H * 0.12);
    const boxW = W - side * 2;
    const boxH = H - top - footer;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const artW = img.width * scale;
    const artH = img.height * scale;
    const artX = side + (boxW - artW) / 2;
    const artY = top + (boxH - artH) / 2;
    const r = (radius / 100) * Math.min(artW, artH) * 0.08;

    if (showShadow) {
      const { x, y, blur } = shadowOffset(angle, distance, 2);
      ctx.save();
      ctx.shadowOffsetX = x;
      ctx.shadowOffsetY = y;
      ctx.shadowBlur = blur;
      ctx.shadowColor = 'rgba(40, 28, 18, 0.38)';
      ctx.drawImage(img, artX, artY, artW, artH);
      ctx.restore();
    }

    ctx.save();
    if (showBorder && r > 0) {
      roundRect(ctx, artX, artY, artW, artH, r);
      ctx.clip();
    }
    ctx.filter = usesFinishFilter ? finishCss : 'none';
    ctx.drawImage(img, artX, artY, artW, artH);
    ctx.restore();

    if (finish === 'sequin') {
      ctx.save();
      roundRect(ctx, artX, artY, artW, artH, showBorder ? r : 0);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighten';
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 180; i++) {
        const px = artX + Math.random() * artW;
        const py = artY + Math.random() * artH;
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ffe8a3';
        ctx.beginPath();
        ctx.arc(px, py, Math.random() * 1.6 + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = logoOpacity / 100;
    ctx.fillStyle = isDarkBg ? '#f4efe6' : '#5a5348';
    ctx.textAlign = 'center';
    ctx.font = '600 28px "Songti SC", "STSong", serif';
    ctx.fillText('对色局', W / 2, H - footer * 0.55);
    ctx.font = '400 16px Palatino, "Palatino Linotype", serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('paint everything', W / 2, H - footer * 0.32);
    ctx.restore();

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = '对色局-拼豆效果图.png';
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex bg-[#f6efe4] text-[#3d342c]">
      <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
        <div
          className="flex aspect-[3/4] h-[min(90vh,calc(100%-1.5rem))] w-auto max-w-full flex-col overflow-hidden rounded-[28px]"
          style={{
            background: bgColor,
            boxShadow: 'inset 0 0 0 1px rgba(80,60,40,0.06), 0 24px 60px rgba(90,70,40,0.12)',
          }}
        >
          <div className="relative mx-[11%] mt-[7%] min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              {artworkSrc ? (
                <img
                  src={artworkSrc}
                  alt="拼豆效果图"
                  className="block max-h-full max-w-full object-contain"
                  style={{
                    borderRadius: showBorder ? `${radius * 0.45}%` : 0,
                    filter: artFilter,
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white/40 text-sm text-[#8a7f72]">
                  暂无效果图
                </div>
              )}
            </div>
            {finish === 'sequin' && artworkSrc && (
              <div
                className="pointer-events-none absolute inset-0 mix-blend-lighten"
                style={{
                  borderRadius: showBorder ? `${radius * 0.45}%` : 0,
                    backgroundImage:
                      'radial-gradient(circle at 20% 30%, rgba(255,255,255,.9) 0 1px, transparent 2px), radial-gradient(circle at 70% 45%, rgba(255,236,180,.85) 0 1px, transparent 2px), radial-gradient(circle at 40% 80%, rgba(255,255,255,.75) 0 1px, transparent 2px)',
                    backgroundSize: '42px 42px, 36px 36px, 50px 50px',
                    opacity: 0.85,
                }}
              />
            )}
          </div>
          <div
            className="flex h-[12%] shrink-0 flex-col items-center justify-center text-center leading-tight"
            style={{ color: isDarkBg ? '#f4efe6' : '#5a5348', opacity: logoOpacity / 100 }}
          >
            <div className="font-[Georgia,'Songti SC','STSong',serif] text-[15px] tracking-[0.28em]">对色局</div>
            <div className="mt-1 font-[Palatino,'Palatino Linotype',serif] text-[10px] tracking-[0.38em] uppercase">
              paint everything
            </div>
          </div>
        </div>
      </div>

      <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[#eadfd0] bg-[#fbf6ef] px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide">效果图工坊</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs text-[#8a7f72] hover:bg-[#f0e6d8]"
          >
            返回编辑
          </button>
        </div>

        <Section title="材质">
          <button
            type="button"
            onClick={downloadPoster}
            disabled={!artworkSrc}
            className="mb-3 w-full rounded-full bg-[#3d342c] py-2.5 text-sm text-[#fbf6ef] shadow-sm transition hover:bg-[#2b241e] disabled:opacity-40"
          >
            生成并下载预览图
          </button>
          <div className="grid grid-cols-5 gap-1.5">
            {FINISHES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFinish(item.id)}
                className={`rounded-xl py-2 text-[11px] transition ${
                  finish === item.id
                    ? 'bg-[#3d342c] text-[#fbf6ef]'
                    : 'bg-white text-[#6b6258] ring-1 ring-[#eadfd0] hover:bg-[#f3eadf]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {finish === 'none' && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#8a7f72]">
              不加熨烫滤镜，按拼豆格子原色显示，方便对色。
            </p>
          )}
        </Section>

        <Section title="熨烫画边">
          <Toggle label="圆角画边" on={showBorder} onChange={setShowBorder} />
          <Slider label="弧度" value={radius} min={0} max={50} suffix={`${radius}%`} onChange={setRadius} />
        </Section>

        <Section title="阴影">
          <Toggle label="显示投影" on={showShadow} onChange={setShowShadow} />
          <Slider label="角度" value={angle} min={0} max={360} suffix={`${angle}°`} onChange={setAngle} />
          <Slider label="距离" value={distance} min={0} max={40} suffix={`${distance}`} onChange={setDistance} />
        </Section>

        <Section title="画面">
          <p className="mb-2 text-[11px] text-[#8a7f72]">背景</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {BACKGROUNDS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => setBgId(item.id)}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-[#fbf6ef] ${
                  bgId === item.id ? 'ring-2 ring-[#3d342c]' : 'ring-1 ring-[#d8cbb8]'
                }`}
                style={{ background: item.color }}
              />
            ))}
            <label
              className={`relative h-8 w-8 overflow-hidden rounded-full ring-offset-2 ring-offset-[#fbf6ef] ${
                bgId === 'custom' ? 'ring-2 ring-[#3d342c]' : 'ring-1 ring-[#d8cbb8]'
              }`}
              style={{ background: customBg }}
              title="自定义"
            >
              <input
                type="color"
                value={customBg}
                onChange={(e) => {
                  setCustomBg(e.target.value);
                  setBgId('custom');
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <p className="mb-1 text-[11px] text-[#8a7f72]">品牌文字</p>
          <p className="mb-3 text-sm tracking-[0.2em] text-[#3d342c]">对色局</p>
          <Slider label="透明度" value={logoOpacity} min={10} max={100} suffix={`${logoOpacity}%`} onChange={setLogoOpacity} />
        </Section>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 border-b border-[#eadfd0] pb-4 last:border-b-0">
      <h3 className="mb-3 text-xs font-medium tracking-wide text-[#6b6258]">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-3 flex items-center justify-between text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-[#3d342c]' : 'bg-[#d8cbb8]'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 block text-xs text-[#6b6258]">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span>{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#3d342c]"
      />
    </label>
  );
}

function shadowOffset(angle: number, distance: number, scale: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(rad) * distance * scale),
    y: Math.round(Math.sin(rad) * distance * scale),
    blur: Math.max(8, distance * 1.6 * scale),
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
