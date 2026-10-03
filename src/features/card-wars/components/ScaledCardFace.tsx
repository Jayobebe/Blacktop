import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Scale the complete vault face, rather than compressing individual card sections. */
export function ScaledCardFace({ children }: { children: ReactNode }) {
 const ref = useRef<HTMLDivElement>(null);
 const [width, setWidth] = useState(280);
 useLayoutEffect(() => {
  const node = ref.current;
  if (!node) return;
  const measure = () => setWidth(node.getBoundingClientRect().width);
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(node);
  return () => observer.disconnect();
 }, []);
 return <div ref={ref} className="cw-scaled-face"><div className="cw-face-canvas" style={{ transform: `scale(${width / 280})` }}>{children}</div></div>;
}