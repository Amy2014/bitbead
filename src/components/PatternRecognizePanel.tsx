'use client';

import React, { useState } from 'react';
import GridAlignPanel, { type GridAlignValues } from './GridAlignPanel';
import PatternOcrCalibratePanel from './PatternOcrCalibratePanel';
import { detectGridFromImageData, loadImageData } from '../utils/patternGridDetect';
import { recognizePatternGrid, type PatternCellThumb } from '../utils/patternOcr';
import { MappedPixel } from '../utils/pixelation';
import type { ColorSystem } from '../utils/colorSystemUtils';

interface PatternRecognizePanelProps {
  imageSrc: string;
  values: GridAlignValues;
  onChange: (next: GridAlignValues) => void;
  selectedColorSystem: ColorSystem;
  onComplete: (payload: {
    mappedData: MappedPixel[][];
    gridDimensions: { N: number; M: number };
  }) => void;
  onCancel: () => void;
}

type Step = 'align' | 'ocr' | 'calibrate';

export default function PatternRecognizePanel({
  imageSrc,
  values,
  onChange,
  selectedColorSystem,
  onComplete,
  onCancel,
}: PatternRecognizePanelProps) {
  const [step, setStep] = useState<Step>('align');
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({ done: 0, total: 1 });
  const [mappedData, setMappedData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [thumbs, setThumbs] = useState<PatternCellThumb[]>([]);

  const handleAutoDetect = async () => {
    setAutoDetecting(true);
    try {
      const imageData = await loadImageData(imageSrc);
      const detected = detectGridFromImageData(imageData);
      if (!detected) {
        alert('没能自动估出格子，请手动调格子大小和偏移。');
        return;
      }
      onChange({
        cellSize: detected.cellSize,
        offsetX: detected.offsetX,
        offsetY: detected.offsetY,
        marginRight: 0,
        marginBottom: 0,
      });
    } catch (error) {
      alert(`自动切格失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleRecognize = async () => {
    setStep('ocr');
    setOcrProgress({ done: 0, total: 1 });
    try {
      const imageData = await loadImageData(imageSrc);
      const result = await recognizePatternGrid(imageData, values, (done, total) => {
        setOcrProgress({ done, total });
      });
      if (result.gridDimensions.N < 1 || result.gridDimensions.M < 1) {
        alert('当前网格没有完整格子。');
        setStep('align');
        return;
      }
      setMappedData(result.mappedData);
      setGridDimensions(result.gridDimensions);
      setThumbs(result.thumbs);
      setStep('calibrate');
    } catch (error) {
      console.error(error);
      alert(`识别失败：${error instanceof Error ? error.message : String(error)}`);
      setStep('align');
    }
  };

  if (step === 'ocr') {
    const pct = Math.round((ocrProgress.done / Math.max(1, ocrProgress.total)) * 100);
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-sm text-gray-600 dark:text-gray-300">
        <p>正在逐格 OCR 识别色号（词典 A1–M15，认不出则为空）…</p>
        <div className="h-2 w-64 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="tabular-nums text-xs">
          {ocrProgress.done} / {ocrProgress.total}（{pct}%）
        </p>
        <p className="text-[11px] text-gray-400">每个格子单独识别，格子多时会较慢</p>
      </div>
    );
  }

  if (step === 'calibrate' && mappedData && gridDimensions) {
    return (
      <PatternOcrCalibratePanel
        mappedData={mappedData}
        thumbs={thumbs}
        imageSrc={imageSrc}
        selectedColorSystem={selectedColorSystem}
        onSave={(next) => onComplete({ mappedData: next, gridDimensions })}
        onCancel={onCancel}
      />
    );
  }

  return (
    <GridAlignPanel
      imageSrc={imageSrc}
      values={values}
      onChange={onChange}
      onConfirm={handleRecognize}
      onCancel={onCancel}
      confirmLabel="开始识别色号"
      cancelLabel="取消识别"
      bannerText="识别现成图纸：先自动或手动把网格对准印线，再 OCR 色号。不对色、不走像素化。"
      onAutoDetect={handleAutoDetect}
      autoDetecting={autoDetecting}
    />
  );
}
