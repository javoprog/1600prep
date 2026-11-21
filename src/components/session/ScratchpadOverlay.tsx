'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  GripVertical,
  PanelRight,
  PenTool,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import type { ScratchpadPoint, ScratchpadStroke } from '@/types';
import { soundEngine } from '@/services/sound/soundEngine';

export type { ScratchpadPoint, ScratchpadStroke };

type CanvasSurface = 'overlay' | 'board';

interface ScratchpadOverlayProps {
  isOpen: boolean;
  questionId: string;
  strokes: ScratchpadStroke[];
  isBoardOpen: boolean;
  boardWidth: number;
  footerHeight: number;
  onToggleBoard: (nextOpen: boolean) => void;
  onChangeBoardWidth: (width: number) => void;
  onResizingBoardChange?: (resizing: boolean) => void;
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

function drawStrokeList(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  strokeList: ScratchpadStroke[],
  inProgress?: ScratchpadStroke | null,
  surface: CanvasSurface = 'overlay'
) {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const targetW = Math.round(safeW * dpr);
  const targetH = Math.round(safeH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, safeW, safeH);

  const list = inProgress ? [...strokeList, inProgress] : strokeList;

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

    const pts = stroke.points.map((p) => {
      const space = stroke.coordSpace || (surface === 'board' ? 'px' : 'norm');
      if (space === 'center-px') {
        return { x: safeW / 2 + p.x, y: p.y };
      }
      if (space === 'px') {
        return { x: p.x, y: p.y };
      }
      return { x: p.x * safeW, y: p.y * safeH };
    });

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
}

function getSurfacePointerData(
  canvas: HTMLCanvasElement,
  e: React.PointerEvent<HTMLCanvasElement>,
  surface: CanvasSurface
): { point: ScratchpadPoint; px: { x: number; y: number } } {
  const rect = canvas.getBoundingClientRect();
  const pxX = e.clientX - rect.left;
  const pxY = e.clientY - rect.top;

  // Store question overlay coordinates relative to horizontal center in CSS px so
  // vertical scroll/padding changes or side panels never stretch or shift strokes.
  const point: ScratchpadPoint =
    surface === 'overlay'
      ? { x: pxX - rect.width / 2, y: pxY }
      : { x: pxX, y: pxY };

  return {
    point,
    px: { x: pxX, y: pxY },
  };
}

export const ScratchpadOverlay: React.FC<ScratchpadOverlayProps> = ({
  isOpen,
  questionId,
  strokes,
  isBoardOpen,
  boardWidth,
  footerHeight,
  onToggleBoard,
  onChangeBoardWidth,
  onResizingBoardChange,
  onChangeStrokes,
  onClose,
}) => {
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const boardCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const [isResizingBoard, setIsResizingBoard] = useState<boolean>(false);
  const dragToolbarRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ startX: 0, startY: 0, originX: 0, originY: 0 });
  const boardResizeRef = useRef<{ startX: number; startWidth: number }>({
    startX: 0,
    startWidth: boardWidth,
  });

  const [eraserCursor, setEraserCursor] = useState<{
    surface: CanvasSurface;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  const activeStrokeRef = useRef<{
    surface: CanvasSurface;
    stroke: ScratchpadStroke;
  } | null>(null);
  const isDrawingRef = useRef<boolean>(false);

  const overlayStrokes = useMemo(
    () => strokes.filter((s) => s.target !== 'board'),
    [strokes]
  );
  const boardStrokes = useMemo(
    () => strokes.filter((s) => s.target === 'board'),
    [strokes]
  );

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const renderSurface = useCallback(
    (
      surface: CanvasSurface,
      allStrokes: ScratchpadStroke[],
      inProgress?: { surface: CanvasSurface; stroke: ScratchpadStroke } | null
    ) => {
      const canvas =
        surface === 'overlay'
          ? overlayCanvasRef.current
          : boardCanvasRef.current;
      const container =
        surface === 'overlay'
          ? overlayContainerRef.current
          : boardContainerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const filtered = allStrokes.filter((s) =>
        surface === 'board' ? s.target === 'board' : s.target !== 'board'
      );
      const pending =
        inProgress && inProgress.surface === surface ? inProgress.stroke : null;
      drawStrokeList(
        canvas,
        rect.width,
        rect.height,
        filtered,
        pending,
        surface
      );
    },
    []
  );

  const renderAllCanvases = useCallback(
    (allStrokes: ScratchpadStroke[] = strokesRef.current) => {
      renderSurface('overlay', allStrokes, activeStrokeRef.current);
      renderSurface('board', allStrokes, activeStrokeRef.current);
    },
    [renderSurface]
  );

  useEffect(() => {
    renderAllCanvases(strokes);
  }, [strokes, isOpen, isBoardOpen, boardWidth, renderAllCanvases]);

  // Clear eraser cursor when closing scratchpad or switching back to pen
  useEffect(() => {
    if (!isOpen || activeTool !== 'eraser') {
      setEraserCursor(null);
    }
  }, [isOpen, activeTool]);

  // Reset pending drawing state cleanly when switching questions
  useEffect(() => {
    isDrawingRef.current = false;
    activeStrokeRef.current = null;
    setEraserCursor(null);
  }, [questionId]);

  const showOverlayCanvas = isOpen || overlayStrokes.length > 0;
  const showBoardPanel = isOpen && isBoardOpen;

  // Keep both canvases sized and sharp on container resize or window DPR changes
  useEffect(() => {
    const overlayContainer = overlayContainerRef.current;
    const boardContainer = boardContainerRef.current;
    if (!overlayContainer && !boardContainer) return;

    const handleResize = () => {
      renderAllCanvases(strokesRef.current);
    };

    const observer = new ResizeObserver(handleResize);
    if (overlayContainer) observer.observe(overlayContainer);
    if (boardContainer) observer.observe(boardContainer);
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [showOverlayCanvas, showBoardPanel, renderAllCanvases]);

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

  const handleClearBoard = useCallback(() => {
    if (boardStrokes.length === 0) return;
    soundEngine.play('clear');
    setRedoMap((prev) => ({
      ...prev,
      [questionId]: (prev[questionId] || []).filter((s) => s.target !== 'board'),
    }));
    onChangeStrokes(
      questionId,
      strokes.filter((s) => s.target !== 'board')
    );
  }, [questionId, boardStrokes.length, strokes, onChangeStrokes]);

  const handleToggleBoardAction = useCallback(() => {
    const next = !isBoardOpen;
    soundEngine.play(next ? 'toggleOpen' : 'toggleClose');
    onToggleBoard(next);
  }, [isBoardOpen, onToggleBoard]);

  // Scratchpad tool shortcuts while Scratchpad is open
  // (Z = Undo, Y = Redo, C = Clear, P = Pen, E = Eraser, B = Board)
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
      } else if (key === 'b') {
        e.preventDefault();
        handleToggleBoardAction();
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
  }, [isOpen, handleUndo, handleRedo, handleClear, handleToggleBoardAction]);

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
      const halfW = (rect?.width || 520) / 2;
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

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const clampToolbarOnResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = toolbarRef.current?.getBoundingClientRect();
      const halfW = (rect?.width || 520) / 2;
      const maxOffsetX = Math.max(24, vw / 2 - halfW - 12);
      const minOffsetY = -(vh - 168);
      const maxOffsetY = 12;
      setToolbarOffset((prev) => {
        const nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, prev.x));
        const nextY = Math.max(minOffsetY, Math.min(maxOffsetY, prev.y));
        if (nextX === prev.x && nextY === prev.y) return prev;
        return { x: nextX, y: nextY };
      });
    };
    window.addEventListener('resize', clampToolbarOnResize);
    return () => window.removeEventListener('resize', clampToolbarOnResize);
  }, [isOpen]);

  // Scratch Board left-edge width resize
  const handleStartBoardResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    boardResizeRef.current = {
      startX: e.clientX,
      startWidth: boardWidth,
    };
    setIsResizingBoard(true);
    onResizingBoardChange?.(true);
  };

  useEffect(() => {
    if (!isResizingBoard) return;

    const handleMove = (e: PointerEvent) => {
      const vw = window.innerWidth;
      const maxWidth = Math.max(320, Math.min(760, Math.floor(vw * 0.55)));
      const deltaX = boardResizeRef.current.startX - e.clientX;
      const nextWidth = Math.max(
        320,
        Math.min(maxWidth, boardResizeRef.current.startWidth + deltaX)
      );
      onChangeBoardWidth(Math.round(nextWidth));
    };

    const handleUp = () => {
      setIsResizingBoard(false);
      onResizingBoardChange?.(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isResizingBoard, onChangeBoardWidth, onResizingBoardChange]);

  const handleSurfacePointerDown = (
    surface: CanvasSurface,
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isOpen || e.button !== 0) return;
    const canvas = e.currentTarget;
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);

    const { point, px } = getSurfacePointerData(canvas, e, surface);
    if (activeTool === 'eraser') {
      setEraserCursor({ surface, x: px.x, y: px.y, active: true });
    }

    const newStroke: ScratchpadStroke = {
      tool: activeTool,
      points: [point],
      width: activeTool === 'eraser' ? ERASER_WIDTH : penWidth,
      color: activeTool === 'pen' ? activeColor : undefined,
      target: surface,
      coordSpace: surface === 'overlay' ? 'center-px' : 'px',
    };
    const pending = { surface, stroke: newStroke };
    isDrawingRef.current = true;
    activeStrokeRef.current = pending;
    renderSurface(surface, strokes, pending);
  };

  const handleSurfacePointerMove = (
    surface: CanvasSurface,
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isOpen) return;
    const canvas = e.currentTarget;
    e.stopPropagation();

    const { point, px } = getSurfacePointerData(canvas, e, surface);
    if (activeTool === 'eraser') {
      setEraserCursor({
        surface,
        x: px.x,
        y: px.y,
        active: isDrawingRef.current,
      });
    }

    if (
      !isDrawingRef.current ||
      !activeStrokeRef.current ||
      activeStrokeRef.current.surface !== surface
    ) {
      return;
    }
    e.preventDefault();

    const updatedPending = {
      surface,
      stroke: {
        ...activeStrokeRef.current.stroke,
        points: [...activeStrokeRef.current.stroke.points, point],
      },
    };
    activeStrokeRef.current = updatedPending;
    renderSurface(surface, strokes, updatedPending);
  };

  const finishSurfaceStroke = (
    surface: CanvasSurface,
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    const canvas = e.currentTarget;
    if (activeTool === 'eraser') {
      const { px } = getSurfacePointerData(canvas, e, surface);
      setEraserCursor({ surface, x: px.x, y: px.y, active: false });
    }

    if (
      !isDrawingRef.current ||
      !activeStrokeRef.current ||
      activeStrokeRef.current.surface !== surface
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }

    const finished = activeStrokeRef.current.stroke;
    isDrawingRef.current = false;
    activeStrokeRef.current = null;
    setRedoMap((prev) =>
      prev[questionId]?.length ? { ...prev, [questionId]: [] } : prev
    );
    onChangeStrokes(questionId, [...strokes, finished]);
  };

  const handleSurfacePointerLeave = (surface: CanvasSurface) => {
    if (!isDrawingRef.current && eraserCursor?.surface === surface) {
      setEraserCursor(null);
    }
  };

  if (!showOverlayCanvas && !showBoardPanel && !isOpen) {
    return null;
  }

  return (
    <>
      {/* On-Question Transparent Canvas Overlay */}
      {showOverlayCanvas && (
        <div
          ref={overlayContainerRef}
          className={`absolute inset-0 z-[25] overflow-hidden ${
            isOpen ? 'pointer-events-auto select-none' : 'pointer-events-none'
          }`}
        >
          <canvas
            ref={overlayCanvasRef}
            onPointerDown={(e) => handleSurfacePointerDown('overlay', e)}
            onPointerMove={(e) => handleSurfacePointerMove('overlay', e)}
            onPointerUp={(e) => finishSurfaceStroke('overlay', e)}
            onPointerCancel={(e) => finishSurfaceStroke('overlay', e)}
            onPointerLeave={() => handleSurfacePointerLeave('overlay')}
            className={`h-full w-full touch-none ${
              isOpen
                ? activeTool === 'eraser'
                  ? 'cursor-none'
                  : 'cursor-crosshair'
                : 'pointer-events-none'
            }`}
          />

          {/* Eraser Ring Indicator on Question Overlay */}
          {isOpen &&
            activeTool === 'eraser' &&
            eraserCursor?.surface === 'overlay' && (
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
                    ? 'border-[#F5F5F5] bg-white/20 shadow-[0_0_12px_rgba(255,255,255,0.25)]'
                    : 'border-[#F5F5F5]/80 bg-white/10'
                }`}
              />
            )}
        </div>
      )}

      {/* Docked Side-by-Side Expanded Scratch Board */}
      {showBoardPanel && (
        <aside
          style={{
            top: '64px',
            bottom: `${footerHeight}px`,
            right: 0,
            width: `${boardWidth}px`,
          }}
          className="fixed z-30 flex flex-col border-l border-[#29292E] bg-[#111113] shadow-[0_12px_40px_rgba(0,0,0,0.45)] select-none"
          aria-label="Expanded scratch board"
        >
          {/* Left-edge split resize handle matching docked calculator */}
          <div
            onPointerDown={handleStartBoardResize}
            className="group absolute top-0 bottom-0 -left-1 z-30 flex w-2 cursor-col-resize items-center justify-center"
            title="Drag to resize scratch board width"
            aria-label="Resize scratch board width"
          >
            <div className="h-12 w-0.5 rounded-full bg-[#3F3F46] opacity-0 transition-opacity group-hover:bg-[#69ff00] group-hover:opacity-100" />
          </div>

          {/* Scratch Board Header Bar matching tool windows */}
          <div className="flex items-center justify-between gap-2 border-b border-[#29292E] bg-[#18181B] px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <PenTool className="h-3.5 w-3.5 shrink-0 text-[#69ff00]" />
              <span className="text-xs font-semibold text-[#F5F5F5] truncate">
                Scratch Board
              </span>
              <span className="hidden md:inline text-[11px] text-[#71717A] truncate">
                Scroll for more space
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={boardStrokes.length === 0}
                onClick={handleClearBoard}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-500/15 hover:text-red-300 disabled:text-[#52525B] disabled:hover:bg-transparent disabled:hover:text-[#52525B] disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Clear scratch board"
                aria-label="Clear scratch board"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.play('toggleClose');
                  onToggleBoard(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
                title="Close scratch board (B)"
                aria-label="Close scratch board"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Dot-Grid Writing Surface */}
          <div className="flex-1 overflow-y-auto bg-[#0C0C0E]">
            <div
              ref={boardContainerRef}
              style={{
                backgroundImage:
                  'radial-gradient(rgba(161, 161, 170, 0.16) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
              className="relative h-[1600px] w-full"
            >
              <canvas
                ref={boardCanvasRef}
                onPointerDown={(e) => handleSurfacePointerDown('board', e)}
                onPointerMove={(e) => handleSurfacePointerMove('board', e)}
                onPointerUp={(e) => finishSurfaceStroke('board', e)}
                onPointerCancel={(e) => finishSurfaceStroke('board', e)}
                onPointerLeave={() => handleSurfacePointerLeave('board')}
                className={`h-full w-full touch-none ${
                  activeTool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'
                }`}
              />

              {/* Eraser Ring Indicator on Scratch Board */}
              {activeTool === 'eraser' &&
                eraserCursor?.surface === 'board' && (
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
                        ? 'border-[#F5F5F5] bg-white/20 shadow-[0_0_12px_rgba(255,255,255,0.25)]'
                        : 'border-[#F5F5F5]/80 bg-white/10'
                    }`}
                  />
                )}
            </div>
          </div>
        </aside>
      )}

      {/* Refined Floating Glass Pill Toolbar */}
      {isOpen && (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Scratchpad controls"
          style={{
            transform: `translate(calc(-50% + ${toolbarOffset.x}px), ${toolbarOffset.y}px)`,
          }}
          className="fixed bottom-20 left-1/2 z-[45] flex max-w-[calc(100vw-24px)] items-center gap-1.5 rounded-full border border-[#29292E] bg-[#111113]/95 px-2 py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl select-none animate-page-fade"
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
                          ? 'ring-2 ring-[#F5F5F5] ring-offset-2 ring-offset-[#141417] scale-110'
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
                          ? 'bg-[#29292E] text-[#F5F5F5]'
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:text-[#52525B] disabled:hover:bg-transparent disabled:hover:text-[#52525B] disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Undo (Z)"
              aria-label="Undo last stroke"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              disabled={redoStrokes.length === 0}
              onClick={handleRedo}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] disabled:text-[#52525B] disabled:hover:bg-transparent disabled:hover:text-[#52525B] disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Redo (Y)"
              aria-label="Redo stroke"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              disabled={strokes.length === 0}
              onClick={handleClear}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-500/15 hover:text-red-300 disabled:text-[#52525B] disabled:hover:bg-transparent disabled:hover:text-[#52525B] disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Clear all ink (C)"
              aria-label="Clear scratchpad"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-[#29292E]" />

          {/* Toggle Extra Side Scratch Board */}
          <button
            type="button"
            onClick={handleToggleBoardAction}
            className={`relative inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 md:px-3 text-xs font-medium transition-colors cursor-pointer ${
              isBoardOpen
                ? 'border-[#69ff00]/50 bg-[#18181B] text-[#69ff00]'
                : 'border-[#29292E] bg-[#18181B]/75 text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#F5F5F5]'
            }`}
            title={
              isBoardOpen
                ? 'Close extra scratch board (B)'
                : 'Open extra scratch board for more writing space (B)'
            }
            aria-label="Toggle extra scratch board"
            aria-pressed={isBoardOpen}
          >
            <PanelRight className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Board</span>
            {!isBoardOpen && boardStrokes.length > 0 && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#69ff00]"
                aria-hidden="true"
              />
            )}
          </button>

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
