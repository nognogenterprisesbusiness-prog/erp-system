type ScrollContainer = { style: { overflow: string } };
const locks = new WeakMap<ScrollContainer, { count: number; previous: string }>();

/** Loading and ready panels may overlap during a streamed route transition. */
export function lockBodyScroll(body: ScrollContainer) {
  const lock = locks.get(body) ?? { count: 0, previous: body.style.overflow };
  lock.count += 1;
  locks.set(body, lock);
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.count -= 1;
    if (lock.count === 0) {
      body.style.overflow = lock.previous;
      locks.delete(body);
    }
  };
}
