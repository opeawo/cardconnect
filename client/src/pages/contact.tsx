import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { downloadVCard, googleContactsUrl, linkedinSearchUrl } from "@/lib/vcard";
import {
  Linkedin,
  Mail,
  Phone,
  Globe,
  Loader2,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Download,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ContactPage() {
  const [, params] = useRoute("/contacts/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [redrafting, setRedrafting] = useState(false);

  const { data: contact, isLoading } = useQuery<Contact>({
    queryKey: ["/api/contacts", id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/contacts/${id}`);
      return r.json();
    },
    enabled: !Number.isNaN(id),
  });

  useEffect(() => {
    if (contact) {
      document.title = `${contact.name} | CardConnect`;
      setDraft(contact.draftMessage || "");
    }
  }, [contact]);

  const deleteMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setLocation("/");
    },
  });

  async function regenerate() {
    if (!contact) return;
    setRedrafting(true);
    try {
      const r = await apiRequest("POST", "/api/draft-message", {
        name: contact.name,
        title: contact.title,
        company: contact.company,
        metContext: contact.metContext,
        notes: contact.notes,
      });
      const j = await r.json();
      setDraft(j.message || "");
      // persist
      await apiRequest("PATCH", `/api/contacts/${id}`, { draftMessage: j.message });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", id] });
    } catch {
      toast({ title: "Couldn't regenerate", description: "Try again in a moment." });
    } finally {
      setRedrafting(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Long-press to select & copy manually." });
    }
  }

  async function saveDraft() {
    if (!contact) return;
    await apiRequest("PATCH", `/api/contacts/${id}`, { draftMessage: draft });
    queryClient.invalidateQueries({ queryKey: ["/api/contacts", id] });
    toast({ title: "Saved", description: "Your message is saved with the contact." });
  }

  if (isLoading || !contact) {
    return (
      <AppShell showBack>
        <div className="flex-1 flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue" />
        </div>
      </AppShell>
    );
  }

  const linkedinUrl = contact.linkedinUrl || linkedinSearchUrl(contact);
  const initials =
    contact.name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <AppShell showBack title="Contact">
      {contact.cardImage && (
        <section className="px-4 pt-4">
          <div className="aspect-[1.6/1] rounded-2xl overflow-hidden border border-border bg-muted shadow-sm">
            <img
              src={contact.cardImage}
              alt={`${contact.name}'s business card`}
              className="w-full h-full object-cover"
              data-testid="img-card-hero"
            />
          </div>
        </section>
      )}
      <section className="px-4 pt-6 pb-3">
        <div className="flex items-center gap-3">
          {!contact.cardImage && (
            <div className="w-14 h-14 rounded-full bg-blue/10 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue text-base">{initials}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="font-display uppercase text-2xl leading-none truncate"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              data-testid="text-contact-name"
            >
              {contact.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Quick details */}
      <section className="px-4 space-y-1.5">
        {contact.email && (
          <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={contact.email} href={`mailto:${contact.email}`} />
        )}
        {contact.phone && (
          <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={contact.phone} href={`tel:${contact.phone}`} />
        )}
        {contact.website && (
          <DetailRow
            icon={<Globe className="w-4 h-4" />}
            label="Website"
            value={contact.website}
            href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
          />
        )}
        {contact.metContext && (
          <DetailRow icon={<Sparkles className="w-4 h-4" />} label="Met at" value={contact.metContext} />
        )}
      </section>

      {/* LinkedIn message panel */}
      <section className="px-4 mt-6">
        <div className="rounded-2xl bg-blue/5 border-2 border-blue/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Linkedin className="w-4 h-4 text-blue" />
              <span
                className="font-display uppercase text-base tracking-wide"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                LinkedIn note
              </span>
            </div>
            <button
              onClick={regenerate}
              disabled={redrafting}
              className="text-xs font-semibold text-blue flex items-center gap-1 hover:underline disabled:opacity-50"
              data-testid="button-regenerate-message"
            >
              {redrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Regenerate
            </button>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveDraft}
            rows={4}
            className="bg-background"
            data-testid="textarea-draft-message"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Tap Connect on LinkedIn → “Add a note” → paste this message.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button
              onClick={copyDraft}
              variant="outline"
              className="h-11 rounded-xl font-semibold"
              data-testid="button-copy-message"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy note
                </>
              )}
            </Button>
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" data-testid="link-linkedin">
              <Button className="w-full bg-blue hover:bg-blue/90 text-white h-11 rounded-xl font-semibold">
                <Linkedin className="w-4 h-4 mr-2" />
                {contact.linkedinUrl ? "Open profile" : "Find on LinkedIn"}
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Export */}
      <section className="px-4 mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Save to your contacts
        </h2>
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            onClick={() => downloadVCard(contact)}
            className="h-11 rounded-xl font-semibold justify-start"
            data-testid="button-export-vcard"
          >
            <Download className="w-4 h-4 mr-2" />
            Download .vcf (iPhone & Android Contacts)
          </Button>
          <a href={googleContactsUrl(contact)} target="_blank" rel="noopener noreferrer">
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl font-semibold justify-start"
              data-testid="button-export-google"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Add to Google Contacts
            </Button>
          </a>
        </div>
      </section>

      {/* Notes */}
      {contact.notes && (
        <section className="px-4 mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Your notes
          </h2>
          <p className="text-sm text-foreground/80 leading-relaxed bg-card border border-border rounded-xl p-3">
            {contact.notes}
          </p>
        </section>
      )}

      {/* Delete */}
      <section className="px-4 mt-8">
        <button
          onClick={() => {
            if (confirm("Delete this contact?")) deleteMut.mutate();
          }}
          className="w-full h-11 rounded-xl border border-destructive/30 text-destructive font-semibold flex items-center justify-center gap-2 hover-elevate active-elevate-2"
          data-testid="button-delete-contact"
        >
          <Trash2 className="w-4 h-4" />
          Delete contact
        </button>
      </section>
    </AppShell>
  );
}

function DetailRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover-elevate">
      <div className="w-8 h-8 rounded-lg bg-blue/10 flex items-center justify-center text-blue flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}
