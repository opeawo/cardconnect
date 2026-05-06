import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import type { Contact } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ScanLine, Search, Linkedin, ChevronRight } from "lucide-react";

export default function Home() {
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });
  const [q, setQ] = useState("");

  useEffect(() => {
    document.title = "CardConnect — Your Network, Always Ready";
    return () => {
      document.title = "CardConnect";
    };
  }, []);

  const filtered = contacts.filter((c) => {
    if (!q.trim()) return true;
    const hay = [c.name, c.title, c.company, c.metContext, c.email].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <AppShell>
      {/* Hero */}
      <section className="px-4 pt-6 pb-4 bg-gradient-to-b from-blue/5 to-background">
        <h1
          className="font-display uppercase text-4xl leading-none tracking-tight"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          data-testid="text-hero-title"
        >
          Your network,<br />
          <span className="text-blue">always ready.</span>
        </h1>
        <p className="mt-3 text-muted-foreground text-[15px] leading-relaxed">
          Scan a card, find them on LinkedIn, send a personal note in two taps.
        </p>
        <Link href="/scan" className="block mt-5">
          <Button
            size="lg"
            className="w-full bg-blue hover:bg-blue/90 text-white rounded-full h-12 text-base font-semibold"
            data-testid="button-scan-cta"
          >
            <ScanLine className="w-5 h-5 mr-2" />
            Scan a business card
          </Button>
        </Link>
      </section>

      {/* Install-as-app row — hides automatically once the app is installed */}
      <section className="px-4 pt-3">
        <InstallPrompt />
      </section>

      {/* Search */}
      <section className="px-4 pt-2 pb-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, or where you met"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-11 rounded-xl"
            data-testid="input-search"
          />
        </div>
      </section>

      {/* Contacts list */}
      <section className="px-4 pb-8">
        <h2
          className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-2 mb-3"
        >
          {isLoading ? "Loading..." : `${filtered.length} contact${filtered.length === 1 ? "" : "s"}`}
        </h2>

        {!isLoading && contacts.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-blue/10 flex items-center justify-center mx-auto mb-3">
              <ScanLine className="w-6 h-6 text-blue" />
            </div>
            <p className="font-semibold text-foreground">No cards yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap “Scan a business card” to add your first contact.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contacts/${c.id}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover-elevate active-elevate-2"
                data-testid={`link-contact-${c.id}`}
              >
                {c.cardImage ? (
                  <div
                    className="w-16 h-10 rounded-md overflow-hidden flex-shrink-0 bg-muted border border-border"
                  >
                    <img
                      src={c.cardImage}
                      alt={`${c.name}'s business card`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      data-testid={`img-thumb-${c.id}`}
                    />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-full bg-blue/10 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-blue text-sm">
                      {c.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate" data-testid={`text-contact-name-${c.id}`}>
                    {c.name}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {[c.title, c.company].filter(Boolean).join(" · ") || c.email || "No details"}
                  </p>
                </div>
                {c.linkedinUrl && (
                  <Linkedin className="w-4 h-4 text-blue flex-shrink-0" aria-label="Has LinkedIn" />
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
