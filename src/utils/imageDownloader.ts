import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getDisplayColorKey, getColorKeyByHex, ColorSystem, colorSystemOptions } from './colorSystemUtils';

// 用于获取对比色的工具函数 - 从page.tsx复制
function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000'; // Default to black
  // Simple brightness check (Luma formula Y = 0.2126 R + 0.7152 G + 0.0722 B)
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF'; // Dark background -> white text, Light background -> black text
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 用于排序颜色键的函数 - 从page.tsx复制
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

// 导出CSV hex数据的函数
export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error("导出失败: 映射数据或尺寸无效。");
    alert("无法导出CSV，数据未生成或无效。");
    return;
  }

  const { N, M } = gridDimensions;
  
  // 生成CSV内容，每行代表图纸的一行
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];
      if (cellData && !cellData.isExternal) {
        // 内部单元格，记录hex颜色值
        rowData.push(cellData.color);
      } else {
        // 外部单元格或空白，使用特殊标记
        rowData.push('TRANSPARENT');
      }
    }
    csvLines.push(rowData.join(','));
  }

  // 创建CSV内容
  const csvContent = csvLines.join('\n');
  
  // 创建并下载CSV文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${N}x${M}-${selectedColorSystem}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 释放URL对象
  URL.revokeObjectURL(url);
  
  console.log("CSV数据导出完成");
}

