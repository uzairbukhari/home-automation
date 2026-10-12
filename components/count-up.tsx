'use client';
import { useEffect, useRef, useState } from 'react';

/** Eases a number to its new value so a fresh reading is noticed. Renders the value at once under reduced motion. */
export function CountUp({ value, digits = 1 }: { value: number | null; digits?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value === null || from.current === null || matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return; }
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600), eased = 1 - Math.pow(1 - t, 3), v = a + (b - a) * eased;
      from.current = v; setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown === null ? '—' : shown.toFixed(digits)}</>;
}
