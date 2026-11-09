const WATERMARK_TEXT = '@对色局 小红书';

/** 斜 45° 重复水印：空心字 + 半透明白描边（浅底再衬一层淡灰，保证白图纸上也能看见）。 */
export function drawDiagonalWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const minSide = Math.min(width, height);
  const fontSize = Math.max(18, Math.round(minSide * 0.03));
  const whiteStroke = Math.max(1.2, fontSize * 0.08);
  const shadeStroke = whiteStroke + Math.max(0.8, fontSize * 0.04);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.font = `500 ${fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.fillStyle = 'rgba(0,0,0,0)';

  const textWidth = ctx.measureText(WATERMARK_TEXT).width;
  const stepX = textWidth + fontSize * 5;
  const stepY = fontSize * 6;
  const cover = Math.sqrt(width * width + height * height) + stepX;

  for (let row = 0, y = -cover; y <= cover; y += stepY, row += 1) {
    const stagger = (row % 2) * (stepX / 2);
    for (let x = -cover; x <= cover; x += stepX) {
      const px = x + stagger;
      ctx.lineWidth = shadeStroke;
      ctx.strokeStyle = 'rgba(40,40,40,0.16)';
      ctx.strokeText(WATERMARK_TEXT, px, y);
      ctx.lineWidth = whiteStroke;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.strokeText(WATERMARK_TEXT, px, y);
    }
  }

  ctx.restore();
}

function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function withWatermark(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  drawDiagonalWatermark(ctx, canvas.width, canvas.height);
  return canvas;
}

/** 同一操作里导出原图和带水印副本。 */
export function downloadOriginalAndWatermarked(
  canvas: HTMLCanvasElement,
  filename: string
): void {
  const base = filename.replace(/\.png$/i, '');
  downloadCanvasPng(canvas, `${base}.png`);
  const watermarked = withWatermark(canvas);
  if (!watermarked) return;
  downloadCanvasPng(watermarked, `${base}-水印.png`);
}
