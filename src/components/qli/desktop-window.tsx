import { useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { GripHorizontal, RotateCcw, Minus, Maximize2, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function WindowChrome({
  title,
  minimized,
  maximized,
  onMinimize,
  onMaximize,
  onClose,
  onReset,
  grip,
  children,
}: {
  title: string;
  minimized?: boolean;
  maximized?: boolean;
  onMinimize: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onReset: () => void;
  grip: ReturnType<typeof useWindowPosition>["grip"];
  children?: ReactNode;
}) {
  return (
    <header className="aqua-window-title">
      <div className="aqua-window-lights">
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="window-light window-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X />
          </Button>
        ) : (
          <span className="window-light window-close" aria-hidden="true" />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="window-light window-minimize"
          aria-label={`${minimized ? "Restore" : "Minimize"} ${title}`}
          onClick={onMinimize}
        >
          <Minus />
        </Button>
        {onMaximize ? (
          <Button
            variant="ghost"
            size="icon"
            className="window-light window-zoom"
            aria-label={`${maximized ? "Restore size" : "Maximize"} ${title}`}
            onClick={onMaximize}
          >
            {maximized ? <Minimize2 /> : <Maximize2 />}
          </Button>
        ) : (
          <span className="window-light window-zoom" aria-hidden="true" />
        )}
      </div>
      <span className="aqua-centered-title">{title}</span>
      <div className="window-movement">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move ${title}`}
          title="Move window · arrow keys; Home resets"
          className="window-drag-grip"
          {...grip}
        >
          <GripHorizontal />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Reset position ${title}`}
          title="Reset window position"
          onClick={onReset}
        >
          <RotateCcw />
        </Button>
        {children}
      </div>
    </header>
  );
}