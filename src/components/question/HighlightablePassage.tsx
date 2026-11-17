'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Check, Trash2 } from 'lucide-react';
import type { HighlightColor, PassageHighlight } from '@/types';
import { RichMathContent } from '@/components/question/RichMathContent';
import { soundEngine } from '@/services/sound/soundEngine';

export type { HighlightColor, PassageHighlight };

export const HIGHLIGHT_COLORS: ReadonlyArray<{
  id: HighlightColor;
  label: string;
  swatchClass: string;
}> = [
  { id: 'yellow', label: 'Yellow', swatchClass: 'bg-amber-400' },
  { id: 'green', label: 'Green', swatchClass: 'bg-[#69ff00]' },
  { id: 'blue', label: 'Blue', swatchClass: 'bg-sky-400' },
  { id: 'red', label: 'Red', swatchClass: 'bg-red-500' },
];

interface HighlightablePassageProps {
  html?: string;
  highlights: PassageHighlight[];
  onChangeHighlights: (next: PassageHighlight[]) => void;
}

interface FloatingPopoverState {
  x: number;
  y: number;
  placeBelow: boolean;
  mode: 'selection' | 'existing';
  start?: number;
  end?: number;
  existingId?: string;
  existingColor?: HighlightColor;
}

const SKIP_TEXT_ANCESTORS = '.katex-mathml, .sr-only, script, style, annotation';

function createHighlightId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getVisibleTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_TEXT_ANCESTORS)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue || node.nodeValue.length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function unwrapPassageHighlights(root: HTMLElement): void {
  const marks = Array.from(root.querySelectorAll('mark[data-sat-hl]'));
  if (marks.length === 0) return;

  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
  root.normalize();
}

function resolveGlobalBoundaryOffset(
  textNodes: Text[],
  container: Node,
  offset: number
): number {
  const boundary = document.createRange();
  boundary.setStart(container, offset);
  boundary.collapse(true);

  let acc = 0;
  for (const textNode of textNodes) {
    const len = textNode.nodeValue?.length || 0;
    if (textNode === container) {
      return acc + Math.max(0, Math.min(len, offset));
    }

    const nodeStart = document.createRange();
    nodeStart.setStart(textNode, 0);
    nodeStart.collapse(true);

    if (boundary.compareBoundaryPoints(Range.START_TO_START, nodeStart) <= 0) {
      return acc;
    }

    acc += len;
  }

  return acc;
}

function locateNodeAtGlobalOffset(
  textNodes: Text[],
  targetOffset: number
): { node: Text; offset: number } | null {
  if (textNodes.length === 0) return null;

  let acc = 0;
  for (const textNode of textNodes) {
    const len = textNode.nodeValue?.length || 0;
    if (targetOffset <= acc + len) {
      return {
        node: textNode,
        offset: Math.max(0, Math.min(len, targetOffset - acc)),
      };
    }
    acc += len;
  }

  const last = textNodes[textNodes.length - 1];
  return { node: last, offset: last.nodeValue?.length || 0 };
}

