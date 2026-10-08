import { useEffect, useState, type RefObject } from 'react';

// One observer for every element that asks: a vault can hold a hundred cards.
const callbacks = new WeakMap<Element, (on: boolean) => void>();
let observer: IntersectionObserver | null = null;
function watch(el: Element, cb: (on: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    cb(true);
    return () => undefined;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) callbacks.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin: '80px' },
  );
  callbacks.set(el, cb);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}

/**
 * Whether the element is on screen (or about to be). For anything that
 * animates only while it can be seen: a card's finish, in a list far longer
 * than the screen. `off` skips the watching altogether (and answers no).
 */
export function useOnScreen(ref: RefObject<Element>, off = false): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (off || !el) return setOn(false);
    return watch(el, setOn);
  }, [ref, off]);
  return on;
}
