import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  connectedAt?: string;
}

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Google "G" logo as inline SVG so it keeps brand colours regardless of theme.
function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [bannerKind, setBannerKind] = useState<"success" | "error" | null>(null);
  const [bannerMsg, setBannerMsg] = useState("");

  useEffect(() => {
    document.title = "Settings | CardConnect";
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const g = params.get("google");
    if (g === "connected") {
      setBannerKind("success");
      setBannerMsg("Connected to Google Contacts. New cards sync automatically.");
    } else if (g === "error") {
      setBannerKind("error");
      const reason = params.get("reason") || "Something went wrong.";
      setBannerMsg(`Couldn't connect: ${reason}`);
    }
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
      const parts: string[] = [`${data.synced} synced`];
      if (data.failed > 0) parts.push(`${data.failed} failed`);
      toast({ title: "Re-sync complete", description: parts.join(" · ") });
    },
    onError: (e: any) => {
      toast({ title: "Re-sync failed", description: e?.message || "", variant: "destructive" });
    },
  });

  const startConnect = () => {
    window.location.href = `${API_BASE}/api/google/auth`;
  };

  return (
    <AppShell title="Settings">
      <section className="px-4 pt-4 pb-2">
        <h1
          className="md-headline-medium text-[hsl(var(--md-on-surface))]"
          data-testid="text-settings-title"
        >
          Settings
        </h1>
        <p className="md-body-medium text-[hsl(var(--md-on-surface-variant))] mt-1">
          Connect the services you use so contacts go where you need them.
        </p>
      </section>

      {bannerKind && (
        <section className="px-4 pt-2">
          <div
            className={
              bannerKind === "success"
                ? "rounded-2xl bg-[hsl(var(--google-green)/0.12)] text-[hsl(var(--google-green))] p-4 flex gap-3 items-start"
                : "rounded-2xl bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] p-4 flex gap-3 items-start"
            }
            data-testid={`banner-${bannerKind}`}
          >
            <MaterialIcon
              name={bannerKind === "success" ? "check_circle" : "error"}
              size={20}
              filled
              className="flex-shrink-0 mt-0.5"
            />
            <span className="md-body-medium leading-relaxed">{bannerMsg}</span>
          </div>
        </section>
      )}

      <section className="px-4 pt-6">
        <h2 className="md-title-small text-[hsl(var(--md-on-surface-variant))] mb-3 px-1">
          Integrations
        </h2>

        <div className="rounded-3xl bg-[hsl(var(--md-surface-container-low))] p-5 md-elevation-1">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white md-elevation-1 flex items-center justify-center flex-shrink-0">
              <GoogleG className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="md-title-medium text-[hsl(var(--md-on-surface))]"
                data-testid="text-google-title"
              >
                Google Contacts
              </p>
              <p className="md-body-medium text-[hsl(var(--md-on-surface-variant))] leading-relaxed mt-0.5">
                Auto-sync every scanned card to your Google account.
              </p>
            </div>
          </div>

          <div className="my-5 h-px bg-[hsl(var(--md-outline-variant))]" />

          {isLoading ? (
            <div className="md-body-medium text-[hsl(var(--md-on-surface-variant))] flex items-center gap-2">
              <MaterialIcon name="progress_activity" size={18} className="animate-spin" />
              Loading…
            </div>
          ) : !status?.configured ? (
            <div
              className="md-body-medium text-[hsl(var(--md-on-surface-variant))] leading-relaxed"
              data-testid="text-google-not-configured"
            >
              Google sync isn't configured on this server yet. Ask the admin to add OAuth credentials.
            </div>
          ) : status.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-[hsl(var(--google-green)/0.08)]">
                {status.picture ? (
                  <img
                    src={status.picture}
                    alt=""
                    className="w-10 h-10 rounded-full flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[hsl(var(--google-green)/0.18)] flex items-center justify-center flex-shrink-0">
                    <MaterialIcon name="check" size={18} className="text-[hsl(var(--google-green))]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className="md-body-large text-[hsl(var(--md-on-surface))] font-medium truncate"
                    data-testid="text-google-name"
                  >
                    {status.name || "Connected"}
                  </p>
                  <p
                    className="md-body-small text-[hsl(var(--md-on-surface-variant))] truncate"
                    data-testid="text-google-email"
                  >
                    {status.email || ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => syncAll.mutate()}
                  disabled={syncAll.isPending}
                  className="h-12 rounded-full border border-[hsl(var(--md-outline))] text-[hsl(var(--md-on-surface))] md-label-large md-state-layer disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid="button-sync-all"
                >
                  <MaterialIcon
                    name={syncAll.isPending ? "progress_activity" : "sync"}
                    size={18}
                    className={syncAll.isPending ? "animate-spin" : ""}
                  />
                  Re-sync all
                </button>
                <button
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                  className="h-12 rounded-full border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] md-label-large md-state-layer disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid="button-disconnect"
                >
                  <MaterialIcon
                    name={disconnect.isPending ? "progress_activity" : "logout"}
                    size={18}
                    className={disconnect.isPending ? "animate-spin" : ""}
                  />
                  Disconnect
                </button>
              </div>
              <p className="md-body-small text-[hsl(var(--md-on-surface-variant))] leading-relaxed">
                New contacts you save will appear in your Google Contacts within seconds.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={startConnect}
                className="w-full h-14 rounded-full bg-white text-[#3c4043] md-label-large md-elevation-1 md-state-layer flex items-center justify-center gap-3 border border-[hsl(var(--md-outline-variant))]"
                data-testid="button-connect-google"
              >
                <GoogleG className="w-5 h-5" />
                Sign in with Google
              </button>
              <p className="md-body-small text-[hsl(var(--md-on-surface-variant))] leading-relaxed">
                CardConnect can add and update contacts in your Google account. We don't read or share anything else.
              </p>
            </div>
          )}
        </div>

        <h2 className="md-title-small text-[hsl(var(--md-on-surface-variant))] mt-8 mb-3 px-1">
          About
        </h2>
        <div className="rounded-3xl bg-[hsl(var(--md-surface-container-low))] p-5">
          <p
            className="font-display uppercase text-2xl tracking-wide text-[hsl(var(--md-on-surface))]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            CardConnect
          </p>
          <p className="md-body-medium text-[hsl(var(--md-on-surface-variant))] mt-1">
            The card-to-contacts app Google never built.
          </p>
          <p className="md-body-small text-[hsl(var(--md-on-surface-variant))] mt-4 leading-relaxed">
            Your contacts live on the CardConnect server + your Google account when connected.
            Nothing is shared with third parties.
          </p>
        </div>
        <div className="pb-32" />
      </section>
    </AppShell>
  );
}