function normalizeAndMergeHighlights(
  list: PassageHighlight[]
): PassageHighlight[] {
  const valid = list
    .filter((h) => h.end > h.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: PassageHighlight[] = [];
  for (const item of valid) {
    const prev = merged[merged.length - 1];
    if (prev && prev.color === item.color && prev.end >= item.start) {
      prev.end = Math.max(prev.end, item.end);
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

function upsertHighlightRange(
  existing: PassageHighlight[],
  start: number,
  end: number,
  color: HighlightColor
): PassageHighlight[] {
  if (end <= start) return existing;

  const updated: PassageHighlight[] = [];
  for (const item of existing) {
    if (item.end <= start || item.start >= end) {
      updated.push(item);
      continue;
    }
    if (item.start < start) {
      updated.push({
        id: item.id,
        start: item.start,
        end: start,
        color: item.color,
      });
    }
    if (item.end > end) {
      updated.push({
        id: item.start < start ? createHighlightId() : item.id,
        start: end,
        end: item.end,
        color: item.color,
      });
    }
  }

  updated.push({
    id: createHighlightId(),
    start,
    end,
    color,
  });

  return normalizeAndMergeHighlights(updated);
}

function applyHighlightsToDom(
  root: HTMLElement,
  highlights: PassageHighlight[]
): void {
  unwrapPassageHighlights(root);
  if (highlights.length === 0) return;

  const sorted = normalizeAndMergeHighlights(highlights);
  const textNodes = getVisibleTextNodes(root);
  if (textNodes.length === 0) return;

  let acc = 0;
  for (const textNode of textNodes) {
    const len = textNode.nodeValue?.length || 0;
    const nodeStart = acc;
    const nodeEnd = acc + len;
    acc = nodeEnd;

    if (len === 0) continue;

    // Collect highlights intersecting this text node in descending offset order
    // so splitting text nodes right-to-left keeps earlier local offsets intact.
    const overlapping = sorted
      .filter((hl) => hl.end > nodeStart && hl.start < nodeEnd)
      .sort((a, b) => b.start - a.start);

    if (overlapping.length === 0) continue;

    const currentNode: Text = textNode;
    for (const hl of overlapping) {
      const localStart = Math.max(0, hl.start - nodeStart);
      const localEnd = Math.min(currentNode.length, hl.end - nodeStart);
      if (localEnd <= localStart) continue;

      if (localEnd < currentNode.length) {
        currentNode.splitText(localEnd);
      }
      const sliceNode =
        localStart > 0 ? currentNode.splitText(localStart) : currentNode;

      const mark = document.createElement('mark');
      mark.setAttribute('data-sat-hl', hl.id);
      mark.setAttribute('data-hl-color', hl.color);
      mark.className = `sat-hl sat-hl-${hl.color}`;

      const parent = sliceNode.parentNode;
      if (parent) {
        parent.insertBefore(mark, sliceNode);
        mark.appendChild(sliceNode);
      }
    }
  }
}

export const HighlightablePassage: React.FC<HighlightablePassageProps> = ({
  html,
  highlights,
  onChangeHighlights,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const isPointerSelectingRef = useRef<boolean>(false);
  const selectionTimerRef = useRef<number | null>(null);
  const [popover, setPopover] = useState<FloatingPopoverState | null>(null);

  // Re-apply marks cleanly whenever passage html or highlight list updates
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    applyHighlightsToDom(root, highlights);
  }, [html, highlights]);

  // Clear popover whenever the passage changes
  useEffect(() => {
    setPopover(null);
  }, [html]);

  const computeFloatingAnchor = useCallback((rect: DOMRect) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const x = Math.max(88, Math.min(vw - 88, rect.left + rect.width / 2));
    const placeBelow = rect.top < 118;
    const y = placeBelow ? rect.bottom + 8 : rect.top - 8;
    return { x, y, placeBelow };
  }, []);

  /**
   * Read the current DOM Selection inside the passage container, strip any
   * leading/trailing whitespace (especially the space after a double-clicked word),
   * snap the browser Selection tightly onto the trimmed characters, and return
   * normalized global character offsets.
   */
  const extractAndTrimPassageSelection = useCallback((): {
    start: number;
    end: number;
    rect: DOMRect;
  } | null => {
    const root = containerRef.current;
    if (!root || typeof window === 'undefined') return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    const rawRange = sel.getRangeAt(0);
    if (
      !root.contains(rawRange.startContainer) ||
      !root.contains(rawRange.endContainer)
    ) {
      return null;
    }

    const textNodes = getVisibleTextNodes(root);
    if (textNodes.length === 0) return null;

    const fullText = textNodes.map((n) => n.nodeValue || '').join('');
    const rawStart = resolveGlobalBoundaryOffset(
      textNodes,
      rawRange.startContainer,
      rawRange.startOffset
    );
    const rawEnd = resolveGlobalBoundaryOffset(
      textNodes,
      rawRange.endContainer,
      rawRange.endOffset
    );

    let start = Math.min(rawStart, rawEnd);
    let end = Math.max(rawStart, rawEnd);

    while (start < end && /\s/.test(fullText[start])) {
      start++;
    }
    while (end > start && /\s/.test(fullText[end - 1])) {
      end--;
    }

    if (end <= start) return null;

    let activeRange = rawRange;
    if (start !== Math.min(rawStart, rawEnd) || end !== Math.max(rawStart, rawEnd)) {
      const startLoc = locateNodeAtGlobalOffset(textNodes, start);
      const endLoc = locateNodeAtGlobalOffset(textNodes, end);
      if (startLoc && endLoc) {
        const trimmedRange = document.createRange();
        trimmedRange.setStart(startLoc.node, startLoc.offset);
        trimmedRange.setEnd(endLoc.node, endLoc.offset);
        sel.removeAllRanges();
        sel.addRange(trimmedRange);
        activeRange = trimmedRange;
      }
    }

    const rect = activeRange.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    return { start, end, rect };
  }, []);

  const commitSelectionHighlight = useCallback(
    (start: number, end: number, color: HighlightColor) => {
      soundEngine.play('select');
      onChangeHighlights(upsertHighlightRange(highlights, start, end, color));
      window.getSelection()?.removeAllRanges();
      setPopover(null);
    },
    [highlights, onChangeHighlights]
  );

  const finalizeSelectionInteraction = useCallback(() => {
    const info = extractAndTrimPassageSelection();
    if (!info) return;

    const anchor = computeFloatingAnchor(info.rect);
    setPopover((prev) => {
      if (
        prev?.mode === 'selection' &&
        prev.start === info.start &&
        prev.end === info.end &&
        Math.abs(prev.x - anchor.x) < 1 &&
        Math.abs(prev.y - anchor.y) < 1
      ) {
        return prev;
      }
      return {
        ...anchor,
        mode: 'selection',
        start: info.start,
        end: info.end,
      };
    });
  }, [computeFloatingAnchor, extractAndTrimPassageSelection]);

  const scheduleFinalizeSelection = useCallback(
    (delayMs = 0) => {
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
      }
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null;
        if (!isPointerSelectingRef.current) {
          finalizeSelectionInteraction();
        }
      }, delayMs);
    },
    [finalizeSelectionInteraction]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selectionTimerRef.current !== null) {
      window.clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }
    isPointerSelectingRef.current = true;
    const target = e.target as HTMLElement | null;
    if (!target?.closest('mark[data-sat-hl]')) {
      setPopover(null);
    }
  };

  const handlePointerUp = () => {
    isPointerSelectingRef.current = false;
    // Defer 0ms so native single/double-click selection updates commit first
    scheduleFinalizeSelection(0);
  };

  const handleDoubleClick = () => {
    isPointerSelectingRef.current = false;
    scheduleFinalizeSelection(0);
  };

  // Handle touch/keyboard selection changes gracefully & ensure pointer state never sticks if released outside
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleGlobalPointerEnd = () => {
      if (!isPointerSelectingRef.current) return;
      isPointerSelectingRef.current = false;
      scheduleFinalizeSelection(0);
    };

    const handleSelectionChange = () => {
      if (isPointerSelectingRef.current) return;
      const root = containerRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return;
      }
      const r = sel.getRangeAt(0);
      if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) {
        return;
      }

      scheduleFinalizeSelection(140);
    };

    window.addEventListener('pointerup', handleGlobalPointerEnd);
    window.addEventListener('pointercancel', handleGlobalPointerEnd);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      window.removeEventListener('pointerup', handleGlobalPointerEnd);
      window.removeEventListener('pointercancel', handleGlobalPointerEnd);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [scheduleFinalizeSelection]);

  // Dismiss floating popover cleanly on scroll, escape, or outside click
  useEffect(() => {
    if (!popover) return;

    const closeOnScroll = () => setPopover(null);
    const closeOnKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null);
    };
    const closeOnOutsideClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (popoverRef.current?.contains(t)) return;
      if (t?.closest('mark[data-sat-hl]')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      setPopover(null);
    };

    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('keydown', closeOnKey);
    document.addEventListener('mousedown', closeOnOutsideClick);

    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('keydown', closeOnKey);
      document.removeEventListener('mousedown', closeOnOutsideClick);
    };
  }, [popover]);

  const handlePassageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    const target = e.target as HTMLElement | null;
    const markEl = target?.closest('mark[data-sat-hl]') as HTMLElement | null;
    if (!markEl) {
      setPopover(null);
      return;
    }

    const existingId = markEl.getAttribute('data-sat-hl');
    if (!existingId) return;

    const found = highlights.find((h) => h.id === existingId);
    if (!found) return;

    const anchor = computeFloatingAnchor(markEl.getBoundingClientRect());
    setPopover({
      ...anchor,
      mode: 'existing',
      existingId: found.id,
      existingColor: found.color,
    });
  };

  const handleRecolorExisting = (color: HighlightColor) => {
    if (!popover?.existingId) return;
    soundEngine.play('select');
    onChangeHighlights(
      normalizeAndMergeHighlights(
        highlights.map((h) =>
          h.id === popover.existingId ? { ...h, color } : h
        )
      )
    );
    setPopover(null);
  };

  const handleDeleteExisting = () => {
    if (!popover?.existingId) return;
    soundEngine.play('restore');
    onChangeHighlights(highlights.filter((h) => h.id !== popover.existingId));
    setPopover(null);
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onClick={handlePassageClick}
      >
        <RichMathContent html={html} variant="passage" />
      </div>

      {/* Floating Compact Highlight / Recolor / Delete Popover */}
      {popover && (
        <div
          ref={popoverRef}
          role="toolbar"
          aria-label="Passage highlight options"
          style={{
            left: `${popover.x}px`,
            top: `${popover.y}px`,
            transform: popover.placeBelow
              ? 'translate(-50%, 0)'
              : 'translate(-50%, -100%)',
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-50 flex items-center gap-1.5 rounded-full border border-[#3F3F46] bg-[#141417]/95 px-2.5 py-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl animate-page-fade"
        >

          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => {
              const isCurrentExisting =
                popover.mode === 'existing' && popover.existingColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (
                      popover.mode === 'selection' &&
                      popover.start !== undefined &&
                      popover.end !== undefined
                    ) {
                      commitSelectionHighlight(popover.start, popover.end, c.id);
                    } else if (popover.mode === 'existing') {
                      handleRecolorExisting(c.id);
                    }
                  }}
                  title={
                    popover.mode === 'selection'
                      ? `Highlight ${c.label}`
                      : `Switch to ${c.label}`
                  }
                  aria-label={
                    popover.mode === 'selection'
                      ? `Highlight in ${c.label}`
                      : `Change highlight color to ${c.label}`
                  }
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${c.swatchClass} transition-transform hover:scale-110 active:scale-95 cursor-pointer ${
                    isCurrentExisting
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141417]'
                      : ''
                  }`}
                >
                  {isCurrentExisting && (
                    <Check className="h-3 w-3 stroke-[3] text-[#0A0A0B]" />
                  )}
                </button>
              );
            })}
          </div>

          {popover.mode === 'existing' && (
            <>
              <div className="mx-0.5 h-4 w-px bg-[#29292E]" />
              <button
                type="button"
                onClick={handleDeleteExisting}
                title="Remove highlight"
                aria-label="Remove highlight"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-red-500/15 hover:text-red-300 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
