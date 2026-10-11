import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowUpRight, Copy, Check, ShieldCheck } from "lucide-react";
import { useState, useId, isValidElement, cloneElement } from "react";
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Panel({
  title,
  tag,
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`instrument ${className}`}>
      <header className="panel-heading">
        <h2>{title}</h2>
        {tag && <span className="micro">{tag}</span>}
      </header>
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string | undefined;
}) {
  const id = useId();
  const control =
    isValidElement<{ id?: string; "aria-describedby"?: string | undefined }>(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type);
  return (
    <div className="field">
      {control ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {control
        ? cloneElement(children, { id, "aria-describedby": hint ? `${id}-hint` : undefined })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="copy-value"
        title="Copy value"
        aria-label="Copy value"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setError(false);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setError(true);
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
        <span className="truncate font-mono">{copied ? "Copied" : value}</span>
      </Button>
      {error && (
        <small role="alert" className="text-muted-foreground">
          Clipboard unavailable. Select the value to copy manually.
        </small>
      )}
    </>
  );
}
export type Plan = {
  title: string;
  steps: string[];
  accounts: string[];
  fee: string;
  signatures: number;
};
export function ReviewModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!plan}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="review-dialog">
        <DialogTitle>{plan?.title}</DialogTitle>
        <DialogDescription>
          Simulation preview. No transaction has been submitted.
        </DialogDescription>
        <span className="status-tag">UNSIGNED · DEMO</span>
        <ol className="plan-steps">
          {plan?.steps.map((s, i) => (
            <li key={s}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="detail-rows">
          <div>
            <span>Estimated network fee</span>
            <strong>{plan?.fee}</strong>
          </div>
          <div>
            <span>Wallet signing checkpoints</span>
            <strong>{plan?.signatures}</strong>
          </div>
        </div>
        <div className="eyebrow">ACCOUNTS TOUCHED</div>
        <div className="code-block">{plan?.accounts.join("\n")}</div>
        <div className="notice">
          <ShieldCheck size={16} />
          Wallet signs locally. Live execution requires verified on-chain accounts and a reviewed
          SDK transaction.
        </div>
        <Button disabled>
          <ArrowUpRight />
          Live signing unavailable in demo
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close preview
        </Button>
      </DialogContent>
    </Dialog>
  );
}
import { Info } from "lucide-react";
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} role="img" aria-label={text} title={text}>
      <Info aria-hidden="true" />
    </span>
  );
}

/** Compact copy-only control for chrome bars: one square click copies the value. */
export function CaCopy({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <Button
      variant="ghost"
      className="ca-copy"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setError(false);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setError(true);
          setTimeout(() => setError(false), 3000);
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}