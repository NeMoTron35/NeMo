import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";

export function useWindowPosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const bounded = (x: number, y: number) => ({
    x: Math.max(-100, Math.min(100, x)),
    y: Math.max(-45, Math.min(110, y)),
  });
  function down(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || window.innerWidth <= 1000) return;
    drag.current = { x: e.clientX, y: e.clientY, startX: position.x, startY: position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (d) setPosition(bounded(d.startX + e.clientX - d.x, d.startY + e.clientY - d.y));
  }
  function up() {
    drag.current = null;
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    const delta = e.shiftKey ? 30 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setPosition((p) => bounded(p.x + m[0], p.y + m[1]));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPosition({ x: 0, y: 0 });
    }
  }
  return {
    position,
    reset: () => setPosition({ x: 0, y: 0 }),
    grip: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: up,
      onKeyDown: key,
    },
  };
}