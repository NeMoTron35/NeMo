import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Menu,
  Wallet,
  Command,
  Monitor,
  ShieldCheck,
  ArrowUpRight,
  Orbit,
  Terminal,
  FlaskConical,
  Waves,
  Boxes,
  Coins,
  Fingerprint,
  ScanLine,
  History,
  Settings2,
  HardDrive,
  Folder,
  Search,
  PanelLeft,
  BookOpen,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  publicNavigation,
  consoleNavigation,
  productNavigation,
  navigation,
  GITHUB_URL,
  METEORA_DBC_URL,
} from "@/lib/quantek/data";
import { useConsole } from "@/lib/quantek/context";
import { useWalletDialog } from "@/components/qli/wallet-dialog-context";
import { WindowChrome } from "@/components/qli/desktop-window";
import { useWindowPosition } from "@/components/qli/use-window-position";
const modules = [
  ["QLi Desk", "/", Monitor],
  ["QLi Operator", "/agent", Orbit],
  ["Launch Forge", "/launch", FlaskConical],
  ["Liquidity Chambers", "/pools", Waves],
  ["Inventory", "/positions", Boxes],
  ["Revenue", "/fees", Coins],
  ["Quantum Identity", "/identity", Fingerprint],
  ["Proof Inspector", "/verify", ScanLine],
  ["Event Log", "/audit", History],
  ["System", "/settings", Settings2],
] as const;
const groups = [
  { name: "WORKSPACE", items: publicNavigation },
  { name: "OPERATIONS", items: consoleNavigation },
  {
    name: "IDENTITY & VAULT",
    items: [
      ...productNavigation.filter((n) => n[1] !== "/launch"),
      ["My Vaults & Key", "/vaults"],
      ["Deposit", "/deposit"],
      ["Withdraw", "/withdraw"],
      ["Quantum Security", "/security"],
      ["Wallet Events", "/activity"],
    ] as const,
  },
];
export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const c = useConsole();
  const openWallet = useWalletDialog();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [q, setQ] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [utility, setUtility] = useState(true);
  const [utilityMin, setUtilityMin] = useState(false);
  const [min, setMin] = useState(false);
  const [max, setMax] = useState(false);
  const [focus, setFocus] = useState<"main" | "console">("console");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelMenuClose() {
    if (menuCloseTimer.current !== null) {
      clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
  }
  function openDesktopMenu(name: string) {
    cancelMenuClose();
    setActiveMenu(name);
  }
  function closeDesktopMenu() {
    cancelMenuClose();
    setActiveMenu(null);
  }
  function scheduleMenuClose() {
    cancelMenuClose();
    menuCloseTimer.current = setTimeout(() => setActiveMenu(null), 140);
  }
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest(".desktop-menu")) setActiveMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        const trigger = document.querySelector<HTMLElement>(".desktop-menu[open] summary");
        trigger?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      if (menuCloseTimer.current !== null) clearTimeout(menuCloseTimer.current);
    };
  }, []);
  const mainPosition = useWindowPosition();
  const consolePosition = useWindowPosition();
  const title = navigation.find((n) => n[1] === path)?.[0] ?? "Workspace";
  useEffect(() => {
    setMin(false);
  }, [path]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
  function resetWindows() {
    mainPosition.reset();
    consolePosition.reset();
    setMin(false);
    setMax(false);
    setUtility(true);
    setUtilityMin(false);
  }
  const links = groups.map((g) => (
    <div key={g.name}>
      <small>{g.name}</small>
      {g.items.map(([n, p], i) => (
        <Link
          key={p + i}
          to={p}
          activeProps={{ className: "active" }}
          activeOptions={{ exact: true }}
          onClick={() => {
            setMenu(false);
            setMin(false);
          }}
        >
          {n}
        </Link>
      ))}
    </div>
  ));
  const sourceList = groups.map((g, gi) => (
    <section key={g.name}>
      <h2>{g.name}</h2>
      {g.items.map(([n, p], i) => {
        const Icon = modules.find((m) => m[1] === p)?.[2] ?? (gi === 0 ? Folder : ShieldCheck);
        return (
          <Link
            key={p + i}
            to={p}
            activeProps={{ className: "active" }}
            activeOptions={{ exact: true }}
          >
            <Icon size={15} />
            <span>{n}</span>
          </Link>
        );
      })}
    </section>
  ));
  return (
    <TooltipProvider delayDuration={200}>
      <div className="aqua-desktop">
        <a className="skip-link" href="#workspace-content">
          Skip to Quantum QLi workspace
        </a>
        <header className="desktop-menu-bar">
          <nav aria-label="Desktop menu">
            <Link to="/" className="desktop-brand">
              <Orbit size={17} />
              <strong>Quantum QLi</strong>
            </Link>
            {["File", "View", "Tools", "Window", "Help"].map((name) => (
              <details
                className="desktop-menu"
                key={name}
                open={activeMenu === name}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") openDesktopMenu(name);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") scheduleMenuClose();
                }}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) closeDesktopMenu();
                }}
              >
                <summary
                  aria-expanded={activeMenu === name}
                  aria-controls={`desktop-menu-${name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    openDesktopMenu(name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      openDesktopMenu(name);
                      const parent = e.currentTarget.parentElement;
                      requestAnimationFrame(() => {
                        parent
                          ?.querySelector<HTMLElement>(
                            ".desktop-menu-popover a,.desktop-menu-popover button",
                          )
                          ?.focus();
                      });
                    }
                  }}
                >
                  {name}
                </summary>
                <div
                  id={`desktop-menu-${name}`}
                  className="desktop-menu-popover"
                  onClick={closeDesktopMenu}
                >
                  {name === "File" ? (
                    <>
                      <Link to="/launch">Open Launch Forge</Link>
                      <Link to="/vault">Open Vault Desk</Link>
                      <Button variant="ghost" onClick={() => setPalette(true)}>
                        Find application…
                      </Button>
                    </>
                  ) : name === "View" ? (
                    <>
                      <Button variant="ghost" onClick={() => setSidebar((v) => !v)}>
                        {sidebar ? "Hide" : "Show"} source list
                      </Button>
                      <Button variant="ghost" onClick={() => setUtility((v) => !v)}>
                        {utility ? "Hide" : "Show"} QLi Console
                      </Button>
                    </>
                  ) : name === "Tools" ? (
                    <>
                      <Link to="/verify">Proof Inspector</Link>
                      <Link to="/terminal">Trade Console</Link>
                      <Link to="/api-docs">API Reference</Link>
                      <Button variant="ghost" onClick={openWallet}>
                        Connect wallet
                      </Button>
                    </>
                  ) : name === "Window" ? (
                    <>
                      <Button variant="ghost" onClick={resetWindows}>
                        Arrange windows
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMin(false);
                          setFocus("main");
                        }}
                      >
                        Bring application forward
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setUtility(true);
                          setUtilityMin(false);
                          setFocus("console");
                        }}
                      >
                        Bring QLi Console forward
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link to="/docs">Quantum QLi Docs</Link>
                      <Link to="/whitepaper">White Paper</Link>
                      <Link to="/markets">Algorithm Atlas</Link>
                      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                        GitHub ↗
                      </a>
                    </>
                  )}
                </div>
              </details>
            ))}
          </nav>
          <div className="desktop-system">
            <span>{c.network === "devnet" ? "Devnet" : "Mainnet"}</span>
            <span>RPC · {c.rpcHealth}</span>
            <Button variant="ghost" onClick={openWallet} aria-label="Connect wallet">
              <Wallet size={14} />
              {c.account ? "Connected" : "Wallet"}
            </Button>
          </div>
        </header>
        <div className="desktop-icons">
          <Button asChild variant="ghost">
            <Link to="/vault">
              <HardDrive />
              <span>QLi Vault</span>
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/docs">
              <BookOpen />
              <span>Documentation</span>
            </Link>
          </Button>
        </div>
        <div className="desktop-stage">
          <main
            className={`aqua-primary-window ${min ? "window-is-minimized" : ""} ${max ? "window-is-maximized" : ""} ${focus === "main" ? "window-focused" : ""}`}
            style={{ translate: `${mainPosition.position.x}px ${mainPosition.position.y}px` }}
            onPointerDown={() => setFocus("main")}
            onFocusCapture={() => setFocus("main")}
            aria-label={`${title} application window`}
          >
            <WindowChrome
              title={
                path === "/whitepaper"
                  ? "Quantum QLi Technical White Paper"
                  : `Quantum QLi — ${title}`
              }
              minimized={min}
              maximized={max}
              onMinimize={() => setMin((v) => !v)}
              onMaximize={() => {
                setMax((v) => !v);
                setMin(false);
                mainPosition.reset();
              }}
              onReset={mainPosition.reset}
              grip={mainPosition.grip}
            />
            {!min && (
              <>
                <div className="finder-toolbar">
                  <div className="finder-tools">
                    <Button
                      variant="ghost"
                      className="qli-mobile-menu"
                      aria-label="Open navigation"
                      onClick={() => setMenu(true)}
                    >
                      <Menu />
                      <span>Apps</span>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setSidebar((v) => !v)}
                      aria-label="Toggle source list"
                    >
                      <PanelLeft />
                      <span>Sources</span>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link to="/launch">
                        <FlaskConical />
                        <span>Forge</span>
                      </Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link to="/verify">
                        <ScanLine />
                        <span>Inspect</span>
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setUtility((v) => !v);
                        setFocus("console");
                      }}
                      aria-label="Toggle QLi Console"
                    >
                      <Terminal />
                      <span>Console</span>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const n = c.network === "devnet" ? "mainnet-beta" : "devnet";
                        c.setNetwork(n);
                        c.setRpc(
                          n === "devnet"
                            ? "https://api.devnet.solana.com"
                            : "https://api.mainnet-beta.solana.com",
                        );
                      }}
                      aria-label={`Network ${c.network}. Switch network`}
                    >
                      <Activity />
                      <span>{c.network === "devnet" ? "Devnet" : "Mainnet"}</span>
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="finder-search"
                    aria-label="Open command palette"
                    onClick={() => setPalette(true)}
                  >
                    <Search size={15} />
                    <span>Find application</span>
                    <Command size={12} />
                  </Button>
                </div>
                <div className={`finder-layout ${sidebar ? "" : "source-hidden"}`}>
                  <aside className="finder-source-list" aria-label="Application sources">
                    {sourceList}
                  </aside>
                  <div className="qli-workspace">
                    <div id="workspace-content" tabIndex={-1}>
                      {children}
                    </div>
                    <footer className="qli-footer">
                      <span>
                        <ShieldCheck size={12} />
                        Wallet-controlled execution
                      </span>
                      <nav aria-label="Extended capabilities">
                        <Link to="/docs">Docs</Link>
                        <Link to="/whitepaper">White Paper</Link>
                        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                          GitHub ↗
                        </a>
                        <a href={METEORA_DBC_URL} target="_blank" rel="noopener noreferrer">
                          Meteora DBC ↗
                        </a>
                      </nav>
                    </footer>
                  </div>
                </div>
                <div className="finder-status">
                  <span>
                    {title} · {c.mode}
                  </span>
                  <span>
                    {c.identity
                      ? `Leaves ${256 - (c.ledger?.used.length ?? 0)} / 256`
                      : "Identity not open"}{" "}
                    · No submitted transaction
                  </span>
                </div>
              </>
            )}
          </main>
          {utility && (
            <section
              className={`aqua-utility-window ${utilityMin ? "window-is-minimized" : ""} ${focus === "console" ? "window-focused" : ""}`}
              style={{
                translate: `${consolePosition.position.x}px ${consolePosition.position.y}px`,
              }}
              onPointerDown={() => setFocus("console")}
              onFocusCapture={() => setFocus("console")}
              aria-label="QLi Console utility window"
            >
              <WindowChrome
                title="QLi Console"
                minimized={utilityMin}
                onMinimize={() => setUtilityMin((v) => !v)}
                onClose={() => setUtility(false)}
                onReset={consolePosition.reset}
                grip={consolePosition.grip}
              />
              {!utilityMin && (
                <div className="utility-output">
                  <div className="console-banner">QUANTUM QLi / SESSION MONITOR</div>
                  <p>
                    <span>network</span> {c.network} · RPC {c.rpcHealth}
                  </p>
                  <p>
                    <span>wallet</span>{" "}
                    {c.account ? "Connected · client-side signing" : "Not connected"}
                  </p>
                  <p>
                    <span>identity</span>{" "}
                    {c.identity
                      ? `${c.identity.label} · ${256 - (c.ledger?.used.length ?? 0)} leaves available`
                      : "Not open"}{" "}
                    · anchor {c.anchor.status}
                  </p>
                  <div className="console-divider" />
                  <p>
                    <span>policy</span> Review → simulate → wallet signs
                  </p>
                  <p>
                    <span>custody</span> No deployed vault verifier
                  </p>
                  <p>
                    <span>context</span> {title}
                  </p>
                  {c.plan ? (
                    <p>
                      <span>review</span> {c.plan.title} · {c.plan.steps.length} steps · not
                      submitted
                    </p>
                  ) : (
                    <p>
                      <span>review</span> No active transaction plan
                    </p>
                  )}
                  <p className="console-event">
                    <span>event</span> {c.events[0]?.title ?? "No session events"} · demo/session
                    record
                  </p>
                  <div className="console-prompt">
                    qli ${" "}
                    <span className="console-cursor" aria-hidden="true">
                      ▌
                    </span>
                  </div>
                  <div className="console-tools">
                    <Button asChild variant="ghost">
                      <Link to="/audit">Event Log</Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link to="/verify">Proof Inspector</Link>
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
        <nav className="aqua-dock" aria-label="Module Dock">
          {modules.map(([label, to, Icon], i) => (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  className={`dock-module dock-tone-${i % 4} ${path === to || (to === "/" && path === "/overview") ? "dock-active" : ""}`}
                >
                  <Link
                    to={to}
                    aria-label={label}
                    onClick={() => {
                      setMin(false);
                      setFocus("main");
                    }}
                  >
                    <span className="dock-icon">
                      <Icon />
                    </span>
                    <span className="dock-indicator" />
                    <span className="sr-only">{label}</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="dock-module dock-console"
                aria-label="Open QLi Console"
                onClick={() => {
                  setUtility(true);
                  setUtilityMin(false);
                  setFocus("console");
                }}
              >
                <span className="dock-icon">
                  <Terminal />
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>QLi Console</TooltipContent>
          </Tooltip>
        </nav>
        <Dialog open={menu} onOpenChange={setMenu}>
          <DialogContent className="qli-menu-dialog">
            <DialogTitle>Quantum QLi</DialogTitle>
            <DialogDescription>Applications and instruments</DialogDescription>
            <nav className="qli-menu-links" aria-label="Mobile navigation">
              {links}
            </nav>
          </DialogContent>
        </Dialog>
        <Dialog open={palette} onOpenChange={setPalette}>
          <DialogContent>
            <DialogTitle>Command center</DialogTitle>
            <DialogDescription>Quantum QLi applications</DialogDescription>
            <input
              aria-label="Search pages"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search applications…"
            />
            <div className="command-list">
              {navigation
                .filter(([n]) => n.toLowerCase().includes(q.toLowerCase()))
                .map(([n, p], i) => (
                  <Link
                    key={p + i}
                    to={p}
                    onClick={() => {
                      setPalette(false);
                      setMin(false);
                    }}
                  >
                    {n}
                    <ArrowUpRight />
                  </Link>
                ))}
            </div>
            {!navigation.some(([n]) => n.toLowerCase().includes(q.toLowerCase())) && (
              <p role="status">No matching applications.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
