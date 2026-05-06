import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertContactSchema, parseCardSchema, draftMessageSchema } from "@shared/schema";
import OpenAI from "openai";

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
