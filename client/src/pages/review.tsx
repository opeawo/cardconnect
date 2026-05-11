import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MaterialIcon } from "@/components/MaterialIcon";
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
    const isMobile =
      typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const preopened: Window | null = isMobile ? window.open("", "_blank") : null;
    setSaving(true);
    try {
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
      <section className="px-4 pt-4 pb-2">
        <h1 className="md-headline-medium text-[hsl(var(--md-on-surface))]">Check the details</h1>
        <p className="md-body-medium text-[hsl(var(--md-on-surface-variant))] mt-1">
          {parsing ? "Auto-filling from your card…" : "Fix anything that looks off, then save."}
        </p>
      </section>

      {cardImage && (
        <section className="px-4 pb-2">
          <div className="aspect-[1.6/1] rounded-3xl overflow-hidden bg-[hsl(var(--md-surface-container))] md-elevation-1">
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
          <div className="rounded-full bg-[hsl(var(--accent))] px-4 py-2.5 flex items-center gap-2">
            <MaterialIcon name="progress_activity" size={18} className="animate-spin text-[hsl(var(--primary))]" />
            <span className="md-label-large text-[hsl(var(--primary))]">Parsing card…</span>
          </div>
        </div>
      )}

      <section className="px-4 space-y-4 pb-8">
        <MdField label="Full name" required>
          <Input
            value={fields.name}
            onChange={(e) => update("name", e.target.value)}
            data-testid="input-name"
            className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          />
        </MdField>
        <div className="grid grid-cols-1 gap-4">
          <MdField label="Title">
            <Input
              value={fields.title}
              onChange={(e) => update("title", e.target.value)}
              data-testid="input-title"
              className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
            />
          </MdField>
          <MdField label="Company">
            <Input
              value={fields.company}
              onChange={(e) => update("company", e.target.value)}
              data-testid="input-company"
              className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
            />
          </MdField>
        </div>
        <MdField label="Email">
          <Input
            value={fields.email}
            onChange={(e) => update("email", e.target.value)}
            data-testid="input-email"
            className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          />
        </MdField>
        <MdField label="Phone">
          <Input
            value={fields.phone}
            onChange={(e) => update("phone", e.target.value)}
            data-testid="input-phone"
            className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          />
        </MdField>
        <MdField label="Website">
          <Input
            value={fields.website}
            onChange={(e) => update("website", e.target.value)}
            data-testid="input-website"
            className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          />
        </MdField>
        <MdField label="LinkedIn URL" hint="If blank, we'll search LinkedIn by name + company.">
          <Input
            value={fields.linkedinUrl}
            onChange={(e) => update("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/…"
            data-testid="input-linkedin"
            className="h-14 rounded-2xl bg-[hsl(var(--md-surface-container))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          />
        </MdField>

        <div className="rounded-3xl bg-[hsl(var(--accent))] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MaterialIcon name="auto_awesome" size={18} className="text-[hsl(var(--primary))]" filled />
            <span className="md-label-large text-[hsl(var(--primary))]">
              Context for your message
            </span>
          </div>
          <MdField label="Where / how you met">
            <Input
              placeholder="e.g. Lagos Tech Summit 2026, after my talk"
              value={fields.metContext}
              onChange={(e) => update("metContext", e.target.value)}
              data-testid="input-met-context"
              className="h-14 rounded-2xl bg-[hsl(var(--background))] border-0 px-4 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
            />
          </MdField>
          <MdField label="Anything you talked about">
            <Textarea
              placeholder="e.g. We chatted about hiring engineers in Africa…"
              value={fields.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              data-testid="input-notes"
              className="rounded-2xl bg-[hsl(var(--background))] border-0 px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
            />
          </MdField>
        </div>

        <button
          disabled={saving || parsing}
          onClick={save}
          className="w-full h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] md-label-large md-elevation-1 md-state-layer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          data-testid="button-save-contact"
        >
          {saving ? (
            <>
              <MaterialIcon name="progress_activity" size={20} className="animate-spin" />
              Saving & drafting…
            </>
          ) : (
            <>
              <MaterialIcon name="check" size={20} filled />
              Save contact
            </>
          )}
        </button>
      </section>
    </AppShell>
  );
}

function MdField({
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
      <label className="md-label-medium text-[hsl(var(--md-on-surface-variant))] block px-1">
        {label} {required && <span className="text-[hsl(var(--primary))]">*</span>}
      </label>
      {children}
      {hint && <p className="md-body-small text-[hsl(var(--md-on-surface-variant))] px-1">{hint}</p>}
    </div>
  );
}
