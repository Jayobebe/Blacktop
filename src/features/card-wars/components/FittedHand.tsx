import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Fit a complete two-row hand, including labels and HP, without distorting faces. */
export function FittedHand({children}:{children:ReactNode}) {
 const host=useRef<HTMLDivElement>(null);
 const [width,setWidth]=useState(0);
 useLayoutEffect(()=>{
  const node=host.current;if(!node)return;
  const measure=()=>setWidth(Math.max(0,Math.min(node.clientWidth,720,(node.clientHeight-84)*15/14+76)));
  measure();const observer=new ResizeObserver(measure);observer.observe(node);
  return()=>observer.disconnect();
 },[]);
 return <div ref={host} className="cw-hand-fit"><div className="cw-fitted-deck" style={{width}}>{children}</div></div>;
}