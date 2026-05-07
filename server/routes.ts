import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertContactSchema, parseCardSchema, draftMessageSchema } from "@shared/schema";
import OpenAI from "openai";
import {
  isGoogleConfigured,
  getAuthUrl,
  exchangeCode,
  fetchUserInfo,
  pushContactToGoogle,
} from "./google";

// Per-IP throttle for the LLM-backed endpoints. Keeps a public URL from being
// used to proxy unlimited inference requests through the developer's API key.
const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

// Lazy LLM client. We use DeepSeek via the OpenAI-compatible API.
// In the published production sandbox we expect DEEPSEEK_API_KEY to be set;
// if it isn't, we fall back to deterministic helpers (regex parse, canned
// message) instead of crashing at boot.
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";
let _llm: OpenAI | null = null;
let _llmTried = false;
function getLLM(): OpenAI | null {
  if (_llmTried) return _llm;
  _llmTried = true;
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;
    _llm = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
    return _llm;
  } catch {
    return null;
  }
}

// --- Helpers ---

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract a JSON object from a fenced block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* ignore */ }
    }
    return null;
  }
}

// Best-effort offline parser as a fallback
function regexParse(raw: string) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const text = raw;

  const emailMatch = text.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  const websiteMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([\w-]+\.(?:com|net|org|io|co|ai|app|dev|me|us|uk|ng))(?:\/\S*)?/i);
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);

  // Pick the first non-empty line as name candidate (heuristic)
  const name = lines[0] || "";
  const title = lines[1] || "";
  const company = lines.find(l => /\b(inc|llc|ltd|corp|gmbh|company|labs|studio|technologies|tech)\b/i.test(l)) || lines[2] || "";

  return {
    name,
    title,
    company,
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0] || "",
    website: websiteMatch?.[0] || "",
    linkedinUrl: linkedinMatch ? `https://${linkedinMatch[0]}` : "",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Mint a long-lived signed cookie session ID on first request from any
  // device. We need this to attribute Google OAuth tokens to a device, and to
  // know whether to push new contacts to Google.
  app.use((req, res, next) => {
    if (!req.signedCookies?.cc_sid) {
      const sid = crypto.randomBytes(24).toString("hex");
      res.cookie("cc_sid", sid, {
        httpOnly: true,
        signed: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 365,
        path: "/",
      });
      // Make the new SID available on this request too.
      (req.signedCookies as Record<string, string>).cc_sid = sid;
    }
    next();
  });

  // List contacts
  app.get("/api/contacts", async (_req, res) => {
    const list = await storage.listContacts();
    res.json(list);
  });

  // Get one
  app.get("/api/contacts/:id", async (req, res) => {
    const id = Number(req.params.id);
    const c = await storage.getContact(id);
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  });

  // Create
  app.post("/api/contacts", async (req, res) => {
    const parsed = insertContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid contact", details: parsed.error.flatten() });
    }
    const c = await storage.createContact(parsed.data);

    // Fire-and-forget Google sync. We respond with the contact immediately so
    // the UI never waits on Google; if the push fails we just log it. The
    // contact is then marked as synced (or not) on the row itself.
    const sessionId = getSessionIdFromReq(req);
    if (sessionId) {
      pushContactToGoogle(sessionId, c)
        .then(async (resourceName) => {
          if (resourceName) {
            await storage.updateContact(c.id, { googleResourceName: resourceName });
          }
        })
        .catch((err) => {
          console.warn("Background Google sync failed for contact", c.id, err?.message || err);
        });
    }

    res.json(c);
  });

  // Update
  app.patch("/api/contacts/:id", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertContactSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update", details: parsed.error.flatten() });
    }
    const updated = await storage.updateContact(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // Delete
  app.delete("/api/contacts/:id", async (req, res) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteContact(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  // Parse OCR text into structured fields using LLM (with regex fallback)
  app.post("/api/parse-card", llmLimiter, async (req, res) => {
    const parsed = parseCardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Missing rawText" });
    }
    const { rawText } = parsed.data;
    const fallback = regexParse(rawText);

    const llm = getLLM();
    if (!llm) return res.json(fallback);

    try {
      const systemPrompt = `You are a business card scanner. Extract Fullname, Title, Company, Email, Phone, Website from text provided to you.

Return ONLY a JSON object with these keys (use empty string when missing): name, title, company, email, phone, website, linkedinUrl.

Use your world knowledge to disambiguate noisy OCR. Cards are often messy: logos bleed into text, lines reorder around QR codes, and brand taglines look like job titles. You are NOT just transcribing — you are interpreting.

- "name" is the person's full name (a human, NOT the organization). Title-case it normally even if the OCR is ALL CAPS.
- "title" is the person's job title / role. It may span multiple lines. Do NOT include the company, division, or directorate in title.
- "company" is the primary employing organization — the brand on the card, not a department, directorate, division, or business unit. If you recognize a real-world brand in the OCR (e.g. "Bank of Industry", "Flutterwave", "GTBank", "Microsoft"), use the canonical brand name even if the OCR mangled it (e.g. "Br BANK OF INDUSTRY" → "Bank of Industry"; "M1CR0SOFT" → "Microsoft"). Departments like "Corporate Finance, Sustainability and Investments Directorate" belong in "title", not "company".
- If multiple organizational lines appear, pick the parent brand as "company" and fold the department/directorate into "title".
- Cross-check against email and website domain: if the email is oosah@boi.ng and you see "Bank of Industry" in the text, company is "Bank of Industry". If the domain doesn't match any visible brand line, the brand line still wins.
- Prefer mobile when multiple phone numbers are listed. Normalize to E.164 when the country is obvious (e.g. "+234 802 ..." stays as is; a Nigerian "0802..." becomes "+234 802 ...").
- Use full https URLs when possible ("www.boi.ng" → "https://www.boi.ng").
- If a value is genuinely missing or ambiguous, use an empty string. Do NOT invent values, and do NOT copy a department name into "company" just to fill it.`;

      const completion = await llm.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });
      const out: string = completion.choices?.[0]?.message?.content ?? "";
      const parsedJson = safeParseJson(out);
      if (parsedJson && typeof parsedJson === "object") {
        return res.json({ ...fallback, ...parsedJson });
      }
      return res.json(fallback);
    } catch (e) {
      console.warn("LLM parse failed, using regex fallback:", e);
      return res.json(fallback);
    }
  });

  // ---- Google OAuth + Contacts sync ----

  // Resolve (or mint) the device session ID. We store it in a signed cookie
  // so the user keeps the same identity across reloads on this device.
  function getSessionIdFromReq(req: Request): string | undefined {
    return req.signedCookies?.cc_sid as string | undefined;
  }

  function ensureSessionId(req: Request, res: Response): string {
    let sid = req.signedCookies?.cc_sid as string | undefined;
    if (!sid) {
      sid = crypto.randomBytes(24).toString("hex");
      res.cookie("cc_sid", sid, {
        httpOnly: true,
        signed: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 365, // 1y
        path: "/",
      });
    }
    return sid;
  }

  // Status: tells the client whether Google is configured at all and, if so,
  // whether THIS device is connected.
  app.get("/api/google/status", async (req, res) => {
    const configured = isGoogleConfigured();
    if (!configured) {
      return res.json({ configured: false, connected: false });
    }
    const sid = getSessionIdFromReq(req);
    if (!sid) {
      return res.json({ configured: true, connected: false });
    }
    const tok = await storage.getGoogleToken(sid);
    if (!tok) {
      return res.json({ configured: true, connected: false });
    }
    res.json({
      configured: true,
      connected: true,
      email: tok.email || null,
      name: tok.name || null,
      picture: tok.picture || null,
      connectedAt: tok.connectedAt,
    });
  });

  // Start the OAuth flow. We mint a session ID (if missing) and a one-time
  // CSRF state token bound to this session.
  app.get("/api/google/auth", (req, res) => {
    if (!isGoogleConfigured()) {
      return res.status(503).json({ error: "Google integration not configured on the server." });
    }
    const sid = ensureSessionId(req, res);
    const state = crypto
      .createHmac("sha256", process.env.COOKIE_SECRET || "cardconnect-dev-cookie-secret")
      .update(sid)
      .digest("hex")
      .slice(0, 32);
    res.redirect(getAuthUrl(state));
  });

  // OAuth callback. Validates state, exchanges code for tokens, stores them,
  // and bounces the user back into the app.
  app.get("/api/google/callback", async (req, res) => {
    if (!isGoogleConfigured()) {
      return res.status(503).send("Google integration not configured.");
    }
    const sid = getSessionIdFromReq(req);
    if (!sid) {
      return res.status(400).send("Missing session. Please start the connection from /settings.");
    }
    const { code, state, error } = req.query as Record<string, string>;
    if (error) {
      return res.redirect(`/#/settings?google=error&reason=${encodeURIComponent(error)}`);
    }
    const expectedState = crypto
      .createHmac("sha256", process.env.COOKIE_SECRET || "cardconnect-dev-cookie-secret")
      .update(sid)
      .digest("hex")
      .slice(0, 32);
    if (!state || state !== expectedState) {
      return res.status(400).send("State mismatch — possible CSRF. Please try again.");
    }
    if (!code) {
      return res.status(400).send("Missing authorization code.");
    }
    try {
      const tok = await exchangeCode(code);
      if (!tok.refresh_token) {
        // Should be rare given access_type=offline + prompt=consent.
        return res.redirect("/#/settings?google=error&reason=no_refresh_token");
      }
      const info = await fetchUserInfo(tok.access_token);
      await storage.upsertGoogleToken({
        sessionId: sid,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        expiresAt: Date.now() + tok.expires_in * 1000,
        email: info.email || null,
        name: info.name || null,
        picture: info.picture || null,
        connectedAt: new Date().toISOString(),
      });
      res.redirect("/#/settings?google=connected");
    } catch (e: any) {
      console.error("Google callback failed:", e);
      res.redirect(`/#/settings?google=error&reason=${encodeURIComponent(e?.message || "unknown")}`);
    }
  });

  // Disconnect this device.
  app.post("/api/google/disconnect", async (req, res) => {
    const sid = getSessionIdFromReq(req);
    if (!sid) return res.json({ ok: true });
    await storage.deleteGoogleToken(sid);
    res.json({ ok: true });
  });

  // Manually re-sync all contacts that don't yet have a googleResourceName.
  // Useful if the user connects Google AFTER scanning a few cards.
  app.post("/api/google/sync-all", async (req, res) => {
    const sid = getSessionIdFromReq(req);
    if (!sid) return res.status(401).json({ error: "Not connected." });
    const tok = await storage.getGoogleToken(sid);
    if (!tok) return res.status(401).json({ error: "Not connected." });

    const all = await storage.listContacts();
    let synced = 0;
    let failed = 0;
    for (const c of all) {
      if (c.googleResourceName) continue;
      try {
        const rn = await pushContactToGoogle(sid, c);
        if (rn) {
          await storage.updateContact(c.id, { googleResourceName: rn });
          synced++;
        }
      } catch (e) {
        failed++;
        console.warn("sync-all: failed for contact", c.id, e);
      }
    }
    res.json({ ok: true, synced, failed, total: all.length });
  });

  // Draft a LinkedIn connection message
  app.post("/api/draft-message", llmLimiter, async (req, res) => {
    const parsed = draftMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    const { name, title, company, metContext, notes } = parsed.data;

    const firstName = name.split(" ")[0] || name;
    const fallback = metContext
      ? `Hi ${firstName}, it was great meeting you at ${metContext}. I'd love to stay connected here on LinkedIn.`
      : `Hi ${firstName}, great to connect${company ? ` — looking forward to following your work at ${company}` : ""}. I'd love to stay in touch here on LinkedIn.`;

    const llm = getLLM();
    if (!llm) return res.json({ message: fallback });

    try {
      const systemPrompt = `Write a short, warm LinkedIn connection note (max 280 characters, no emojis, first-person). Reference how/where we met if context is given. Be specific but humble. Sound like a real person, not a marketer. No exclamation points. Return ONLY the message text, no quotes, no preamble.`;

      const userPrompt = `Person: ${name}${title ? `, ${title}` : ""}${company ? ` at ${company}` : ""}.
Where/how we met: ${metContext || "(not provided — keep generic but warm)"}
Notes from the user: ${notes || "(none)"}`;

      const completion = await llm.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      });
      const text: string = (completion.choices?.[0]?.message?.content ?? "").trim().replace(/^"|"$/g, "");
      const message = text || fallback;
      return res.json({ message: message.slice(0, 300) });
    } catch (e) {
      console.warn("LLM draft failed, using fallback:", e);
      return res.json({ message: fallback });
    }
  });

  return httpServer;
}
