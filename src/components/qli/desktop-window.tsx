import { useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { GripHorizontal, RotateCcw, Minus, Maximize2, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useWindowPosition } from "./use-window-position";

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
