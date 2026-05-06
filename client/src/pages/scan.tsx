import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, Loader2, ScanLine, FileText } from "lucide-react";
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
// quality so the resulting data URL is small enough to ship through the JSON
// API (typically 30-80KB) while still rendering crisply as a hero image. Falls
// back to the original file on any failure so we never block the scan flow.
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
  const [manualMode, setManualMode] = useState(false);

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
      // Compress the photo in parallel with OCR. Both are pure-CPU work and
      // OCR dominates wall-clock time, so the compression is effectively free.
      const [text, dataUrl] = await Promise.all([
        ocrImage(file, setProgress),
        fileToCompressedDataUrl(file),
      ]);
      // Stash the OCR text + card image for the review page. We use an
      // in-memory bridge on window because storage APIs (localStorage,
      // sessionStorage) are blocked inside the sandboxed iframe.
      (window as any).__cardConnectOcr = text;
      (window as any).__cardConnectImage = dataUrl;
      setLocation("/review");
    } catch (e) {
      console.error(e);
      toast({ title: "Could not read the card", description: "Try a clearer photo or enter details manually." });
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
      <section className="px-4 pt-6 pb-4">
        <h1
          className="font-display uppercase text-3xl leading-none"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Capture the card
        </h1>
        <p className="mt-2 text-muted-foreground text-[15px]">
          Use your camera or pick a photo. We'll read the details and find the person on LinkedIn.
        </p>
      </section>

      {/* Preview / scan area */}
      <section className="px-4">
        <div className="aspect-[1.6/1] rounded-2xl border-2 border-dashed border-border bg-muted/40 overflow-hidden flex items-center justify-center relative">
          {previewUrl ? (
            <img src={previewUrl} alt="Business card preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center px-6">
              <ScanLine className="w-10 h-10 text-blue mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Center the card in good light. Avoid glare.
              </p>
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue" />
              <p className="text-sm font-semibold">Reading card... {Math.round(progress * 100)}%</p>
              <div className="w-40 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
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
          <Button
            disabled={scanning}
            onClick={() => cameraInputRef.current?.click()}
            className="bg-blue hover:bg-blue/90 text-white h-12 rounded-xl font-semibold"
            data-testid="button-take-photo"
          >
            <Camera className="w-5 h-5 mr-2" />
            Take photo
          </Button>
          <Button
            disabled={scanning}
            variant="outline"
            onClick={() => galleryInputRef.current?.click()}
            className="h-12 rounded-xl font-semibold"
            data-testid="button-pick-photo"
          >
            <ImageIcon className="w-5 h-5 mr-2" />
            Pick photo
          </Button>
        </div>

        <button
          type="button"
          onClick={startManual}
          className="mt-4 w-full text-sm text-blue font-semibold py-2 hover:underline flex items-center justify-center gap-1.5"
          data-testid="button-manual-entry"
        >
          <FileText className="w-4 h-4" />
          Enter details manually
        </button>
      </section>

      <section className="px-4 mt-8">
        <div className="rounded-xl bg-blue/5 border border-blue/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue mb-1.5">Tip</p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            After scanning, tell us where you met. We'll use it to draft a friendly LinkedIn note.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
