import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  title: text("title"),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  // Where & how you met them — used to draft the LinkedIn message
  metContext: text("met_context"),
  // Free-form notes from the user
  notes: text("notes"),
  // Raw OCR text from the card scan, kept for reference
  rawOcrText: text("raw_ocr_text"),
  // Pre-drafted LinkedIn connection message
  draftMessage: text("draft_message"),
  // Downscaled JPEG of the scanned card, stored as a data URL
  // (data:image/jpeg;base64,...). Used as the contact's profile picture.
  cardImage: text("card_image"),
  // ISO timestamp string
  createdAt: text("created_at").notNull(),
});

// Cap individual string fields so abusive callers can't push huge payloads.
// Card images are downscaled to ~600px JPEG; 800KB of base64 is comfortably
// over our real-world ceiling but well under the 1MB body limit.
export const insertContactSchema = createInsertSchema(contacts)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    name: z.string().min(1).max(200),
    title: z.string().max(200).optional().nullable(),
    company: z.string().max(200).optional().nullable(),
    email: z.string().max(200).optional().nullable(),
    phone: z.string().max(80).optional().nullable(),
    website: z.string().max(300).optional().nullable(),
    linkedinUrl: z.string().max(500).optional().nullable(),
    metContext: z.string().max(500).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    rawOcrText: z.string().max(8000).optional().nullable(),
    draftMessage: z.string().max(2000).optional().nullable(),
    cardImage: z.string().max(800_000).optional().nullable(),
  });

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Schema for OCR parse request
// rawText is bounded so that abusive callers can't push huge payloads through the
// LLM endpoint and inflate token cost.
export const parseCardSchema = z.object({
  rawText: z.string().min(1).max(4000),
});
export type ParseCardInput = z.infer<typeof parseCardSchema>;

// Schema for drafting a LinkedIn message
export const draftMessageSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  metContext: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type DraftMessageInput = z.infer<typeof draftMessageSchema>;
