'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  GripVertical,
  PenTool,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { soundEngine } from '@/services/sound/soundEngine';

export interface ScratchpadPoint {
  x: number; // Normalized 0..1 relative to canvas CSS width
  y: number; // Normalized 0..1 relative to canvas CSS height
}

export interface ScratchpadStroke {
  tool: 'pen' | 'eraser';
  points: ScratchpadPoint[];
  width: number;
  color?: string;
}

interface ScratchpadOverlayProps {
  isOpen: boolean;
  questionId: string;
  strokes: ScratchpadStroke[];
  onChangeStrokes: (questionId: string, nextStrokes: ScratchpadStroke[]) => void;
  onClose: () => void;
}

const PEN_COLORS = [
  { id: 'white', value: '#FFFFFF', label: 'White' },
  { id: 'green', value: '#69ff00', label: 'Green' },
  { id: 'blue', value: '#38BDF8', label: 'Blue' },
  { id: 'yellow', value: '#FACC15', label: 'Yellow' },
  { id: 'rose', value: '#FB7185', label: 'Coral' },
] as const;

const PEN_SIZES = [
  { id: 'fine', value: 2.25, label: 'Fine stroke', dotClass: 'h-1.5 w-1.5' },
  { id: 'medium', value: 4, label: 'Medium stroke', dotClass: 'h-2.5 w-2.5' },
  { id: 'bold', value: 6.5, label: 'Bold stroke', dotClass: 'h-3.5 w-3.5' },
] as const;

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
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const [activeColor, setActiveColor] = useState<string>('#FFFFFF');
  const [penWidth, setPenWidth] = useState<number>(2.25);
  const [redoMap, setRedoMap] = useState<Record<string, ScratchpadStroke[]>>({});
  const [toolbarOffset, setToolbarOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState<boolean>(false);
  const dragToolbarRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ startX: 0, startY: 0, originX: 0, originY: 0 });
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
          const strokeColor = stroke.color || '#FFFFFF';
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = strokeColor;
          ctx.fillStyle = strokeColor;
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

  const redoStrokes = redoMap[questionId] || [];

  const handleUndo = useCallback(() => {
    if (strokes.length === 0) return;
    soundEngine.play('undo');
    const last = strokes[strokes.length - 1];
    setRedoMap((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), last],
    }));
    onChangeStrokes(questionId, strokes.slice(0, -1));
  }, [questionId, strokes, onChangeStrokes]);

  const handleRedo = useCallback(() => {
    const stack = redoMap[questionId] || [];
    if (stack.length === 0) return;
    soundEngine.play('select');
    const restored = stack[stack.length - 1];
    setRedoMap((prev) => ({
      ...prev,
      [questionId]: stack.slice(0, -1),
    }));
    onChangeStrokes(questionId, [...strokes, restored]);
  }, [questionId, redoMap, strokes, onChangeStrokes]);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    soundEngine.play('clear');
    setRedoMap((prev) => ({
      ...prev,
      [questionId]: [],
    }));
    onChangeStrokes(questionId, []);
  }, [questionId, strokes, onChangeStrokes]);

  // Scratchpad tool shortcuts while Scratchpad is open (Z = Undo, Y = Redo, C = Clear, P = Pen, E = Eraser)
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
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
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
  }, [isOpen, handleUndo, handleRedo, handleClear]);

  // Toolbar drag behavior within safe header/footer bounds
  const handleStartToolbarDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragToolbarRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: toolbarOffset.x,
      originY: toolbarOffset.y,
    };
    setIsDraggingToolbar(true);
  };

  useEffect(() => {
    if (!isDraggingToolbar) return;

    const handleMove = (e: PointerEvent) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = toolbarRef.current?.getBoundingClientRect();
      const halfW = (rect?.width || 460) / 2;
      const maxOffsetX = Math.max(24, vw / 2 - halfW - 12);
      const minOffsetY = -(vh - 168);
      const maxOffsetY = 12;

      const rawX =
        dragToolbarRef.current.originX +
        (e.clientX - dragToolbarRef.current.startX);
      const rawY =
        dragToolbarRef.current.originY +
        (e.clientY - dragToolbarRef.current.startY);

      setToolbarOffset({
        x: Math.max(-maxOffsetX, Math.min(maxOffsetX, rawX)),
        y: Math.max(minOffsetY, Math.min(maxOffsetY, rawY)),
      });
    };

    const handleUp = () => setIsDraggingToolbar(false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDraggingToolbar]);

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
      width: activeTool === 'eraser' ? ERASER_WIDTH : penWidth,
      color: activeTool === 'pen' ? activeColor : undefined,
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
    setRedoMap((prev) =>
      prev[questionId]?.length ? { ...prev, [questionId]: [] } : prev
    );
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

      {/* Refined Floating Glass Pill Toolbar */}
      {isOpen && (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Scratchpad controls"
          style={{
            transform: `translate(calc(-50% + ${toolbarOffset.x}px), ${toolbarOffset.y}px)`,
          }}
          className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-24px)] items-center gap-1.5 rounded-full border border-[#29292E] bg-[#111113]/95 px-2 py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl select-none animate-page-fade"
        >
          {/* Subtle Drag Handle (double-click to re-center) */}
          <button
            type="button"
            onPointerDown={handleStartToolbarDrag}
            onDoubleClick={() => {
              soundEngine.play('click');
              setToolbarOffset({ x: 0, y: 0 });
            }}
            className="flex h-8 w-5 shrink-0 items-center justify-center rounded-full text-[#52525B] hover:text-[#A1A1AA] cursor-grab active:cursor-grabbing transition-colors"
            title="Drag toolbar (double-click to reset position)"
            aria-label="Drag scratchpad toolbar"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          {/* Segmented Tool Mode Capsule: Pen & Eraser */}
          <div className="flex items-center gap-0.5 rounded-full border border-[#1F1F23] bg-[#0A0A0B]/90 p-0.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.play('select');
                setActiveTool('pen');
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all cursor-pointer ${
                activeTool === 'pen'
                  ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold shadow-sm'
                  : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
              }`}
              title="Pen (P)"
              aria-pressed={activeTool === 'pen'}
            >
              <PenTool className="h-3.5 w-3.5" />
              <span>Pen</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.play('select');
                setActiveTool('eraser');
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all cursor-pointer ${
                activeTool === 'eraser'
                  ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold shadow-sm'
                  : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
              }`}
              title="Eraser (E)"
              aria-pressed={activeTool === 'eraser'}
            >
              <Eraser className="h-3.5 w-3.5" />
              <span>Eraser</span>
            </button>
          </div>

          {/* Ink Color & Stroke Thickness Tray when Pen is active */}
          {activeTool === 'pen' && (
            <div className="flex items-center gap-2 rounded-full border border-[#242429] bg-[#18181B]/75 px-2.5 py-1">
              <div className="flex items-center gap-1.5">
                {PEN_COLORS.map((c) => {
                  const isCurrent = activeColor === c.value;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        soundEngine.play('select');
                        setActiveColor(c.value);
                      }}
                      style={{ backgroundColor: c.value }}
                      className={`h-3.5 w-3.5 rounded-full transition-transform hover:scale-115 cursor-pointer ${
                        isCurrent
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141417] scale-110'
                          : 'opacity-75 hover:opacity-100'
                      }`}
                      title={c.label}
                      aria-label={`${c.label} ink`}
                      aria-pressed={isCurrent}
                    />
                  );
                })}
              </div>

              <div className="h-3.5 w-px bg-[#29292E]" />

              <div className="flex items-center gap-0.5">
                {PEN_SIZES.map((sz) => {
                  const isCurrent = penWidth === sz.value;
                  return (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => {
                        soundEngine.play('click');
                        setPenWidth(sz.value);
                      }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[#29292E] text-white'
                          : 'text-[#71717A] hover:bg-[#202024] hover:text-[#D4D4D8]'
                      }`}
                      title={sz.label}
                      aria-label={sz.label}
                      aria-pressed={isCurrent}
                    >
                      <span
                        className={`rounded-full bg-current ${sz.dotClass}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* History & Clear Actions */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={strokes.length === 0}
              onClick={handleUndo}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Undo (Z)"
              aria-label="Undo last stroke"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              disabled={redoStrokes.length === 0}
              onClick={handleRedo}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Redo (Y)"
              aria-label="Redo stroke"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              disabled={strokes.length === 0}
              onClick={handleClear}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Clear all ink (C)"
              aria-label="Clear scratchpad"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Done / Close Pill */}
          <button
            type="button"
            onClick={() => {
              soundEngine.play('toggleClose');
              onClose();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#29292E] bg-[#18181B] px-3 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] hover:bg-[#202024] transition-colors cursor-pointer"
            title="Done drawing (S / Esc)"
          >
            <Check className="h-3.5 w-3.5 text-[#69ff00]" />
            <span>Done</span>
          </button>
        </div>
      )}
    </>
  );
};
