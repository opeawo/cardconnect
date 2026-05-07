// Google OAuth + People API integration for CardConnect.
//
// We do not use the official googleapis SDK — the surface we need is small
// (one OAuth dance, one People API endpoint), and a hand-rolled fetch keeps
// the production bundle slim.
import { storage } from "./storage";
import type { Contact, GoogleToken } from "@shared/schema";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const PEOPLE_API_BASE = "https://people.googleapis.com/v1";

// Scopes:
// - `contacts` lets us create + update People resources.
// - `userinfo.email` + `userinfo.profile` so we can show "Connected as ope@..."
//   in the settings UI.
const SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    // `offline` + `consent` ensures we get a refresh_token even on repeat
    // connections — Google only returns a refresh_token the first time
    // unless you force the consent screen.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
  });
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Google token exchange failed: ${r.status} ${txt}`);
  }
  return (await r.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Google token refresh failed: ${r.status} ${txt}`);
  }
  return (await r.json()) as TokenResponse;
}

interface UserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const r = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return {};
  return (await r.json()) as UserInfo;
}

/**
 * Returns a valid access token for this session, refreshing it if the cached
 * one is within 60s of expiring. Returns null if we have no token at all.
 */
export async function getValidAccessToken(sessionId: string): Promise<string | null> {
  const tok = await storage.getGoogleToken(sessionId);
  if (!tok) return null;
  const skew = 60_000; // refresh slightly before expiry
  if (tok.expiresAt > Date.now() + skew) return tok.accessToken;

  try {
    const refreshed = await refreshAccessToken(tok.refreshToken);
    const updated: GoogleToken = {
      ...tok,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || tok.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await storage.upsertGoogleToken(updated);
    return updated.accessToken;
  } catch (e) {
    console.warn("Google token refresh failed; disconnecting session:", e);
    // The refresh token has been revoked or expired. Drop it so the UI
    // prompts the user to reconnect rather than retrying every save.
    await storage.deleteGoogleToken(sessionId);
    return null;
  }
}

// --- Contact mapping ---

function buildPeopleResource(contact: Contact) {
  const names = contact.name
    ? [
        {
          unstructuredName: contact.name,
          displayName: contact.name,
        },
      ]
    : undefined;

  const organizations =
    contact.title || contact.company
      ? [
          {
            name: contact.company || undefined,
            title: contact.title || undefined,
            current: true,
          },
        ]
      : undefined;

  const emailAddresses = contact.email
    ? [{ value: contact.email, type: "work" }]
    : undefined;

  const phoneNumbers = contact.phone
    ? [{ value: contact.phone, type: "mobile" }]
    : undefined;

  // Combine LinkedIn + website into urls.
  const urls: Array<{ value: string; type: string }> = [];
  if (contact.linkedinUrl) urls.push({ value: contact.linkedinUrl, type: "LinkedIn" });
  if (contact.website) urls.push({ value: contact.website, type: "work" });

  // Notes block synthesises the context fields so users don't lose them.
  const noteBits: string[] = [];
  if (contact.metContext) noteBits.push(`Met: ${contact.metContext}`);
  if (contact.notes) noteBits.push(contact.notes);
  noteBits.push("Saved via CardConnect");
  const biographies = [
    {
      value: noteBits.join("\n\n"),
      contentType: "TEXT_PLAIN",
    },
  ];

  return {
    names,
    organizations,
    emailAddresses,
    phoneNumbers,
    urls: urls.length ? urls : undefined,
    biographies,
  };
}

/**
 * Push a contact into the user's Google Contacts. If `googleResourceName` is
 * set on the contact, we update that resource; otherwise we create a new one.
 *
 * Returns the new resource name on success, or null if Google sync is not
 * configured / not connected for this session. Throws on hard API failures
 * so callers can decide whether to surface the error.
 */
export async function pushContactToGoogle(
  sessionId: string,
  contact: Contact,
): Promise<string | null> {
  if (!isGoogleConfigured()) return null;
  const accessToken = await getValidAccessToken(sessionId);
  if (!accessToken) return null;

  const resource = buildPeopleResource(contact);

  if (contact.googleResourceName) {
    // Update existing person. Google requires us to pass the etag and the
    // explicit list of person fields we're mutating. Easiest path: GET the
    // person first to grab the etag, then PATCH.
    const fields = "names,organizations,emailAddresses,phoneNumbers,urls,biographies";
    const url = `${PEOPLE_API_BASE}/${encodeURIComponent(contact.googleResourceName)}?personFields=${fields}`;
    const getR = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getR.status === 404) {
      // The person was deleted in Google. Fall through to create.
    } else if (!getR.ok) {
      const txt = await getR.text();
      throw new Error(`Google fetch for update failed: ${getR.status} ${txt}`);
    } else {
      const existing = (await getR.json()) as { etag: string };
      const patchUrl = `${PEOPLE_API_BASE}/${encodeURIComponent(contact.googleResourceName)}:updateContact?updatePersonFields=${fields}`;
      const patchR = await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...resource, etag: existing.etag }),
      });
      if (!patchR.ok) {
        const txt = await patchR.text();
        throw new Error(`Google update failed: ${patchR.status} ${txt}`);
      }
      const updated = (await patchR.json()) as { resourceName: string };
      return updated.resourceName;
    }
  }

  const r = await fetch(`${PEOPLE_API_BASE}/people:createContact`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resource),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Google create failed: ${r.status} ${txt}`);
  }
  const created = (await r.json()) as { resourceName: string };
  return created.resourceName;
}
