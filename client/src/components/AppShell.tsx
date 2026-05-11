import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { MaterialIcon } from "./MaterialIcon";
import { Logo } from "./Logo";

// Material 3 Navigation Bar item.
// Active state uses a pill-shaped indicator behind the icon (per MD3 spec)
// instead of a colored background on the whole tab \u2014 this is the visual
// signature that says "Material" without us writing the word.
function NavItem({
  href,
  icon,
  label,
  active,
  testId,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  testId: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center gap-1 pt-3 pb-2 md-state-layer rounded-2xl mx-0.5"
      data-testid={testId}
      aria-label={label}
    >
      <div
        className={
          "relative flex items-center justify-center w-16 h-8 rounded-full transition-colors " +
          (active ? "bg-blue/15 dark:bg-blue/25" : "bg-transparent")
        }
      >
        <MaterialIcon
          name={icon}
          filled={active}
          size={24}
          weight={active ? 500 : 400}
          className={active ? "text-blue" : "text-foreground/70"}
        />
      </div>
      <span
        className={
          "md-label-medium leading-none " +
          (active ? "text-foreground font-semibold" : "text-foreground/70")
        }
      >
        {label}
      </span>
    </Link>
  );
}

export function AppShell({
  children,
  showBack,
  title,
  noNav = false,
  pageBg = "md-surface",
}: {
  children: ReactNode;
  showBack?: boolean;
  title?: string;
  noNav?: boolean;
  pageBg?: string;
}) {
  const [location, setLocation] = useLocation();
  const isHome = location === "/" || location === "";
  const isScan = location.startsWith("/scan");
  const isSettings = location.startsWith("/settings");

  return (
    <div className={`min-h-screen flex flex-col items-center ${pageBg}`}>
      {/* Mobile-first frame */}
      <div
        className={`w-full max-w-md flex-1 flex flex-col relative ${
          noNav ? "" : "pb-24"
        }`}
      >
        {/* Material 3 small top app bar: 64px tall, no shadow until scrolled.
            With back button: title is left-aligned next to the arrow.
            Without back button on Home: show full wordmark + logo.
            Without back button on other tabs (Scan/Settings): show wordmark only. */}
        <header className="sticky top-0 z-20 md-surface px-2 h-16 flex items-center">
          {showBack ? (
            <>
              <button
                onClick={() =>
                  window.history.length > 1 ? window.history.back() : setLocation("/")
                }
                className="w-12 h-12 rounded-full md-state-layer flex items-center justify-center flex-shrink-0"
                data-testid="button-back"
                aria-label="Go back"
              >
                <MaterialIcon name="arrow_back" size={24} />
              </button>
              {title && (
                <span className="md-title-large text-foreground ml-2 truncate">
                  {title}
                </span>
              )}
            </>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-2 pl-2 pr-3 h-12 rounded-full md-state-layer"
              data-testid="link-home"
            >
              <Logo size={28} />
              <span
                className="md-title-large font-medium"
                style={{ fontFamily: "'Roboto Flex', Roboto, sans-serif", letterSpacing: "0.005em" }}
              >
                CardConnect
              </span>
            </Link>
          )}
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        {/* Material 3 Navigation Bar (80px tall, three destinations) */}
        {!noNav && (
          <nav
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md-surface-container z-30 border-t border-[hsl(var(--md-outline-variant))]"
            role="navigation"
            aria-label="Primary"
          >
            <div className="grid grid-cols-3 h-20 pb-1 px-1">
              <NavItem
                href="/"
                icon="contacts"
                label="Contacts"
                active={isHome || location.startsWith("/contacts")}
                testId="link-tab-contacts"
              />
              <NavItem
                href="/scan"
                icon="document_scanner"
                label="Scan"
                active={isScan}
                testId="link-tab-scan"
              />
              <NavItem
                href="/settings"
                icon="settings"
                label="Settings"
                active={isSettings}
                testId="link-tab-settings"
              />
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
