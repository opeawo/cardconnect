import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Textarea } from "@/components/ui/textarea";
import { MaterialIcon } from "@/components/MaterialIcon";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { downloadVCard, googleContactsUrl, linkedinSearchUrl } from "@/lib/vcard";
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
          <MaterialIcon name="progress_activity" size={32} className="animate-spin text-[hsl(var(--primary))]" />
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
          <div className="aspect-[1.6/1] rounded-3xl overflow-hidden bg-[hsl(var(--md-surface-container))] md-elevation-1">
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
        <div className="flex items-center gap-4">
          {!contact.cardImage && (
            <div className="w-16 h-16 rounded-full bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0">
              <span className="md-title-large text-[hsl(var(--primary))]">{initials}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="md-headline-medium text-[hsl(var(--md-on-surface))] truncate"
              data-testid="text-contact-name"
            >
              {contact.name}
            </h1>
            <p className="md-body-medium text-[hsl(var(--md-on-surface-variant))] mt-0.5 truncate">
              {[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}
            </p>
            {contact.googleResourceName && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--google-green)/0.12)]">
                <MaterialIcon name="cloud_done" size={14} className="text-[hsl(var(--google-green))]" />
                <span className="md-label-small text-[hsl(var(--google-green))]">Synced to Google</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick details */}
      <section className="px-4 mt-4">
        <div className="rounded-3xl bg-[hsl(var(--md-surface-container-low))] overflow-hidden">
          {contact.email && (
            <DetailRow
              icon="mail"
              label="Email"
              value={contact.email}
              href={`mailto:${contact.email}`}
              divider
            />
          )}
          {contact.phone && (
            <DetailRow
              icon="call"
              label="Phone"
              value={contact.phone}
              href={`tel:${contact.phone}`}
              divider
            />
          )}
          {contact.website && (
            <DetailRow
              icon="language"
              label="Website"
              value={contact.website}
              href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
              divider
            />
          )}
          {contact.metContext && (
            <DetailRow icon="bookmark" label="Met at" value={contact.metContext} />
          )}
        </div>
      </section>

      {/* LinkedIn message panel */}
      <section className="px-4 mt-6">
        <div className="rounded-3xl bg-[hsl(var(--accent))] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MaterialIcon name="forum" size={20} className="text-[hsl(var(--primary))]" filled />
              <span className="md-title-small text-[hsl(var(--md-on-surface))]">LinkedIn note</span>
            </div>
            <button
              onClick={regenerate}
              disabled={redrafting}
              className="md-label-medium text-[hsl(var(--primary))] flex items-center gap-1 px-3 py-1.5 rounded-full md-state-layer disabled:opacity-50"
              data-testid="button-regenerate-message"
            >
              {redrafting ? (
                <MaterialIcon name="progress_activity" size={16} className="animate-spin" />
              ) : (
                <MaterialIcon name="auto_awesome" size={16} />
              )}
              Regenerate
            </button>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveDraft}
            rows={4}
            className="bg-[hsl(var(--background))] rounded-2xl border-0 px-4 py-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
            data-testid="textarea-draft-message"
          />
          <p className="md-body-small text-[hsl(var(--md-on-surface-variant))] mt-2">
            Tap Connect on LinkedIn → "Add a note" → paste this message.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={copyDraft}
              className="h-12 rounded-full md-label-large bg-transparent text-[hsl(var(--md-on-surface))] border border-[hsl(var(--md-outline))] md-state-layer flex items-center justify-center gap-2"
              data-testid="button-copy-message"
            >
              <MaterialIcon name={copied ? "check" : "content_copy"} size={18} filled={copied} />
              {copied ? "Copied" : "Copy note"}
            </button>
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" data-testid="link-linkedin">
              <button className="w-full h-12 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] md-label-large md-state-layer md-elevation-1 flex items-center justify-center gap-2">
                <MaterialIcon name="open_in_new" size={18} />
                {contact.linkedinUrl ? "Open profile" : "Find on LinkedIn"}
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Export */}
      <section className="px-4 mt-6">
        <h2 className="md-title-small text-[hsl(var(--md-on-surface-variant))] mb-3 px-1">
          Save to your contacts
        </h2>
        <div className="rounded-3xl bg-[hsl(var(--md-surface-container-low))] overflow-hidden">
          <button
            onClick={() => downloadVCard(contact)}
            className="w-full flex items-center gap-4 px-5 py-4 md-state-layer text-left border-b border-[hsl(var(--md-outline-variant))]"
            data-testid="button-export-vcard"
          >
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="download" size={20} className="text-[hsl(var(--primary))]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="md-body-large text-[hsl(var(--md-on-surface))] font-medium">
                Download .vcf
              </p>
              <p className="md-body-small text-[hsl(var(--md-on-surface-variant))]">
                iPhone & Android Contacts
              </p>
            </div>
            <MaterialIcon name="chevron_right" size={20} className="text-[hsl(var(--md-on-surface-variant))]" />
          </button>
          <a
            href={googleContactsUrl(contact)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-4 px-5 py-4 md-state-layer"
            data-testid="button-export-google"
          >
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--google-yellow)/0.18)] flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="contacts" size={20} className="text-[hsl(var(--google-green))]" filled />
            </div>
            <div className="flex-1 min-w-0">
              <p className="md-body-large text-[hsl(var(--md-on-surface))] font-medium">
                Add to Google Contacts
              </p>
              <p className="md-body-small text-[hsl(var(--md-on-surface-variant))]">
                Opens contacts.google.com
              </p>
            </div>
            <MaterialIcon name="open_in_new" size={18} className="text-[hsl(var(--md-on-surface-variant))]" />
          </a>
        </div>
      </section>

      {/* Notes */}
      {contact.notes && (
        <section className="px-4 mt-6">
          <h2 className="md-title-small text-[hsl(var(--md-on-surface-variant))] mb-3 px-1">
            Your notes
          </h2>
          <div className="rounded-3xl bg-[hsl(var(--md-surface-container-low))] p-5">
            <p className="md-body-medium text-[hsl(var(--md-on-surface))] leading-relaxed">
              {contact.notes}
            </p>
          </div>
        </section>
      )}

      {/* Delete */}
      <section className="px-4 mt-8 pb-32">
        <button
          onClick={() => {
            if (confirm("Delete this contact?")) deleteMut.mutate();
          }}
          className="w-full h-12 rounded-full border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] md-label-large md-state-layer flex items-center justify-center gap-2"
          data-testid="button-delete-contact"
        >
          <MaterialIcon name="delete" size={18} />
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
  divider,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
  divider?: boolean;
}) {
  const inner = (
    <div
      className={`flex items-center gap-4 px-5 py-4 md-state-layer ${
        divider ? "border-b border-[hsl(var(--md-outline-variant))]" : ""
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0">
        <MaterialIcon name={icon} size={20} className="text-[hsl(var(--primary))]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="md-label-small text-[hsl(var(--md-on-surface-variant))]">{label}</p>
        <p className="md-body-large text-[hsl(var(--md-on-surface))] truncate font-medium">{value}</p>
      </div>
      {href && (
        <MaterialIcon name="arrow_outward" size={18} className="text-[hsl(var(--md-on-surface-variant))]" />
      )}
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
