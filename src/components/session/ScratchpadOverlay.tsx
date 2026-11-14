'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, RotateCcw, Trash2, X } from 'lucide-react';
import { soundEngine } from '@/services/sound/soundEngine';

export interface ScratchpadPoint {
  x: number; // Normalized 0..1 relative to canvas CSS width
  y: number; // Normalized 0..1 relative to canvas CSS height
}

export interface ScratchpadStroke {
  tool: 'pen' | 'eraser';
  points: ScratchpadPoint[];
  width: number;
}

interface ScratchpadOverlayProps {
  isOpen: boolean;
  questionId: string;
  strokes: ScratchpadStroke[];
  onChangeStrokes: (questionId: string, nextStrokes: ScratchpadStroke[]) => void;
  onClose: () => void;
}

export const ScratchpadOverlay: React.FC<ScratchpadOverlayProps> = ({
  isOpen,
  questionId,
  strokes,
  onChangeStrokes,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const activeStrokeRef = useRef<ScratchpadStroke | null>(null);
  const isDrawingRef = useRef<boolean>(false);

  const renderStrokes = useCallback(
    (allStrokes: ScratchpadStroke[], inProgress?: ScratchpadStroke | null) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

      const targetW = Math.round(width * dpr);
      const targetH = Math.round(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const list = inProgress ? [...allStrokes, inProgress] : allStrokes;

      for (const stroke of list) {
        if (stroke.points.length === 0) continue;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.width;

        if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#F4F0EA';
          ctx.fillStyle = '#F4F0EA';
        }

        const pts = stroke.points.map((p) => ({
          x: p.x * width,
          y: p.y * height,
        }));

        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }

        ctx.restore();
      }

      ctx.restore();
    },
    []
  );

  // Redraw when strokes or open state changes
  useEffect(() => {
    renderStrokes(strokes, activeStrokeRef.current);
  }, [strokes, isOpen, renderStrokes]);

  // Keep canvas sized and sharp on container resize or window DPR changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      renderStrokes(strokes, activeStrokeRef.current);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [strokes, renderStrokes]);

  const handleUndo = useCallback(() => {
    if (strokes.length === 0) return;
    soundEngine.play('click');
    onChangeStrokes(questionId, strokes.slice(0, -1));
  }, [questionId, strokes, onChangeStrokes]);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    soundEngine.play('click');
    onChangeStrokes(questionId, []);
  }, [questionId, strokes, onChangeStrokes]);

  // Scratchpad tool shortcuts while Scratchpad is open (Z = Undo, C = Clear, P = Pen, E = Eraser)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (key === 'c') {
        e.preventDefault();
        handleClear();
      } else if (key === 'p') {
        e.preventDefault();
        soundEngine.play('click');
        setActiveTool('pen');
      } else if (key === 'e') {
        e.preventDefault();
        soundEngine.play('click');
        setActiveTool('eraser');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleUndo, handleClear]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): ScratchpadPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const pt = getNormalizedPoint(e);
    const newStroke: ScratchpadStroke = {
      tool: activeTool,
      points: [pt],
      width: activeTool === 'eraser' ? 24 : 2.25,
    };
    isDrawingRef.current = true;
    activeStrokeRef.current = newStroke;
    renderStrokes(strokes, newStroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen || !isDrawingRef.current || !activeStrokeRef.current) return;
    e.preventDefault();

    const pt = getNormalizedPoint(e);
    activeStrokeRef.current = {
      ...activeStrokeRef.current,
      points: [...activeStrokeRef.current.points, pt],
    };
    renderStrokes(strokes, activeStrokeRef.current);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }

    const finished = activeStrokeRef.current;
    isDrawingRef.current = false;
    activeStrokeRef.current = null;
    onChangeStrokes(questionId, [...strokes, finished]);
  };

  if (!isOpen && strokes.length === 0) {
    return null;
  }

  return (
    <>
      {/* Full-area transparent canvas overlay positioned over the question workspace */}
      <div
        ref={containerRef}
        className={`absolute inset-0 z-20 ${
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className={`h-full w-full touch-none ${
            isOpen
              ? activeTool === 'eraser'
                ? 'cursor-cell'
                : 'cursor-crosshair'
              : 'pointer-events-none'
          }`}
        />
      </div>

      {/* Minimal Floating Pill Toolbar at Bottom */}
      {isOpen && (
        <div
          role="toolbar"
          aria-label="Scratchpad controls"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border border-[#29292E] bg-[#111113]/95 px-2.5 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.75)] backdrop-blur-md select-none"
        >
          {/* Pen */}
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setActiveTool('pen');
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-[#F4F0EA] text-[#0A0A0B] font-semibold'
                : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5]'
            }`}
            title="Pen (#F4F0EA)"
          >
            <PenTool className="h-3.5 w-3.5" />
            <span>Pen</span>
          </button>

          {/* Eraser */}
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setActiveTool('eraser');
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer ${
              activeTool === 'eraser'
                ? 'bg-[#F4F0EA] text-[#0A0A0B] font-semibold'
                : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5]'
            }`}
            title="Eraser"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span>Eraser</span>
          </button>

          <div className="mx-1 h-4 w-px bg-[#1F1F23]" />

          {/* Undo (Z) */}
          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={handleUndo}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Undo last stroke (Z)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Undo</span>
            <kbd className="font-mono text-[10px] text-[#71717A]">Z</kbd>
          </button>

          {/* Clear (C) */}
          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={handleClear}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Clear scratchpad (C)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
            <kbd className="font-mono text-[10px] text-[#71717A]">C</kbd>
          </button>

          <div className="mx-1 h-4 w-px bg-[#1F1F23]" />

          {/* Close (S / Esc) */}
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              onClose();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            title="Close scratchpad (S / Esc)"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Close</span>
            <kbd className="font-mono text-[10px] text-[#71717A]">Esc</kbd>
          </button>
        </div>
      )}
    </>
  );
};
