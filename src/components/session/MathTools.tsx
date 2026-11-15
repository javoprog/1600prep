'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import katex from 'katex';
import {
  GripHorizontal,
  X,
} from 'lucide-react';
import { soundEngine } from '@/services/sound/soundEngine';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowPosition {
  x: number;
  y: number;
}

function renderLatexInline(tex: string): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: false,
      strict: false,
    });
  } catch {
    return tex;
  }
}

const KatexFormula: React.FC<{ tex: string; className?: string }> = ({
  tex,
  className = '',
}) => (
  <span
    className={className}
    dangerouslySetInnerHTML={{ __html: renderLatexInline(tex) }}
  />
);

function useDraggableWindow(initialPosition: WindowPosition, approxWidth = 600) {
  const [pos, setPos] = useState<WindowPosition>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPos: WindowPosition;
  }>({
    startX: 0,
    startY: 0,
    startPos: initialPosition,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPos((prev) => {
      const clampedW = Math.min(approxWidth, window.innerWidth - 24);
      const x = Math.max(12, Math.min(prev.x, window.innerWidth - clampedW - 12));
      const y = Math.max(60, Math.min(prev.y, window.innerHeight - 200));
      return { x, y };
    });
  }, [approxWidth]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPos: pos,
      };
      setIsDragging(true);
    },
    [pos]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clampedW = Math.min(approxWidth, vw - 16);

      const nextX = Math.max(
        8,
        Math.min(vw - clampedW - 8, dragRef.current.startPos.x + dx)
      );
      const nextY = Math.max(
        56,
        Math.min(vh - 60, dragRef.current.startPos.y + dy)
      );
      setPos({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, approxWidth]);

  return {
    pos,
    isDragging,
    startDrag,
  };
}

export type CalculatorLayout = 'floating' | 'left' | 'right';

interface ResizeHandlesProps {
  onStartResize: (dir: ResizeDirection, e: React.PointerEvent) => void;
}

const ResizeHandles: React.FC<ResizeHandlesProps> = ({ onStartResize }) => (
  <>
    {/* Invisible edge handles */}
    <div
      onPointerDown={(e) => onStartResize('n', e)}
      className="absolute -top-1 left-3 right-3 h-2 cursor-ns-resize z-30"
    />
    <div
      onPointerDown={(e) => onStartResize('s', e)}
      className="absolute -bottom-1 left-3 right-3 h-2 cursor-ns-resize z-30"
    />
    <div
      onPointerDown={(e) => onStartResize('w', e)}
      className="absolute top-3 bottom-3 -left-1 w-2 cursor-ew-resize z-30"
    />
    <div
      onPointerDown={(e) => onStartResize('e', e)}
      className="absolute top-3 bottom-3 -right-1 w-2 cursor-ew-resize z-30"
    />

    {/* Invisible corner handles */}
    <div
      onPointerDown={(e) => onStartResize('nw', e)}
      className="absolute -top-1.5 -left-1.5 h-3.5 w-3.5 cursor-nwse-resize z-30"
    />
    <div
      onPointerDown={(e) => onStartResize('ne', e)}
      className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 cursor-nesw-resize z-30"
    />
    <div
      onPointerDown={(e) => onStartResize('sw', e)}
      className="absolute -bottom-1.5 -left-1.5 h-3.5 w-3.5 cursor-nesw-resize z-30"
    />
    <div
      onPointerDown={(e) => onStartResize('se', e)}
      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize z-30"
    />
  </>
);

interface MathCalculatorPanelProps {
  isOpen: boolean;
  layout: CalculatorLayout;
  dockWidth: number;
  footerHeight: number;
  onChangeLayout: (layout: CalculatorLayout) => void;
  onChangeDockWidth: (width: number) => void;
  onResizingDockChange?: (isResizing: boolean) => void;
  onClose: () => void;
}

