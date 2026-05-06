import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Smartphone, Share, PlusSquare, Download, X } from "lucide-react";

// Chrome's install prompt event isn't typed in lib.dom.d.ts.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1) return "ios"; // iPadOS
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "desktop";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Chrome / Android / desktop PWA
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari home-screen launch sets navigator.standalone
  if ((navigator as any).standalone === true) return true;
  return false;
}

/**
 * In-app banner + dialog that helps users install CardConnect as an app on
 * their phone's home screen. On Android Chrome we trigger the native install
 * prompt; on iOS we walk the user through the Share \u2192 Add to Home Screen
 * flow since Safari doesn't expose a programmatic prompt.
 */
export function InstallPrompt() {
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(e: Event) {
      // Stop Chrome's mini-infobar so our own UI stays in charge.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
      setOpen(false);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Already running as an installed app \u2014 nothing to show.
  if (installed) return null;

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setOpen(false);
      }
    } catch (e) {
      console.warn("Install prompt failed", e);
    } finally {
      // Each beforeinstallprompt event can only be used once.
      setDeferredPrompt(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-blue/20 bg-blue/5 hover-elevate active-elevate-2 text-left"
        data-testid="button-install-app"
      >
        <div className="w-9 h-9 rounded-lg bg-blue text-white flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">Install CardConnect</p>
          <p className="text-xs text-muted-foreground truncate">
            {platform === "ios"
              ? "Add to Home Screen for one-tap scanning"
              : platform === "android"
                ? "One tap to add the app to your phone"
                : "Get the app on your phone"}
          </p>
        </div>
        <span className="text-xs font-semibold text-blue uppercase tracking-wider">Install</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle
              className="font-display uppercase text-2xl leading-none"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Install CardConnect
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {platform === "ios"
                ? "Add CardConnect to your iPhone home screen so it opens like a native app \u2014 full screen, no Safari bars, instant scanning."
                : "Put CardConnect on your home screen so it opens like a native app \u2014 full screen, no browser bars, faster launch."}
            </DialogDescription>
          </DialogHeader>

          {platform === "android" && (
            <AndroidInstructions
              canPrompt={!!deferredPrompt}
              onInstall={handleAndroidInstall}
            />
          )}
          {platform === "ios" && <IOSInstructions />}
          {platform === "desktop" && <DesktopInstructions />}
          {platform === "other" && <FallbackInstructions />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StepRow({
  num,
  icon,
  text,
}: {
  num: number;
  icon?: React.ReactNode;
  text: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-blue text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
        {num}
      </div>
      <div className="flex-1 text-sm text-foreground/90 leading-relaxed flex items-center gap-2">
        {icon}
        <span>{text}</span>
      </div>
    </div>
  );
}

function AndroidInstructions({
  canPrompt,
  onInstall,
}: {
  canPrompt: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="space-y-3">
      {canPrompt ? (
        <>
          <p className="text-sm text-muted-foreground">
            Tap the button below and confirm. The app icon lands on your home screen in seconds.
          </p>
          <Button
            onClick={onInstall}
            className="w-full bg-blue hover:bg-blue/90 text-white rounded-full h-11 font-semibold"
            data-testid="button-trigger-install"
          >
            <Download className="w-4 h-4 mr-2" />
            Add to home screen
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            If your browser didn't offer to install, do this:
          </p>
          <div className="space-y-2.5">
            <StepRow num={1} text={"Tap the \u22ee menu in Chrome's top bar"} />
            <StepRow num={2} text={'Choose "Install app" or "Add to Home screen"'} />
            <StepRow num={3} text="Confirm \u2014 done" />
          </div>
        </>
      )}
    </div>
  );
}

function IOSInstructions() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-blue/5 border border-blue/20 p-3 text-xs text-foreground/80 leading-relaxed">
        Use Safari (not Chrome or in-app browsers). iOS only allows adding to the home screen from Safari.
      </div>
      <div className="space-y-2.5">
        <StepRow
          num={1}
          icon={<Share className="w-4 h-4 text-blue" />}
          text={
            <>
              Tap the <strong>Share</strong> button in the Safari toolbar
            </>
          }
        />
        <StepRow
          num={2}
          icon={<PlusSquare className="w-4 h-4 text-blue" />}
          text={
            <>
              Scroll down and choose <strong>Add to Home Screen</strong>
            </>
          }
        />
        <StepRow num={3} text={'Tap "Add" \u2014 the CardConnect icon will appear on your home screen'} />
      </div>
    </div>
  );
}

function DesktopInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        CardConnect works on desktop too. To install:
      </p>
      <div className="space-y-2.5">
        <StepRow num={1} text="In Chrome or Edge, look for the install icon in the address bar (right side)" />
        <StepRow num={2} text='Click it, then "Install"' />
        <StepRow num={3} text="The app will open in its own window" />
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        On your phone, open this site in your phone's browser and tap "Install" again.
      </p>
    </div>
  );
}

function FallbackInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Open <strong>card.pplx.app</strong> in your phone's main browser (Safari on iPhone, Chrome on Android), then come back here and tap Install.
      </p>
    </div>
  );
}

export default InstallPrompt;
