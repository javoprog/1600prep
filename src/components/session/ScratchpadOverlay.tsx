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

const PEN_WIDTH = 2.25;
const ERASER_WIDTH = 32; // Diameter in CSS px (radius = 16px)

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
  const [eraserCursor, setEraserCursor] = useState<{
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
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
      const dpr =
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

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
          ctx.strokeStyle = '#FFFFFF';
          ctx.fillStyle = '#FFFFFF';
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

  // Clear eraser cursor when closing scratchpad or switching to pen
  useEffect(() => {
    if (!isOpen || activeTool !== 'eraser') {
      setEraserCursor(null);
    }
  }, [isOpen, activeTool]);

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
    soundEngine.play('undo');
    onChangeStrokes(questionId, strokes.slice(0, -1));
  }, [questionId, strokes, onChangeStrokes]);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    soundEngine.play('clear');
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
        soundEngine.play('select');
        setActiveTool('pen');
      } else if (key === 'e') {
        e.preventDefault();
        soundEngine.play('select');
        setActiveTool('eraser');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleUndo, handleClear]);

  const getPointerPosition = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { norm: { x: 0, y: 0 }, px: { x: 0, y: 0 } };
    const rect = canvas.getBoundingClientRect();
    const pxX = e.clientX - rect.left;
    const pxY = e.clientY - rect.top;
    const normX = Math.max(0, Math.min(1, pxX / Math.max(1, rect.width)));
    const normY = Math.max(0, Math.min(1, pxY / Math.max(1, rect.height)));
    return {
      norm: { x: normX, y: normY },
      px: { x: pxX, y: pxY },
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const { norm, px } = getPointerPosition(e);
    if (activeTool === 'eraser') {
      setEraserCursor({ x: px.x, y: px.y, active: true });
    }

    const newStroke: ScratchpadStroke = {
      tool: activeTool,
      points: [norm],
      width: activeTool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH,
    };
    isDrawingRef.current = true;
    activeStrokeRef.current = newStroke;
    renderStrokes(strokes, newStroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen) return;
    e.stopPropagation();

    const { norm, px } = getPointerPosition(e);
    if (activeTool === 'eraser') {
      setEraserCursor({
        x: px.x,
        y: px.y,
        active: isDrawingRef.current,
      });
    }

    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    e.preventDefault();

    activeStrokeRef.current = {
      ...activeStrokeRef.current,
      points: [...activeStrokeRef.current.points, norm],
    };
    renderStrokes(strokes, activeStrokeRef.current);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'eraser') {
      const { px } = getPointerPosition(e);
      setEraserCursor({ x: px.x, y: px.y, active: false });
    }

    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    e.preventDefault();
    e.stopPropagation();
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

  const handlePointerLeave = () => {
    if (!isDrawingRef.current) {
      setEraserCursor(null);
    }
  };

  if (!isOpen && strokes.length === 0) {
    return null;
  }

  return (
    <>
      {/* Full-screen workspace canvas overlay (between header and footer) */}
      <div
        ref={containerRef}
        className={`absolute inset-0 z-[25] overflow-hidden ${
          isOpen ? 'pointer-events-auto select-none' : 'pointer-events-none'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={handlePointerLeave}
          className={`h-full w-full touch-none ${
            isOpen
              ? activeTool === 'eraser'
                ? 'cursor-none'
                : 'cursor-crosshair'
              : 'pointer-events-none'
          }`}
        />

        {/* Visible Eraser Radius Ring Indicator */}
        {isOpen && activeTool === 'eraser' && eraserCursor && (
          <div
            aria-hidden="true"
            style={{
              width: `${ERASER_WIDTH}px`,
              height: `${ERASER_WIDTH}px`,
              left: `${eraserCursor.x}px`,
              top: `${eraserCursor.y}px`,
            }}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors duration-75 ${
              eraserCursor.active
                ? 'border-white bg-white/20 shadow-[0_0_12px_rgba(255,255,255,0.25)]'
                : 'border-white/80 bg-white/10'
            }`}
          />
        )}
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
              soundEngine.play('select');
              setActiveTool('pen');
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold'
                : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5]'
            }`}
            title="Pen"
          >
            <PenTool className="h-3.5 w-3.5" />
            <span>Pen</span>
          </button>

          {/* Eraser */}
          <button
            type="button"
            onClick={() => {
              soundEngine.play('select');
              setActiveTool('eraser');
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer ${
              activeTool === 'eraser'
                ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold'
                : 'text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5]'
            }`}
            title="Eraser"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span>Eraser</span>
          </button>

          <div className="mx-1 h-4 w-px bg-[#1F1F23]" />

          {/* Undo */}
          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={handleUndo}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Undo last stroke"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          {/* Clear */}
          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={handleClear}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Clear scratchpad"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <div className="mx-1 h-4 w-px bg-[#1F1F23]" />

          {/* Close */}
          <button
            type="button"
            onClick={() => {
              soundEngine.play('toggleClose');
              onClose();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            title="Close scratchpad"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      )}
    </>
  );
};
