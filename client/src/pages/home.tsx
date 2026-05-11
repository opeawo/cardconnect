import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import type { Contact } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { InstallPrompt } from "@/components/InstallPrompt";
import { MaterialIcon } from "@/components/MaterialIcon";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
}

export default function Home() {
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });
  const { data: gstatus } = useQuery<GoogleStatus>({
    queryKey: ["/api/google/status"],
  });
  const [q, setQ] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "CardConnect — The card-to-contacts app Google never built";
    return () => {
      document.title = "CardConnect";
    };
  }, []);

  const filtered = contacts.filter((c) => {
    if (!q.trim()) return true;
    const hay = [c.name, c.title, c.company, c.metContext, c.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const isEmpty = !isLoading && contacts.length === 0;

  return (
    <AppShell>
      {/* ---------- Hero / positioning ---------- */}
      <section className="px-4 pt-4 pb-5">
        <div
          className="rounded-[28px] px-5 py-7 md-elevation-1 relative overflow-hidden text-[hsl(220_6%_10%)]"
          style={{
            background:
              "linear-gradient(135deg, hsl(217 91% 95%) 0%, hsl(220 17% 98%) 100%)",
          }}
        >
          {/* Floating Google-coloured dots so the hero feels playful */}
          <span
            aria-hidden
            className="absolute -top-3 -right-3 w-20 h-20 rounded-full"
            style={{ background: "hsl(var(--google-yellow) / 0.25)" }}
          />
          <span
            aria-hidden
            className="absolute -bottom-6 -left-6 w-16 h-16 rounded-full"
            style={{ background: "hsl(var(--google-green) / 0.20)" }}
          />
          <span
            aria-hidden
            className="absolute top-12 -right-8 w-12 h-12 rounded-full"
            style={{ background: "hsl(var(--google-red) / 0.18)" }}
          />

          <div className="relative">
            <p className="md-label-medium text-blue uppercase tracking-widest font-semibold">
              CardConnect
            </p>
            <h1
              className="md-headline-large mt-2"
              style={{
                fontFamily: "'Roboto Flex', Roboto, sans-serif",
                letterSpacing: "-0.01em",
              }}
              data-testid="text-hero-title"
            >
              Business cards{" "}
              <span aria-hidden className="text-blue">
                →
              </span>{" "}
              your contacts.
              <br />
              <span className="opacity-60 font-normal italic">Instantly.</span>
            </h1>
            <p className="mt-3 md-body-medium opacity-80">
              The card-to-contacts app{" "}
              <span className="font-semibold">Google never built.</span>{" "}
              Snap a card, find them on LinkedIn, and we drop them straight into your phone and Google Contacts.
            </p>

            {/* CTAs */}
            <div className="mt-5 flex items-center gap-2">
              <Link href="/scan" className="flex-1">
                <button
                  className="w-full h-12 px-6 rounded-full bg-blue text-white md-label-large font-medium md-state-layer md-elevation-1 inline-flex items-center justify-center gap-2"
                  data-testid="button-scan-cta"
                >
                  <MaterialIcon name="document_scanner" size={20} className="text-white" />
                  Scan a card
                </button>
              </Link>
              {gstatus?.configured && !gstatus?.connected && (
                <Link href="/settings">
                  <button
                    className="h-12 px-5 rounded-full bg-white text-[hsl(220_6%_10%)] md-label-large font-medium md-state-layer border border-[hsl(220_6%_88%)] inline-flex items-center justify-center gap-2"
                    data-testid="button-connect-google-cta"
                  >
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className="g-blue font-bold">G</span>
                      <span className="g-red font-bold">o</span>
                      <span className="g-yellow font-bold">o</span>
                      <span className="g-blue font-bold">g</span>
                      <span className="g-green font-bold">l</span>
                      <span className="g-red font-bold">e</span>
                    </span>
                    Connect
                  </button>
                </Link>
              )}
            </div>

            {gstatus?.connected && (
              <p
                className="mt-3 md-body-small opacity-70 inline-flex items-center gap-1.5"
                data-testid="text-google-connected-hint"
              >
                <MaterialIcon name="check_circle" filled size={16} className="text-[hsl(var(--google-green))]" />
                Syncing to {gstatus.email || "your Google account"}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Install-as-app row */}
      <section className="px-4">
        <InstallPrompt />
      </section>

      {/* ---------- Search (Material 3 search bar) ---------- */}
      <section className="px-4 pt-3 pb-2">
        <div className="md-surface-container rounded-full h-14 px-2 flex items-center md-elevation-1">
          <button
            className="w-12 h-12 rounded-full md-state-layer flex items-center justify-center text-foreground/70"
            aria-label="Search"
            type="button"
          >
            <MaterialIcon name="search" size={22} />
          </button>
          <input
            placeholder="Search contacts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none border-0 md-body-large placeholder:text-foreground/50 text-foreground"
            data-testid="input-search"
            aria-label="Search contacts"
          />
          {q && (
            <button
              className="w-10 h-10 rounded-full md-state-layer flex items-center justify-center text-foreground/60"
              onClick={() => setQ("")}
              aria-label="Clear search"
              type="button"
            >
              <MaterialIcon name="close" size={20} />
            </button>
          )}
        </div>
      </section>

      {/* ---------- Section header ---------- */}
      <section className="px-5 pt-4 pb-1">
        <h2 className="md-title-small text-foreground/65 uppercase tracking-wider">
          {isLoading
            ? "Loading…"
            : filtered.length === 0 && contacts.length > 0
            ? `No matches for "${q}"`
            : `${filtered.length} ${filtered.length === 1 ? "contact" : "contacts"}`}
        </h2>
      </section>

      {/* ---------- Empty state ---------- */}
      {isEmpty && (
        <section className="px-4 pb-8">
          <div className="rounded-3xl md-surface-low p-8 text-center border border-dashed border-[hsl(var(--md-outline-variant))]">
            <div className="w-16 h-16 rounded-full bg-blue/15 flex items-center justify-center mx-auto mb-4">
              <MaterialIcon name="add_a_photo" size={28} className="text-blue" />
            </div>
            <p className="md-title-medium text-foreground">No cards yet</p>
            <p className="md-body-medium text-foreground/65 mt-2 max-w-xs mx-auto">
              Tap the blue button below to scan your first card. It'll be in your Google Contacts before you finish shaking hands.
            </p>
          </div>
        </section>
      )}

      {/* ---------- Contacts list (MD3 list items) ---------- */}
      {!isEmpty && (
        <section className="px-2 pb-8">
          <ul className="space-y-1">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/contacts/${c.id}`}
                  className="flex items-center gap-4 px-4 py-3 rounded-2xl md-state-layer"
                  data-testid={`link-contact-${c.id}`}
                >
                  {c.cardImage ? (
                    <div className="w-14 h-9 rounded-md overflow-hidden flex-shrink-0 md-surface-container border border-[hsl(var(--md-outline-variant))]">
                      <img
                        src={c.cardImage}
                        alt={`${c.name}'s business card`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        data-testid={`img-thumb-${c.id}`}
                      />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-blue/15 flex items-center justify-center flex-shrink-0">
                      <span className="md-title-medium text-blue font-bold">
                        {c.name
                          .split(/\s+/)
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="md-body-large text-foreground truncate font-medium"
                      data-testid={`text-contact-name-${c.id}`}
                    >
                      {c.name}
                    </p>
                    <p className="md-body-small text-foreground/65 truncate mt-0.5">
                      {[c.title, c.company].filter(Boolean).join(" · ") ||
                        c.email ||
                        "No details"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 text-foreground/55">
                    {c.googleResourceName && (
                      <span
                        title="Synced to Google Contacts"
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                      >
                        <MaterialIcon name="cloud_done" size={18} className="text-green-600" />
                      </span>
                    )}
                    {c.linkedinUrl && (
                      <span title="Has LinkedIn" className="w-7 h-7 rounded-full flex items-center justify-center">
                        <MaterialIcon name="link" size={18} className="text-blue" />
                      </span>
                    )}
                    <MaterialIcon name="chevron_right" size={20} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Material 3 FAB (scan) ---------- */}
      <button
        onClick={() => setLocation("/scan")}
        className="md-fab-press md-elevation-3 fixed bottom-24 right-[max(1rem,calc(50%-220px))] z-20 h-14 px-5 rounded-2xl bg-blue text-white inline-flex items-center gap-2 md-state-layer"
        aria-label="Scan a business card"
        data-testid="button-fab-scan"
      >
        <MaterialIcon name="add" size={24} className="text-white" />
        <span className="md-label-large font-medium">Scan card</span>
      </button>
    </AppShell>
  );
}