type CalculatorInteractionState =
  | {
      mode: 'floating-drag';
      startX: number;
      startY: number;
      startBounds: WindowBounds;
    }
  | {
      mode: 'floating-resize';
      dir: ResizeDirection;
      startX: number;
      startY: number;
      startBounds: WindowBounds;
    }
  | {
      mode: 'docked-pending-unsnap';
      fromDock: 'left' | 'right';
      startX: number;
      startY: number;
      floatSize: { width: number; height: number };
    }
  | {
      mode: 'docked-resize';
      dockSide: 'left' | 'right';
    }
  | { mode: null };

export const MathCalculatorPanel: React.FC<MathCalculatorPanelProps> = ({
  isOpen,
  layout,
  dockWidth,
  footerHeight,
  onChangeLayout,
  onChangeDockWidth,
  onResizingDockChange,
  onClose,
}) => {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [bounds, setBounds] = useState<WindowBounds>({
    x: 24,
    y: 76,
    width: 470,
    height: 580,
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [snapPreview, setSnapPreview] = useState<'left' | 'right' | null>(null);

  const minFloatWidth = 340;
  const minFloatHeight = 380;

  const snapPreviewRef = useRef<'left' | 'right' | null>(null);
  const lastDockedSideRef = useRef<'left' | 'right'>('left');
  const interactionRef = useRef<CalculatorInteractionState>({ mode: null });

  useEffect(() => {
    if (layout === 'left' || layout === 'right') {
      lastDockedSideRef.current = layout;
    }
  }, [layout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setBounds((prev) => {
      const maxW = Math.max(minFloatWidth, window.innerWidth - 24);
      const maxH = Math.max(minFloatHeight, window.innerHeight - 96);
      const width = Math.min(prev.width, maxW);
      const height = Math.min(prev.height, maxH);
      const x = Math.max(12, Math.min(prev.x, window.innerWidth - width - 12));
      const y = Math.max(68, Math.min(prev.y, window.innerHeight - height - 12));
      return { x, y, width, height };
    });
  }, []);

  useEffect(() => {
    if (isOpen && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [isOpen, hasLoadedOnce]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      e.preventDefault();

      if (layout === 'floating') {
        interactionRef.current = {
          mode: 'floating-drag',
          startX: e.clientX,
          startY: e.clientY,
          startBounds: bounds,
        };
      } else {
        interactionRef.current = {
          mode: 'docked-pending-unsnap',
          fromDock: layout,
          startX: e.clientX,
          startY: e.clientY,
          floatSize: { width: bounds.width, height: bounds.height },
        };
      }
      setIsInteracting(true);
    },
    [layout, bounds]
  );

  const handleStartFloatingResize = useCallback(
    (dir: ResizeDirection, e: React.PointerEvent) => {
      if (layout !== 'floating') return;
      e.preventDefault();
      e.stopPropagation();
      interactionRef.current = {
        mode: 'floating-resize',
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startBounds: bounds,
      };
      setIsInteracting(true);
    },
    [layout, bounds]
  );

  const handleStartDockResize = useCallback(
    (e: React.PointerEvent) => {
      if (layout === 'floating') return;
      e.preventDefault();
      e.stopPropagation();
      interactionRef.current = {
        mode: 'docked-resize',
        dockSide: layout,
      };
      onResizingDockChange?.(true);
      setIsInteracting(true);
    },
    [layout, onResizingDockChange]
  );

  useEffect(() => {
    if (!isInteracting) return;

    const updateSnapPreview = (next: 'left' | 'right' | null) => {
      if (snapPreviewRef.current !== next) {
        snapPreviewRef.current = next;
        setSnapPreview(next);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const state = interactionRef.current;
      if (!state.mode) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (state.mode === 'docked-pending-unsnap') {
        const dist = Math.hypot(
          e.clientX - state.startX,
          e.clientY - state.startY
        );
        if (dist <= 10) return;

        const w = Math.min(state.floatSize.width, Math.max(minFloatWidth, vw - 24));
        const h = Math.min(state.floatSize.height, Math.max(minFloatHeight, vh - 96));
        const fx = Math.max(
          8,
          Math.min(vw - w - 8, Math.round(e.clientX - w / 2))
        );
        const fy = Math.max(68, Math.min(vh - 80, Math.round(e.clientY - 18)));
        const nextFloatBounds: WindowBounds = { x: fx, y: fy, width: w, height: h };

        interactionRef.current = {
          mode: 'floating-drag',
          startX: e.clientX,
          startY: e.clientY,
          startBounds: nextFloatBounds,
        };
        setBounds(nextFloatBounds);
        onChangeLayout('floating');
        return;
      }

      if (state.mode === 'floating-drag') {
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const rawX = state.startBounds.x + dx;
        const nextX = Math.max(
          8,
          Math.min(vw - state.startBounds.width - 8, rawX)
        );
        const nextY = Math.max(
          68,
          Math.min(vh - 60, state.startBounds.y + dy)
        );

        let nextSnap: 'left' | 'right' | null = null;
        if (vw >= 640) {
          if (e.clientX <= 56 || rawX <= -56) {
            nextSnap = 'left';
          } else if (
            e.clientX >= vw - 56 ||
            rawX + state.startBounds.width >= vw + 56
          ) {
            nextSnap = 'right';
          }
        }
        updateSnapPreview(nextSnap);
        setBounds((prev) => ({ ...prev, x: nextX, y: nextY }));
        return;
      }

      if (state.mode === 'docked-resize') {
        const maxDock = Math.max(380, Math.round(vw * 0.58));
        const minDock = 340;
        const rawWidth =
          state.dockSide === 'left' ? e.clientX : vw - e.clientX;
        const clampedWidth = Math.max(minDock, Math.min(maxDock, Math.round(rawWidth)));
        onChangeDockWidth(clampedWidth);
        return;
      }

      if (state.mode === 'floating-resize') {
        let { x, y, width, height } = state.startBounds;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const dir = state.dir;

        if (dir.includes('e')) {
          width = Math.min(vw - x - 8, Math.max(minFloatWidth, width + dx));
        }
        if (dir.includes('s')) {
          height = Math.min(vh - y - 8, Math.max(minFloatHeight, height + dy));
        }
        if (dir.includes('w')) {
          const maxDeltaLeft = width - minFloatWidth;
          const clampedDx = Math.max(-x + 8, Math.min(maxDeltaLeft, dx));
          x += clampedDx;
          width -= clampedDx;
        }
        if (dir.includes('n')) {
          const maxDeltaTop = height - minFloatHeight;
          const clampedDy = Math.max(68 - y, Math.min(maxDeltaTop, dy));
          y += clampedDy;
          height -= clampedDy;
        }

        setBounds({ x, y, width, height });
      }
    };

    const handlePointerUp = () => {
      const pendingSnap = snapPreviewRef.current;
      snapPreviewRef.current = null;
      setSnapPreview(null);
      interactionRef.current = { mode: null };
      setIsInteracting(false);
      onResizingDockChange?.(false);

      if (pendingSnap) {
        lastDockedSideRef.current = pendingSnap;
        onChangeLayout(pendingSnap);
        soundEngine.play('toggleOpen');
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isInteracting, onChangeLayout, onChangeDockWidth, onResizingDockChange]);

  if (!isOpen && !hasLoadedOnce) {
    return null;
  }

  const isDocked = layout !== 'floating';

  const panelStyle: React.CSSProperties = isDocked
    ? {
        top: '64px',
        bottom: `${footerHeight}px`,
        width: `${dockWidth}px`,
        ...(layout === 'left' ? { left: 0 } : { right: 0 }),
      }
    : {
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      };

  return (
    <>
      {/* Windows-style Dock Snap Ghost Preview */}
      {isOpen && snapPreview && (
        <div
          style={{
            top: '72px',
            bottom: `${footerHeight + 8}px`,
            width: `${Math.max(300, dockWidth - 16)}px`,
            ...(snapPreview === 'left' ? { left: '8px' } : { right: '8px' }),
          }}
          className="hidden sm:flex fixed z-30 pointer-events-none items-center justify-center rounded-2xl border-2 border-[#69ff00]/65 bg-[#69ff00]/[0.08] backdrop-blur-[2px] transition-all duration-150"
          aria-hidden="true"
        >
          <div className="rounded-full border border-[#69ff00]/40 bg-[#111113]/95 px-3.5 py-1.5 text-xs font-medium text-[#69ff00] shadow-lg">
            {snapPreview === 'left' ? 'Snap Left' : 'Snap Right'}
          </div>
        </div>
      )}

      <div
        style={panelStyle}
        className={`fixed flex flex-col bg-[#111113] select-none ${
          isDocked
            ? `z-30 rounded-none ${
                layout === 'left'
                  ? 'border-r border-[#29292E]'
                  : 'border-l border-[#29292E]'
              } shadow-[0_12px_40px_rgba(0,0,0,0.45)]`
            : 'z-40 rounded-2xl border border-[#3F3F46] shadow-[0_24px_60px_rgba(0,0,0,0.75)]'
        } ${
          isOpen
            ? 'hidden sm:flex opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none hidden'
        }`}
        role="dialog"
        aria-label="Graphing Calculator"
      >
        {!isDocked && (
          <ResizeHandles onStartResize={handleStartFloatingResize} />
        )}

        {/* Inner-edge Split Width Resizer when Docked Left/Right */}
        {isDocked && (
          <div
            onPointerDown={handleStartDockResize}
            className={`group absolute top-0 bottom-0 z-30 flex w-2 cursor-col-resize items-center justify-center ${
              layout === 'left' ? '-right-1' : '-left-1'
            }`}
            title="Drag to resize calculator width"
            aria-label="Resize docked calculator"
          >
            <div className="h-12 w-0.5 rounded-full bg-[#3F3F46] opacity-0 transition-opacity group-hover:bg-[#69ff00] group-hover:opacity-100" />
          </div>
        )}

        {/* Draggable Window Title Bar */}
        <div
          onPointerDown={handleHeaderPointerDown}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('button, a')) return;
            soundEngine.play('click');
            if (layout === 'floating') {
              onChangeLayout(lastDockedSideRef.current);
            } else {
              lastDockedSideRef.current = layout;
              onChangeLayout('floating');
            }
          }}
          className={`flex items-center justify-between gap-2 border-b border-[#29292E] bg-[#18181B] px-3.5 py-2 cursor-move ${
            isDocked ? '' : 'rounded-t-2xl'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal className="h-4 w-4 shrink-0 text-[#71717A]" />
            <span className="text-xs font-semibold text-[#F5F5F5] truncate">
              Calculator
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              onClose();
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            title="Close calculator"
            aria-label="Close calculator"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Embedded Desmos SAT Graphing Calculator */}
        <div
          className={`relative flex-1 overflow-hidden bg-white ${
            isDocked ? '' : 'rounded-b-2xl'
          }`}
        >
          {/* Shield over iframe while dragging or resizing so pointer events never get swallowed */}
          {isInteracting && <div className="absolute inset-0 z-20 cursor-move" />}
          <iframe
            src="https://www.desmos.com/testing/cb-digital-sat/graphing"
            title="Desmos SAT Graphing Calculator"
            className="h-full w-full border-0"
            allow="clipboard-write"
          />
        </div>
      </div>
    </>
  );
};

interface MathReferenceSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MathReferenceSheet: React.FC<MathReferenceSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const { pos, isDragging, startDrag } = useDraggableWindow(
    {
      x:
        typeof window !== 'undefined'
          ? Math.max(24, window.innerWidth - 710)
          : 180,
      y: 72,
    },
    680
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }}
      className="fixed z-40 flex w-[680px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-80px)] flex-col rounded-2xl border border-[#3F3F46] bg-[#18181B] shadow-[0_24px_60px_rgba(0,0,0,0.75)] select-none"
      role="dialog"
      aria-label="Reference Sheet"
    >
      {/* Draggable Bluebook-Style Window Header */}
      <div
        onPointerDown={startDrag}
        className="flex items-center justify-between rounded-t-2xl border-b border-[#29292E] bg-[#18181B] px-4 py-2.5 cursor-move"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-[#71717A]" />
          <span className="text-xs font-semibold text-[#F5F5F5]">
            Reference Sheet
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            soundEngine.play('click');
            onClose();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          title="Close reference sheet"
          aria-label="Close reference sheet"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Official Bluebook SAT Reference Sheet Content (Best-Fit Form) */}
      <div
        className={`overflow-y-auto rounded-b-2xl bg-[#F8F8F6] p-5 sm:p-6 text-[#111113] ${
          isDragging ? 'pointer-events-none' : ''
        }`}
      >
        {/* Row 1: Circle, Rectangle, Triangle, Pythagorean Theorem, Special Right Triangles */}
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-y-6 gap-x-3 items-end border-b border-[#D4D4D8] pb-5">
          {/* 1. Circle */}
          <div className="col-span-1 sm:col-span-2 flex flex-col items-center text-center">
            <svg viewBox="0 0 100 90" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.6">
              <circle cx="50" cy="45" r="32" />
              <circle cx="50" cy="45" r="2.2" fill="#111113" />
              <line x1="50" y1="45" x2="82" y2="45" />
              <text x="63" y="39" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">r</text>
            </svg>
            <div className="mt-2 space-y-1 text-sm">
              <div><KatexFormula tex="A = \pi r^2" /></div>
              <div><KatexFormula tex="C = 2\pi r" /></div>
            </div>
          </div>

          {/* 2. Rectangle */}
          <div className="col-span-1 sm:col-span-2 flex flex-col items-center text-center">
            <svg viewBox="0 0 110 90" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.6">
              <rect x="18" y="24" width="66" height="44" />
              <text x="48" y="18" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">ℓ</text>
              <text x="89" y="50" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">w</text>
            </svg>
            <div className="mt-2 text-sm pb-3">
              <KatexFormula tex="A = \ell w" />
            </div>
          </div>

          {/* 3. Triangle */}
          <div className="col-span-1 sm:col-span-2 flex flex-col items-center text-center">
            <svg viewBox="0 0 110 90" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.6">
              <polygon points="16,68 92,68 46,18" />
              <line x1="46" y1="18" x2="46" y2="68" strokeDasharray="3.5 2.5" />
              <polyline points="46,60 54,60 54,68" strokeWidth="1.3" />
              <text x="51" y="48" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">h</text>
              <text x="51" y="83" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">b</text>
            </svg>
            <div className="mt-2 text-sm pb-1">
              <KatexFormula tex="A = \frac{1}{2}bh" />
            </div>
          </div>

          {/* 4. Right Triangle (Pythagorean Theorem) */}
          <div className="col-span-1 sm:col-span-2 flex flex-col items-center text-center">
            <svg viewBox="0 0 115 90" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.6">
              <polygon points="22,68 94,68 22,20" />
              <polyline points="22,59 31,59 31,68" strokeWidth="1.3" />
              <text x="9" y="48" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">b</text>
              <text x="55" y="83" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">a</text>
              <text x="61" y="39" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">c</text>
            </svg>
            <div className="mt-2 text-sm pb-3">
              <KatexFormula tex="c^2 = a^2 + b^2" />
            </div>
          </div>

          {/* 5. Special Right Triangles */}
          <div className="col-span-2 sm:col-span-4 flex flex-col items-center text-center">
            <div className="grid grid-cols-2 gap-1 w-full items-end">
              {/* 30-60-90 */}
              <svg viewBox="0 0 135 90" className="h-20 w-full stroke-[#111113]" fill="none" strokeWidth="1.6">
                <polygon points="22,68 112,68 22,18" />
                <polyline points="22,59 31,59 31,68" strokeWidth="1.3" />
                <text x="9" y="47" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">x</text>
                <text x="52" y="84" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">x√3</text>
                <text x="68" y="37" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">2x</text>
                <text x="26" y="35" fill="#111113" stroke="none" fontSize="10">60°</text>
                <text x="80" y="64" fill="#111113" stroke="none" fontSize="10">30°</text>
              </svg>

              {/* 45-45-90 */}
              <svg viewBox="0 0 120 90" className="h-20 w-full stroke-[#111113]" fill="none" strokeWidth="1.6">
                <polygon points="24,68 88,68 24,14" />
                <polyline points="24,59 33,59 33,68" strokeWidth="1.3" />
                <text x="12" y="45" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">s</text>
                <text x="53" y="84" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">s</text>
                <text x="60" y="36" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">s√2</text>
                <text x="28" y="32" fill="#111113" stroke="none" fontSize="10">45°</text>
                <text x="64" y="64" fill="#111113" stroke="none" fontSize="10">45°</text>
              </svg>
            </div>
            <div className="mt-2 text-xs font-medium text-[#111113] pb-3">
              Special Right Triangles
            </div>
          </div>
        </div>

        {/* Row 2: 5 3D Solids with Full 3D Drawings & Formulas */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-y-6 gap-x-3 items-end border-b border-[#D4D4D8] pb-5">
          {/* 1. Rectangular Solid */}
          <div className="flex flex-col items-center text-center">
            <svg viewBox="0 0 125 95" className="h-20 w-26 stroke-[#111113]" fill="none" strokeWidth="1.5">
              <rect x="16" y="34" width="62" height="42" />
              <polyline points="16,34 38,16 100,16 100,58 78,76" />
              <line x1="78" y1="34" x2="100" y2="16" />
              <text x="45" y="89" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">ℓ</text>
              <text x="92" y="73" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">w</text>
              <text x="105" y="42" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">h</text>
            </svg>
            <div className="mt-1.5 text-sm">
              <KatexFormula tex="V = \ell wh" />
            </div>
          </div>

          {/* 2. Right Circular Cylinder */}
          <div className="flex flex-col items-center text-center">
            <svg viewBox="0 0 115 95" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.5">
              <ellipse cx="52" cy="22" rx="30" ry="10" />
              <circle cx="52" cy="22" r="1.8" fill="#111113" />
              <line x1="52" y1="22" x2="82" y2="22" />
              <text x="64" y="19" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">r</text>
              <line x1="22" y1="22" x2="22" y2="70" />
              <line x1="82" y1="22" x2="82" y2="70" />
              <path d="M 22 70 A 30 10 0 0 0 82 70" />
              <path d="M 22 70 A 30 10 0 0 1 82 70" strokeDasharray="3.5 2.5" />
              <text x="88" y="50" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">h</text>
            </svg>
            <div className="mt-1.5 text-sm">
              <KatexFormula tex="V = \pi r^2 h" />
            </div>
          </div>

          {/* 3. Sphere */}
          <div className="flex flex-col items-center text-center">
            <svg viewBox="0 0 110 95" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.5">
              <circle cx="55" cy="46" r="32" />
              <path d="M 23 46 A 32 10 0 0 0 87 46" />
              <path d="M 23 46 A 32 10 0 0 1 87 46" strokeDasharray="3.5 2.5" />
              <circle cx="55" cy="46" r="1.8" fill="#111113" />
              <line x1="55" y1="46" x2="87" y2="46" />
              <text x="68" y="42" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">r</text>
            </svg>
            <div className="mt-1.5 text-sm">
              <KatexFormula tex="V = \frac{4}{3}\pi r^3" />
            </div>
          </div>

          {/* 4. Right Circular Cone */}
          <div className="flex flex-col items-center text-center">
            <svg viewBox="0 0 110 95" className="h-20 w-24 stroke-[#111113]" fill="none" strokeWidth="1.5">
              <line x1="55" y1="14" x2="23" y2="72" />
              <line x1="55" y1="14" x2="87" y2="72" />
              <path d="M 23 72 A 32 10 0 0 0 87 72" />
              <path d="M 23 72 A 32 10 0 0 1 87 72" strokeDasharray="3.5 2.5" />
              <line x1="55" y1="14" x2="55" y2="72" strokeDasharray="3.5 2.5" />
              <polyline points="55,65 61,65 61,72" strokeWidth="1.2" />
              <line x1="55" y1="72" x2="87" y2="72" strokeDasharray="3.5 2.5" />
              <text x="45" y="50" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">h</text>
              <text x="69" y="69" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">r</text>
            </svg>
            <div className="mt-1.5 text-sm">
              <KatexFormula tex="V = \frac{1}{3}\pi r^2 h" />
            </div>
          </div>

          {/* 5. Rectangular Pyramid */}
          <div className="col-span-2 sm:col-span-1 flex flex-col items-center text-center">
            <svg viewBox="0 0 120 95" className="h-20 w-26 stroke-[#111113]" fill="none" strokeWidth="1.5">
              <polyline points="16,74 76,74 100,56" />
              <polyline points="16,74 40,56 100,56" strokeDasharray="3.5 2.5" />
              <line x1="58" y1="14" x2="16" y2="74" />
              <line x1="58" y1="14" x2="76" y2="74" />
              <line x1="58" y1="14" x2="100" y2="56" />
              <line x1="58" y1="14" x2="40" y2="56" strokeDasharray="3.5 2.5" />
              <line x1="58" y1="14" x2="58" y2="65" strokeDasharray="3.5 2.5" />
              <polyline points="58,59 64,59 64,65" strokeWidth="1.2" />
              <text x="61" y="48" fill="#111113" stroke="none" fontSize="12" fontFamily="serif" fontStyle="italic">h</text>
              <text x="44" y="88" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">ℓ</text>
              <text x="92" y="72" fill="#111113" stroke="none" fontSize="13" fontFamily="serif" fontStyle="italic">w</text>
            </svg>
            <div className="mt-1.5 text-sm">
              <KatexFormula tex="V = \frac{1}{3}\ell wh" />
            </div>
          </div>
        </div>

        {/* Bottom Section: Official Bluebook 3 Statements */}
        <div className="mt-4 space-y-1.5 text-sm text-[#111113] leading-relaxed">
          <p>The number of degrees of arc in a circle is 360.</p>
          <p>
            The number of radians of arc in a circle is{' '}
            <KatexFormula tex="2\pi" />.
          </p>
          <p>
            The sum of the measures in degrees of the angles of a triangle is
            180.
          </p>
        </div>
      </div>
    </div>
  );
};

interface SprDirectionsWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SprDirectionsWindow: React.FC<SprDirectionsWindowProps> = ({
  isOpen,
  onClose,
}) => {
  const { pos, isDragging, startDrag } = useDraggableWindow(
    {
      x:
        typeof window !== 'undefined'
          ? Math.max(24, Math.round((window.innerWidth - 580) / 2))
          : 220,
      y: 84,
    },
    580
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }}
      className="fixed z-40 flex w-[580px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-80px)] flex-col rounded-2xl border border-[#3F3F46] bg-[#141417] shadow-[0_24px_60px_rgba(0,0,0,0.75)] select-none"
      role="dialog"
      aria-label="Student-Produced Response Directions"
    >
      {/* Draggable Window Header */}
      <div
        onPointerDown={startDrag}
        className="flex items-center justify-between rounded-t-2xl border-b border-[#29292E] bg-[#18181B] px-4 py-2.5 cursor-move"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-[#71717A]" />
          <span className="text-xs font-semibold text-[#F5F5F5]">
            Student-Produced Response Directions
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            soundEngine.play('click');
            onClose();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          title="Close directions"
          aria-label="Close directions"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Best-Fit Directions Content with Larger Font Size */}
      <div
        className={`overflow-y-auto rounded-b-2xl bg-[#111113] p-6 text-sm text-[#D4D4D8] space-y-5 select-text ${
          isDragging ? 'pointer-events-none' : ''
        }`}
      >
        <ul className="space-y-2.5 list-disc pl-5 leading-relaxed">
          <li>
            If you find <strong className="text-[#F5F5F5]">more than one correct answer</strong>, enter only one answer.
          </li>
          <li>
            You can enter up to 5 characters for a <strong className="text-[#F5F5F5]">positive</strong> answer and up to 6 characters (including the negative sign) for a <strong className="text-[#F5F5F5]">negative</strong> answer.
          </li>
          <li>
            If your answer is a <strong className="text-[#F5F5F5]">fraction</strong> that doesn&apos;t fit in the provided space, enter the decimal equivalent.
          </li>
          <li>
            If your answer is a <strong className="text-[#F5F5F5]">decimal</strong> that doesn&apos;t fit in the provided space, enter it by truncating or rounding at the fourth digit.
          </li>
          <li>
            If your answer is a <strong className="text-[#F5F5F5]">mixed number</strong> (such as{' '}
            <KatexFormula tex="3\frac{1}{2}" className="text-[#F5F5F5]" />), enter it as an improper fraction (<code className="font-mono text-white">7/2</code>) or its decimal equivalent (<code className="font-mono text-white">3.5</code>).
          </li>
          <li>
            Don&apos;t enter <strong className="text-[#F5F5F5]">symbols</strong> such as a percent sign (<code className="font-mono text-[#A1A1AA]">%</code>), comma (<code className="font-mono text-[#A1A1AA]">,</code>), or dollar sign (<code className="font-mono text-[#A1A1AA]">$</code>).
          </li>
        </ul>

        {/* Official Bluebook Examples Table */}
        <div>
          <div className="mb-2 text-xs font-semibold text-[#A1A1AA]">
            Examples
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#29292E]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#29292E] bg-[#18181B] text-[#E4E4E7]">
                  <th className="px-3.5 py-2.5 font-medium">Answer</th>
                  <th className="border-l border-[#29292E] px-3.5 py-2.5 font-medium">
                    Acceptable ways to enter answer
                  </th>
                  <th className="border-l border-[#29292E] px-3.5 py-2.5 font-medium">
                    Unacceptable: will NOT receive credit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#29292E] bg-[#0A0A0B] font-mono text-[13px]">
                <tr>
                  <td className="px-3.5 py-2.5 text-[#F5F5F5] align-top">3.5</td>
                  <td className="border-l border-[#29292E] px-3.5 py-2.5 text-emerald-300 space-y-0.5 align-top">
                    <div>3.5</div>
                    <div>3.50</div>
                    <div>7/2</div>
                  </td>
                  <td className="border-l border-[#29292E] px-3.5 py-2.5 text-red-300 space-y-0.5 align-top">
                    <div>31/2</div>
                    <div>3 1/2</div>
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2.5 text-[#F5F5F5] align-top font-sans">
                    <KatexFormula tex="\frac{2}{3}" />
                  </td>
                  <td className="border-l border-[#29292E] px-3.5 py-2.5 text-emerald-300 space-y-0.5 align-top">
                    <div>2/3</div>
                    <div>.6666</div>
                    <div>.6667</div>
                    <div>0.666</div>
                    <div>0.667</div>
                  </td>
                  <td className="border-l border-[#29292E] px-3.5 py-2.5 text-red-300 space-y-0.5 align-top">
                    <div>0.66</div>
                    <div>.66</div>
                    <div>0.67</div>
                    <div>.67</div>
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2.5 text-[#F5F5F5] align-top font-sans">
                    <KatexFormula tex="-\frac{1}{3}" />
                  </td>
                  <td className="border-l border-[#29292E] px-3.5 py-2.5 text-emerald-300 space-y-0.5 align-top">
                    <div>-1/3</div>
                    <div>-.3333</div>
                    <div>-0.333</div>
                  </td>
                  <td className="border-l border-[#29292E] px-3.5 py-2.5 text-red-300 space-y-0.5 align-top">
                    <div>-.33</div>
                    <div>-0.33</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
