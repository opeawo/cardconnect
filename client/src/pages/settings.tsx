import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Check,
  AlertCircle,
  RefreshCw,
  LogOut,
  Loader2,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  connectedAt?: string;
}

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function SettingsPage() {
  const { toast } = useToast();
  const [bannerKind, setBannerKind] = useState<"success" | "error" | null>(null);
  const [bannerMsg, setBannerMsg] = useState("");

  // Pick up redirect-back hints from the OAuth callback.
  useEffect(() => {
    document.title = "Settings — CardConnect";
    // Hash router routes look like "#/settings?google=connected" — useLocation
    // gives us "/settings" only, so parse the hash directly.
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const g = params.get("google");
    if (g === "connected") {
      setBannerKind("success");
      setBannerMsg("Connected to Google Contacts. New contacts will sync automatically.");
    } else if (g === "error") {
      setBannerKind("error");
      const reason = params.get("reason") || "Something went wrong.";
      setBannerMsg(`Couldn't connect to Google: ${reason}`);
    }
    // Clean the URL so refreshing doesn't re-show the banner.
    if (g) {
      const cleaned = hash.slice(0, qIdx);
      window.history.replaceState(null, "", `${window.location.pathname}${cleaned}`);
    }
    return () => {
      document.title = "CardConnect";
    };
  }, []);

  const { data: status, isLoading } = useQuery<GoogleStatus>({
    queryKey: ["/api/google/status"],
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/google/disconnect");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Disconnected", description: "CardConnect will no longer sync to Google." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't disconnect", description: e?.message || "", variant: "destructive" });
    },
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/google/sync-all");
      return r.json() as Promise<{ synced: number; failed: number; total: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      const parts: string[] = [];
      parts.push(`${data.synced} synced`);
      if (data.failed > 0) parts.push(`${data.failed} failed`);
      toast({
        title: "Re-sync complete",
        description: parts.join(" · "),
      });
    },
    onError: (e: any) => {
      toast({
        title: "Re-sync failed",
        description: e?.message || "",
        variant: "destructive",
      });
    },
  });

  const startConnect = () => {
    // Hard navigation — Google's auth screen needs a full redirect, not fetch.
    window.location.href = `${API_BASE}/api/google/auth`;
  };

  return (
    <AppShell title="Settings">
      <section className="px-4 pt-6 pb-4 bg-gradient-to-b from-blue/5 to-background">
        <h1
          className="font-display uppercase text-3xl leading-none tracking-tight"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          data-testid="text-settings-title"
        >
          Settings
        </h1>
        <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
          Connect the services you use so contacts go where you need them.
        </p>
      </section>

      {bannerKind && (
        <section className="px-4 pt-2">
          <div
            className={
              bannerKind === "success"
                ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 p-3 text-sm flex gap-2"
                : "rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 p-3 text-sm flex gap-2"
            }
            data-testid={`banner-${bannerKind}`}
          >
            {bannerKind === "success" ? (
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            )}
            <span className="leading-relaxed">{bannerMsg}</span>
          </div>
        </section>
      )}

      <section className="px-4 pt-4 pb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Integrations
        </h2>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] border border-border flex items-center justify-center flex-shrink-0">
              <SiGoogle className="w-5 h-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground" data-testid="text-google-title">
                Google Contacts
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                Auto-sync every scanned card to your Google account.
              </p>
            </div>
          </div>

          <Separator className="my-4" />

          {isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : !status?.configured ? (
            <div className="text-sm text-muted-foreground leading-relaxed" data-testid="text-google-not-configured">
              Google sync isn't configured on this server yet. Ask the admin to add OAuth credentials.
            </div>
          ) : status.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                {status.picture ? (
                  <img
                    src={status.picture}
                    alt=""
                    className="w-9 h-9 rounded-full flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-emerald-700" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate" data-testid="text-google-name">
                    {status.name || "Connected"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" data-testid="text-google-email">
                    {status.email || ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="rounded-full h-11"
                  onClick={() => syncAll.mutate()}
                  disabled={syncAll.isPending}
                  data-testid="button-sync-all"
                >
                  {syncAll.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Re-sync all
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full h-11 text-red-600 hover:text-red-700"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                  data-testid="button-disconnect"
                >
                  {disconnect.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4 mr-2" />
                  )}
                  Disconnect
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                New contacts you save will appear in your Google Contacts within seconds.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full bg-blue hover:bg-blue/90 text-white rounded-full h-12 text-base font-semibold"
                onClick={startConnect}
                data-testid="button-connect-google"
              >
                <SiGoogle className="w-4 h-4 mr-2" />
                Connect Google
              </Button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                CardConnect will be able to add and update contacts in your Google account. We don't read or share anything else.
              </p>
            </div>
          )}
        </div>

        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-8 mb-3">
          About
        </h2>
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground font-semibold">CardConnect</p>
          <p className="mt-1">Scan a card. Find them on LinkedIn. Save them everywhere.</p>
          <p className="mt-3 text-xs">
            Your contacts live on the CardConnect server + your Google account when connected. Nothing is shared with third parties.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
