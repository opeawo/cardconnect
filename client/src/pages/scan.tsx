import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useToast } from "@/hooks/use-toast";

// Tesseract is loaded lazily to keep the bundle small
async function ocrImage(file: File, onProgress: (p: number) => void): Promise<string> {
  const Tesseract = (await import("tesseract.js")).default;
  const result = await Tesseract.recognize(file, "eng", {
    logger: (m: any) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress(m.progress);
      }
    },
  });
  return result.data.text || "";
}

// Downscale the captured photo to ~600px wide and re-encode as JPEG @ 0.75
// quality so the resulting data URL stays small (typically 30-80KB) while
// rendering crisply as a hero image.
async function fileToCompressedDataUrl(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const targetWidth = Math.min(bitmap.width, 600);
    const scale = targetWidth / bitmap.width;
    const targetHeight = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.75);
  } catch (e) {
    console.warn("Could not compress card image", e);
    return null;
  }
}

export default function Scan() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    document.title = "Scan a card | CardConnect";
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFile(file: File) {
    setPreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    setProgress(0);
    try {
      const [text, dataUrl] = await Promise.all([
        ocrImage(file, setProgress),
        fileToCompressedDataUrl(file),
      ]);
      (window as any).__cardConnectOcr = text;
      (window as any).__cardConnectImage = dataUrl;
      setLocation("/review");
    } catch (e) {
      console.error(e);
      toast({
        title: "Could not read the card",
        description: "Try a clearer photo or enter details manually.",
      });
      setScanning(false);
    }
  }

  function onCameraChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function startManual() {
    (window as any).__cardConnectOcr = "";
    (window as any).__cardConnectImage = null;
    setLocation("/review");
  }

  return (
    <AppShell showBack title="Scan">
      <section className="px-5 pt-4 pb-4">
        <h1
          className="md-headline-medium text-foreground"
          style={{ fontFamily: "'Roboto Flex', Roboto, sans-serif", letterSpacing: "-0.005em" }}
        >
          Capture the card
        </h1>
        <p className="mt-2 md-body-medium text-foreground/70">
          Use your camera or pick a photo. We'll read the details and find the
          person on LinkedIn.
        </p>
      </section>

      {/* Preview / scan area */}
      <section className="px-4">
        <div className="aspect-[1.6/1] rounded-3xl md-surface-low border border-[hsl(var(--md-outline-variant))] overflow-hidden flex items-center justify-center relative">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Business card preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center px-6">
              <div className="w-16 h-16 rounded-full bg-blue/15 flex items-center justify-center mx-auto mb-3">
                <MaterialIcon name="photo_camera" size={28} className="text-blue" />
              </div>
              <p className="md-body-medium text-foreground/70 max-w-xs">
                Center the card in good light. Avoid glare.
              </p>
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 bg-background/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <MaterialIcon name="progress_activity" size={32} className="text-blue animate-spin" />
              <p className="md-title-medium text-foreground">
                Reading card… {Math.round(progress * 100)}%
              </p>
              <div className="w-48 h-1 bg-[hsl(var(--md-surface-container-highest))] rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onCameraChange}
            data-testid="input-camera"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onGalleryChange}
            data-testid="input-gallery"
          />
          <button
            disabled={scanning}
            onClick={() => cameraInputRef.current?.click()}
            className="h-14 px-5 rounded-full bg-blue text-white md-label-large font-medium md-state-layer md-elevation-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-take-photo"
          >
            <MaterialIcon name="photo_camera" size={20} className="text-white" />
            Take photo
          </button>
          <button
            disabled={scanning}
            onClick={() => galleryInputRef.current?.click()}
            className="h-14 px-5 rounded-full md-surface-container text-foreground md-label-large font-medium md-state-layer inline-flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-pick-photo"
          >
            <MaterialIcon name="photo_library" size={20} />
            Pick photo
          </button>
        </div>

        <button
          type="button"
          onClick={startManual}
          className="mt-4 w-full md-label-large text-blue py-3 rounded-full md-state-layer inline-flex items-center justify-center gap-1.5"
          data-testid="button-manual-entry"
        >
          <MaterialIcon name="edit_note" size={20} className="text-blue" />
          Enter details manually
        </button>
      </section>

      <section className="px-4 mt-6 pb-8">
        <div className="rounded-2xl bg-blue/5 dark:bg-blue/10 border border-blue/15 p-4 flex gap-3">
          <MaterialIcon name="lightbulb" filled size={20} className="text-blue mt-0.5 flex-shrink-0" />
          <div>
            <p className="md-label-medium text-blue uppercase tracking-widest font-semibold mb-1">
              Tip
            </p>
            <p className="md-body-medium text-foreground/80 leading-relaxed">
              After scanning, tell us where you met. We'll use it to draft a
              friendly LinkedIn note.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