// 导入CSV hex数据的函数
export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }
        
        // 解析CSV内容
        const lines = text.trim().split('\n');
        const M = lines.length; // 行数
        
        if (M === 0) {
          reject(new Error('CSV文件为空'));
          return;
        }
        
        // 解析第一行获取列数
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 列数
        
        if (N === 0) {
          reject(new Error('CSV文件格式无效'));
          return;
        }
        
        // 创建映射数据
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 确保每行都有正确的列数
          if (rowData.length !== N) {
            reject(new Error(`第${row + 1}行的列数不匹配，期望${N}列，实际${rowData.length}列`));
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              // 外部/透明单元格
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // 验证hex颜色格式
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第${row + 1}行第${col + 1}列的颜色值无效：${cellValue}`));
                return;
              }
              
              // 内部单元格
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 返回解析结果
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`解析CSV文件失败：${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

// 下载图片的主函数
export async function downloadImage({
  mappedPixelData,
  gridDimensions,
  colorCounts,
  totalBeadCount,
  options,
  activeBeadPalette,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
}): Promise<void> {
  if (!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0) {
    console.error("下载失败: 映射数据或尺寸无效。");
    alert("无法下载图纸，数据未生成或无效。");
    return;
  }
  if (!colorCounts) {
    console.error("下载失败: 色号统计数据无效。");
    alert("无法下载图纸，色号统计数据未生成或无效。");
    return;
  }
  
  const processDownload = () => {
    const { N, M } = gridDimensions;
    const downloadCellSize = 30;
    const { showGrid, gridInterval, showCoordinates, gridLineColor, includeStats, showCellNumbers = true } = options;
    const paletteName = colorSystemOptions.find((item) => item.key === selectedColorSystem)?.name ?? selectedColorSystem;
    const colorKeys = Object.keys(colorCounts).sort(sortColorKeys);
    const materialCount = colorKeys.length;

    const pagePad = 28;
    const axisLabelSize = showCoordinates ? 28 : 0;
    const gridWidth = N * downloadCellSize;
    const gridHeight = M * downloadCellSize;
    const gridOriginX = pagePad + axisLabelSize;
    const gridOriginY = pagePad + axisLabelSize;
    const downloadWidth = gridOriginX + gridWidth + pagePad;

    const footerGap = 22;
    const titleFontSize = 22;
    const wordmarkFontSize = 13;
    const metaFontSize = 13;
    const totalFontSize = 28;
    const footerBlockHeight = 78;

    const chipFontSize = 12;
    const chipSwatch = 14;
    const chipHeight = 26;
    const chipGapX = 16;
    const chipGapY = 10;
    const materialsTitleHeight = 28;
    let materialsHeight = 0;
    if (includeStats && colorKeys.length > 0) {
      const measureCtx = document.createElement('canvas').getContext('2d');
      let rows = 1;
      if (measureCtx) {
        measureCtx.font = `500 ${chipFontSize}px system-ui, -apple-system, sans-serif`;
        let chipX = 0;
        colorKeys.forEach((key) => {
          const label = `${getColorKeyByHex(key, selectedColorSystem)} × ${colorCounts[key].count}`;
          const chipWidth = chipSwatch + 6 + measureCtx.measureText(label).width + 4;
          if (chipX + chipWidth > gridWidth && chipX !== 0) {
            chipX = 0;
            rows += 1;
          }
          chipX += chipWidth + chipGapX;
        });
      }
      materialsHeight = materialsTitleHeight + rows * (chipHeight + chipGapY);
    }

    const downloadHeight =
      gridOriginY + gridHeight + footerGap + footerBlockHeight + (includeStats ? 18 + materialsHeight : 0) + pagePad;

    const downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = downloadWidth;
    downloadCanvas.height = downloadHeight;
    const context = downloadCanvas.getContext('2d');
    if (!context) {
      console.error("下载失败: 无法创建临时 Canvas Context。");
      alert("无法下载图纸。");
      return;
    }

    const ctx = context;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, downloadWidth, downloadHeight);

    const fontSize = Math.max(8, Math.floor(downloadCellSize * 0.38));

    if (showCoordinates) {
      ctx.fillStyle = '#8A8A8A';
      ctx.font = `500 12px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        if ((i + 1) % gridInterval === 0 || i === 0) {
          ctx.fillText(
            (i + 1).toString(),
            gridOriginX + i * downloadCellSize + downloadCellSize / 2,
            pagePad + axisLabelSize / 2
          );
        }
      }
      for (let j = 0; j < M; j++) {
        if ((j + 1) % gridInterval === 0 || j === 0) {
          ctx.fillText(
            (j + 1).toString(),
            pagePad + axisLabelSize / 2,
            gridOriginY + j * downloadCellSize + downloadCellSize / 2
          );
        }
      }
    }

    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const cellData = mappedPixelData[j][i];
        const drawX = gridOriginX + i * downloadCellSize;
        const drawY = gridOriginY + j * downloadCellSize;

        if (cellData && !cellData.isExternal) {
          const cellColor = cellData.color || '#FFFFFF';
          ctx.fillStyle = cellColor;
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);
          if (showCellNumbers) {
            const cellKey = getDisplayColorKey(cellData.color || '#FFFFFF', selectedColorSystem);
            ctx.fillStyle = getContrastColor(cellColor);
            ctx.fillText(cellKey, drawX + downloadCellSize / 2, drawY + downloadCellSize / 2);
          }
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);
        }

        ctx.strokeStyle = '#D0D0D0';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(drawX + 0.5, drawY + 0.5, downloadCellSize, downloadCellSize);
      }
    }

    if (showGrid) {
      ctx.strokeStyle = gridLineColor;
      ctx.lineWidth = 1.25;
      for (let i = gridInterval; i < N; i += gridInterval) {
        const lineX = gridOriginX + i * downloadCellSize;
        ctx.beginPath();
        ctx.moveTo(lineX, gridOriginY);
        ctx.lineTo(lineX, gridOriginY + gridHeight);
        ctx.stroke();
      }
      for (let j = gridInterval; j < M; j += gridInterval) {
        const lineY = gridOriginY + j * downloadCellSize;
        ctx.beginPath();
        ctx.moveTo(gridOriginX, lineY);
        ctx.lineTo(gridOriginX + gridWidth, lineY);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(gridOriginX + 0.5, gridOriginY + 0.5, gridWidth, gridHeight);

    const footerY = gridOriginY + gridHeight + footerGap;
    ctx.fillStyle = '#111111';
    ctx.font = `700 ${titleFontSize}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('对色局', gridOriginX, footerY);

    ctx.fillStyle = '#6B6B6B';
    ctx.font = `400 ${wordmarkFontSize}px Palatino, "Palatino Linotype", "Times New Roman", serif`;
    ctx.textBaseline = 'alphabetic';
    drawTrackedText(ctx, 'PAINT EVERYTHING', gridOriginX, footerY + 42, 2.4, 'left');

    ctx.fillStyle = '#4B4B4B';
    ctx.font = `400 ${metaFontSize}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(`${paletteName} · ${N} × ${M} 格`, gridOriginX, footerY + 50);

    ctx.fillStyle = '#111111';
    ctx.font = `700 ${totalFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(totalBeadCount.toLocaleString(), gridOriginX + gridWidth, footerY);
    ctx.fillStyle = '#888888';
    ctx.font = `400 12px system-ui, -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText('颗', gridOriginX + gridWidth, footerY + 34);

    if (includeStats && colorKeys.length > 0) {
      const materialsY = footerY + footerBlockHeight + 10;
      ctx.fillStyle = '#888888';
      ctx.font = `500 12px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`色号 (${materialCount})`, gridOriginX, materialsY);

      ctx.font = `500 ${chipFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'middle';
      let chipX = gridOriginX;
      let chipY = materialsY + materialsTitleHeight;
      const chipMaxX = gridOriginX + gridWidth;

      colorKeys.forEach((key) => {
        const cellData = colorCounts[key];
        const label = `${getColorKeyByHex(key, selectedColorSystem)} × ${cellData.count}`;
        const labelWidth = ctx.measureText(label).width;
        const chipWidth = chipSwatch + 6 + labelWidth + 4;
        if (chipX + chipWidth > chipMaxX && chipX !== gridOriginX) {
          chipX = gridOriginX;
          chipY += chipHeight + chipGapY;
        }

        ctx.fillStyle = cellData.color;
        ctx.strokeStyle = '#C8C8C8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(chipX, chipY, chipSwatch, chipSwatch, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#333333';
        ctx.textAlign = 'left';
        ctx.fillText(label, chipX + chipSwatch + 6, chipY + chipSwatch / 2);
        chipX += chipWidth + chipGapX;
      });
    }

    try {
      const dataURL = downloadCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = showCellNumbers
        ? `对色局-${paletteName}-${N}x${M}.png`
        : `对色局-${paletteName}-${N}x${M}-像素.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (options.exportCsv) {
        exportCsvData({
          mappedPixelData,
          gridDimensions,
          selectedColorSystem
        });
      }
    } catch (e) {
      console.error("下载图纸失败:", e);
      alert("无法生成图纸下载链接。");
    }
  };
  
  processDownload();
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'right' | 'center' = 'left'
) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + tracking * Math.max(0, chars.length - 1);
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + tracking;
  }
} 
