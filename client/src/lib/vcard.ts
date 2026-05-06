import type { Contact } from "@shared/schema";

function escapeVCard(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function contactToVCard(c: Contact): string {
  const parts = c.name.trim().split(/\s+/);
  const first = parts[0] || "";
  const last = parts.slice(1).join(" ") || "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
    `FN:${escapeVCard(c.name)}`,
    c.company ? `ORG:${escapeVCard(c.company)}` : "",
    c.title ? `TITLE:${escapeVCard(c.title)}` : "",
    c.email ? `EMAIL;TYPE=INTERNET:${escapeVCard(c.email)}` : "",
    c.phone ? `TEL;TYPE=CELL:${escapeVCard(c.phone)}` : "",
    c.website ? `URL:${escapeVCard(c.website)}` : "",
    c.linkedinUrl ? `URL;TYPE=LinkedIn:${escapeVCard(c.linkedinUrl)}` : "",
    c.notes || c.metContext
      ? `NOTE:${escapeVCard([c.metContext ? `Met: ${c.metContext}` : "", c.notes || ""].filter(Boolean).join(" — "))}`
      : "",
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS reports as Mac with touch points; treat that as iOS too.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

/**
 * Push a contact to the device address book.
 *
 * On mobile (iOS Safari, Android Chrome), this triggers the native
 * "Add Contact" sheet automatically. The caller can pass a `preopened`
 * window that was opened synchronously inside a user gesture — this is
 * required on iOS Safari, which blocks pop-ups opened after an `await`.
 *
 * On desktop, this falls back to a regular file download.
 */
export function downloadVCard(c: Contact, preopened?: Window | null) {
  const vcard = contactToVCard(c);
  const filename = `${c.name.replace(/[^\w\-]+/g, "_") || "contact"}.vcf`;
  const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // iOS Safari ignores the `download` attribute on anchors and on a blob:
  // URL navigated to in the same tab it tries to render the file inline.
  // Opening it in a new tab hands it off to Contacts.app, which shows the
  // native "Add Contact" sheet and then dismisses cleanly.
  if (isIOS()) {
    if (preopened && !preopened.closed) {
      preopened.location.href = url;
    } else {
      // No pre-opened window (e.g. caller forgot, or pop-up blocked).
      // Fall back to same-tab navigation; the user can hit Back after.
      const w = window.open(url, "_blank");
      if (!w) window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  // Android Chrome and desktop browsers: a blob + anchor click downloads
  // the .vcf with the right filename. Android Chrome auto-opens the
  // contact importer; desktop saves to Downloads.
  if (preopened && !preopened.closed) {
    // We pre-opened a tab on mobile detection but turned out non-iOS;
    // Android handles the file fine via direct navigation too.
    preopened.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleContactsUrl(c: Contact): string {
  // Pre-fill the new-contact form on Google Contacts
  const params = new URLSearchParams();
  if (c.name) params.set("name", c.name);
  if (c.email) params.set("email", c.email);
  if (c.phone) params.set("phone", c.phone);
  if (c.company) params.set("organization", c.company);
  if (c.title) params.set("title", c.title);
  if (c.notes || c.metContext) {
    params.set("notes", [c.metContext ? `Met: ${c.metContext}` : "", c.notes || ""].filter(Boolean).join(" — "));
  }
  return `https://contacts.google.com/new?${params.toString()}`;
}

export function linkedinSearchUrl(c: Pick<Contact, "name" | "company">): string {
  const q = [c.name, c.company].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
}
