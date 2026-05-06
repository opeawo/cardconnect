import { Link, useLocation } from "wouter";
import { ScanLine, Users, ArrowLeft } from "lucide-react";
import { ReactNode } from "react";

export function AppShell({
  children,
  showBack,
  title,
}: {
  children: ReactNode;
  showBack?: boolean;
  title?: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center">
      {/* Mobile-first frame: max-w-md so it feels like an app even on desktop */}
      <div className="w-full max-w-md flex-1 flex flex-col relative pb-24">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBack ? (
              <button
                onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/")}
                className="p-1.5 -ml-1.5 rounded-lg hover-elevate active-elevate-2"
                data-testid="button-back"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Link href="/" className="flex items-center gap-2" data-testid="link-home">
                <div className="w-7 h-7 rounded-lg bg-blue flex items-center justify-center">
                  <ScanLine className="w-4 h-4 text-white" />
                </div>
                <span
                  className="font-display text-xl uppercase tracking-wide"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  CardConnect
                </span>
              </Link>
            )}
          </div>
          {title && (
            <span
              className="font-display text-base uppercase tracking-wider text-muted-foreground"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {title}
            </span>
          )}
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-background/95 backdrop-blur border-t border-border z-30">
          <div className="grid grid-cols-2 h-20 pb-2">
            <Link
              href="/"
              className="flex flex-col items-center justify-center gap-1.5 hover-elevate active-elevate-2"
              data-testid="link-tab-contacts"
            >
              <div className="w-9 h-9 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold leading-none">Contacts</span>
            </Link>
            <Link
              href="/scan"
              className="flex flex-col items-center justify-center gap-1.5 hover-elevate active-elevate-2"
              data-testid="link-tab-scan"
            >
              <div className="w-9 h-9 rounded-full bg-blue flex items-center justify-center">
                <ScanLine className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-semibold leading-none">Scan</span>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
