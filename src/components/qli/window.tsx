import { useState, type ReactNode } from "react";
import { Minus, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
export function DeskWindow({
  title,
  children,
  status,
  controls = true,
}: {
  title: string;
  children: ReactNode;
  status?: string;
  controls?: boolean;
}) {
  const [min, setMin] = useState(false);
  const [max, setMax] = useState(false);
  return (
    <section className={`desk-window ${max ? "desk-maximized" : ""}`}>
      <header className="desk-title">
        <h2>{title}</h2>
        <span>{status}</span>
        {controls && (
          <div>
            <Button
              variant="outline"
              size="icon"
              aria-label={`${min ? "Restore" : "Minimize"} ${title}`}
              title={`${min ? "Restore" : "Minimize"} ${title}`}
              onClick={() => setMin(!min)}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={`${max ? "Restore size" : "Maximize"} ${title}`}
              title={`${max ? "Restore size" : "Maximize"} ${title}`}
              onClick={() => {
                setMax(!max);
                setMin(false);
              }}
            >
              {max ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
        )}
      </header>
      {!min && <div className="desk-body">{children}</div>}
    </section>
  );
}