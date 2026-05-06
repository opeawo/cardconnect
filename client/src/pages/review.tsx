import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { downloadVCard } from "@/lib/vcard";
import type { Contact } from "@shared/schema";

type Fields = {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  linkedinUrl: string;
  metContext: string;
  notes: string;
};

const empty: Fields = {
  name: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  website: "",
  linkedinUrl: "",
  metContext: "",
  notes: "",
};

export default function Review() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [fields, setFields] = useState<Fields>(empty);
  const [rawText, setRawText] = useState("");
  const [cardImage, setCardImage] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Review details | CardConnect";
    const text: string = (window as any).__cardConnectOcr ?? "";
    const image: string | null = (window as any).__cardConnectImage ?? null;
    setRawText(text);
    setCardImage(image);
    if (text.trim()) {
      setParsing(true);
      apiRequest("POST", "/api/parse-card", { rawText: text })
        .then((r) => r.json())
        .then((parsed) => {
          setFields((f) => ({
            ...f,
            name: parsed.name || f.name,
            title: parsed.title || f.title,
            company: parsed.company || f.company,
            email: parsed.email || f.email,
            phone: parsed.phone || f.phone,
            website: parsed.website || f.website,
            linkedinUrl: parsed.linkedinUrl || f.linkedinUrl,
          }));
        })
        .catch(() => {
          toast({ title: "Couldn't auto-parse", description: "Please fill in the details below." });
        })
        .finally(() => setParsing(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof Fields>(k: K, v: Fields[K]) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!fields.name.trim()) {
      toast({ title: "Name required", description: "Please add a name before saving." });
      return;
    }
    // Pre-open a blank window inside the user gesture. Mobile Safari blocks
    // any window.open() that happens after an await, so we open it now and
    // navigate it once we have the saved contact's vCard. We close it later
    // if it turns out we don't need it (desktop, or save failure).
    const isMobile = typeof navigator !== "undefined"
      && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const preopened: Window | null = isMobile ? window.open("", "_blank") : null;
    setSaving(true);
    try {
      // Draft a LinkedIn message in parallel
      const [draftRes] = await Promise.all([
        apiRequest("POST", "/api/draft-message", {
          name: fields.name,
          title: fields.title,
          company: fields.company,
          metContext: fields.metContext,
          notes: fields.notes,
        }).then((r) => r.json()),
      ]);
      const draftMessage: string = draftRes.message || "";

      const res = await apiRequest("POST", "/api/contacts", {
        ...fields,
        rawOcrText: rawText,
        draftMessage,
        cardImage,
      });
      const created: Contact = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      (window as any).__cardConnectOcr = "";
      (window as any).__cardConnectImage = null;

      // Auto-push to the device address book. On iOS Safari and Android
      // Chrome, opening a .vcf triggers the native "Add Contact" sheet
      // automatically. On desktop, the .vcf downloads silently and the
      // user double-clicks to import.
      try {
        downloadVCard(created, preopened);
        toast({
          title: isMobile ? "Adding to your contacts" : "Contact card saved",
          description: isMobile
            ? "Your phone will ask you to confirm."
            : "Open the .vcf file to import on your computer.",
        });
      } catch (e) {
        console.warn("vCard auto-export failed", e);
        if (preopened) preopened.close();
      }

      setLocation(`/contacts/${created.id}`);
    } catch (e) {
      console.error(e);
      if (preopened) preopened.close();
      toast({ title: "Couldn't save", description: "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell showBack title="Review">
      <section className="px-4 pt-6 pb-4">
        <h1
          className="font-display uppercase text-3xl leading-none"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Check the details
        </h1>
        <p className="mt-2 text-muted-foreground text-[15px]">
          {parsing ? "Auto-filling from your card..." : "Fix anything that looks off, then save."}
        </p>
      </section>

      {cardImage && (
        <section className="px-4 pb-2">
          <div className="aspect-[1.6/1] rounded-2xl overflow-hidden border border-border bg-muted">
            <img
              src={cardImage}
              alt="Scanned business card"
              className="w-full h-full object-cover"
              data-testid="img-card-preview"
            />
          </div>
        </section>
      )}

      {parsing && (
        <div className="px-4 mb-2">
          <div className="rounded-xl bg-blue/5 border border-blue/20 p-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue" />
            <span className="text-sm text-blue font-semibold">Parsing card...</span>
          </div>
        </div>
      )}

      <section className="px-4 space-y-4 pb-6">
        <Field label="Full name" required>
          <Input value={fields.name} onChange={(e) => update("name", e.target.value)} data-testid="input-name" />
        </Field>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Title">
            <Input value={fields.title} onChange={(e) => update("title", e.target.value)} data-testid="input-title" />
          </Field>
          <Field label="Company">
            <Input value={fields.company} onChange={(e) => update("company", e.target.value)} data-testid="input-company" />
          </Field>
        </div>
        <Field label="Email">
          <Input value={fields.email} onChange={(e) => update("email", e.target.value)} data-testid="input-email" />
        </Field>
        <Field label="Phone">
          <Input value={fields.phone} onChange={(e) => update("phone", e.target.value)} data-testid="input-phone" />
        </Field>
        <Field label="Website">
          <Input value={fields.website} onChange={(e) => update("website", e.target.value)} data-testid="input-website" />
        </Field>
        <Field label="LinkedIn URL" hint="If blank, we'll search LinkedIn by name + company.">
          <Input
            value={fields.linkedinUrl}
            onChange={(e) => update("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/..."
            data-testid="input-linkedin"
          />
        </Field>

        <div className="rounded-xl bg-blue/5 border border-blue/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue" />
            <span className="text-xs font-semibold uppercase tracking-widest text-blue">
              Context for your message
            </span>
          </div>
          <Field label="Where / how you met">
            <Input
              placeholder="e.g. Lagos Tech Summit 2026, after my talk"
              value={fields.metContext}
              onChange={(e) => update("metContext", e.target.value)}
              data-testid="input-met-context"
            />
          </Field>
          <Field label="Anything you talked about">
            <Textarea
              placeholder="e.g. We chatted about hiring engineers in Africa..."
              value={fields.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              data-testid="input-notes"
            />
          </Field>
        </div>

        <Button
          size="lg"
          disabled={saving || parsing}
          onClick={save}
          className="w-full bg-blue hover:bg-blue/90 text-white rounded-full h-12 text-base font-semibold"
          data-testid="button-save-contact"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving & drafting message...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Save contact
            </>
          )}
        </Button>
      </section>
    </AppShell>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label} {required && <span className="text-blue">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
