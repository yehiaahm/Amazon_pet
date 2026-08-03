import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PosCatalogLine } from '../../core/pos/catalogDedupe';
import { PosCatalogCard } from './PosCatalogCard';

const MIN_COL_WIDTH = 170;
const CARD_HEIGHT = 110;
const GAP = 12;
const ROW_HEIGHT = CARD_HEIGHT + GAP;
const PADDING = 16;

export interface PosVirtualCatalogGridProps {
  items: PosCatalogLine[];
  onSelect: (item: PosCatalogLine) => void;
}

export const PosVirtualCatalogGrid: React.FC<PosVirtualCatalogGridProps> = ({ items, onSelect }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(4);

  const measureColumns = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const inner = Math.max(0, el.clientWidth - PADDING * 2);
    const cols = Math.max(1, Math.floor((inner + GAP) / (MIN_COL_WIDTH + GAP)));
    setColumnCount(cols);
  }, []);

  useEffect(() => {
    measureColumns();
    const el = parentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureColumns());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureColumns]);

  const rowCount = useMemo(
    () => (items.length === 0 ? 0 : Math.ceil(items.length / columnCount)),
    [items.length, columnCount]
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  if (items.length === 0) {
    return (
      <div
        ref={parentRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: PADDING,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        لا توجد أصناف مطابقة
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: PADDING,
        contain: 'strict',
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * columnCount;
          const rowItems = items.slice(startIdx, startIdx + columnCount);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: GAP,
              }}
            >
              {rowItems.map((item) => (
                <PosCatalogCard key={item.id} item={item} onSelect={onSelect} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PosVirtualCatalogGrid;
