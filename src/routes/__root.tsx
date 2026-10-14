import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportRuntimeError } from "../lib/error-reporting";
import { useConsole } from "@/lib/qli-core/context";
import { ConsoleProvider } from "@/lib/qli-core/console-provider";
import { Shell } from "@/components/qli-core/shell";
import { Button } from "@/components/ui/button";
import { Geometry } from "@/components/qli-core/geometry";
import { VaultProvider } from "@/lib/qli/vault";
import { WalletProvider } from "@/components/qli/wallet";
import { ReviewModal } from "@/components/qli-core/controls";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Quantum QLi · Page unavailable
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This Quantum QLi workspace address is unavailable. Your wallet is unaffected.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Return to Quantum QLi
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportRuntimeError(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Quantum QLi could not load this page
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No transaction was submitted by this error screen. Retry or return to the Quantum QLi
          workspace.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Return to Quantum QLi
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: "Quantum QLi — Liquidity Operations" },
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content: "Non-custodial Solana liquidity operations and post-quantum provenance.",
      },
      { property: "og:title", content: "Quantum QLi — Liquidity Operations" },
      {
        property: "og:description",
        content: "Non-custodial Solana liquidity operations and post-quantum provenance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=VT323&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  pendingComponent: () => (
    <div className="empty-state" role="status">
      <Geometry compact />
      Loading Quantum QLi workspace…
    </div>
  ),
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pitch = useRouterState({
    select: (state) => state.location.pathname === "/hackathon-pitch",
  });

  if (pitch)
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    );

  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleProvider>
        <VaultProvider>
          <WalletProvider>
            <Shell>
              <Outlet />
            </Shell>
          </WalletProvider>
        </VaultProvider>
        <TransactionReview />
      </ConsoleProvider>
    </QueryClientProvider>
  );
}

function TransactionReview() {
  const { plan, setPlan } = useConsole();
  return <ReviewModal plan={plan} onClose={() => setPlan(null)} />;
}
