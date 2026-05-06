import { contacts } from '@shared/schema';
import type { Contact, InsertContact } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

// Allow the SQLite path to be overridden via env var so deployments can
// point it at a mounted persistent disk (e.g. Render's /var/data). Defaults
// to a project-relative file for local dev and the pplx.app sandbox.
const DB_PATH = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Bootstrap table (Drizzle migrations not used in this template)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    company TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    linkedin_url TEXT,
    met_context TEXT,
    notes TEXT,
    raw_ocr_text TEXT,
    draft_message TEXT,
    card_image TEXT,
    created_at TEXT NOT NULL
  );
`);

// Idempotent migration: add `card_image` to pre-existing databases that were
// created before the column existed (e.g. the live published sandbox snapshot).
try {
  const cols = sqlite.prepare("PRAGMA table_info(contacts);").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "card_image")) {
    sqlite.exec("ALTER TABLE contacts ADD COLUMN card_image TEXT;");
  }
} catch (e) {
  console.warn("Could not run card_image migration:", e);
}

export const db = drizzle(sqlite);

export interface IStorage {
  listContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(input: InsertContact): Promise<Contact>;
  updateContact(id: number, input: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async listContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(desc(contacts.id)).all();
  }

  async getContact(id: number): Promise<Contact | undefined> {
    return db.select().from(contacts).where(eq(contacts.id, id)).get();
  }

  async createContact(input: InsertContact): Promise<Contact> {
    return db
      .insert(contacts)
      .values({ ...input, createdAt: new Date().toISOString() })
      .returning()
      .get();
  }

  async updateContact(id: number, input: Partial<InsertContact>): Promise<Contact | undefined> {
    const result = db
      .update(contacts)
      .set(input)
      .where(eq(contacts.id, id))
      .returning()
      .get();
    return result;
  }

  async deleteContact(id: number): Promise<boolean> {
    const result = db.delete(contacts).where(eq(contacts.id, id)).run();
    return result.changes > 0;
  }
}

export const storage = new DatabaseStorage();
