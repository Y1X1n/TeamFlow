'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SlidingIndicator {
  left: number;
  width: number;
  measured: boolean;
  animated: boolean;
}

export function useSlidingIndicator(activeKey: string | undefined) {
  const containerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [indicator, setIndicator] = useState<SlidingIndicator>({
    left: 0,
    width: 0,
    measured: false,
    animated: false,
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setIndicator((previous) => ({ ...previous, animated: true })),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const item = activeKey ? itemRefs.current.get(activeKey) : null;
      if (!container || !item) {
        setIndicator((previous) =>
          previous.measured ? { ...previous, measured: false } : previous,
        );
        return;
      }
      setIndicator((previous) => ({
        ...previous,
        left: item.offsetLeft,
        width: item.offsetWidth,
        measured: true,
      }));
    };

    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    if (activeKey) {
      const item = itemRefs.current.get(activeKey);
      if (item) observer.observe(item);
    }
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [activeKey]);

  const registerItem = useCallback((key: string, node: HTMLElement | null) => {
    if (node) itemRefs.current.set(key, node);
    else itemRefs.current.delete(key);
  }, []);

  return { containerRef, registerItem, indicator };
}
