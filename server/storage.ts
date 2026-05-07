import { contacts, googleTokens } from '@shared/schema';
import type { Contact, InsertContact, GoogleToken } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

// Allow the SQLite path to be overridden via env var so deployments can
// point it at a mounted persistent disk (e.g. Render's /var/data). Defaults
// to a project-relative file for local dev and the pplx.app sandbox.
const DB_PATH = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Bootstrap tables (Drizzle migrations not used in this template)
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
    google_resource_name TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS google_tokens (
    session_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    email TEXT,
    name TEXT,
    picture TEXT,
    connected_at TEXT NOT NULL
  );
`);

// Idempotent migrations: add columns to pre-existing databases that were
// created before they existed.
function ensureColumn(table: string, column: string, ddl: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table});`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
    }
  } catch (e) {
    console.warn(`Could not run migration for ${table}.${column}:`, e);
  }
}
ensureColumn("contacts", "card_image", "card_image TEXT");
ensureColumn("contacts", "google_resource_name", "google_resource_name TEXT");

export const db = drizzle(sqlite);

export interface IStorage {
  listContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(input: InsertContact): Promise<Contact>;
  updateContact(id: number, input: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;
  getGoogleToken(sessionId: string): Promise<GoogleToken | undefined>;
  upsertGoogleToken(token: GoogleToken): Promise<GoogleToken>;
  deleteGoogleToken(sessionId: string): Promise<boolean>;
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

  async getGoogleToken(sessionId: string): Promise<GoogleToken | undefined> {
    return db.select().from(googleTokens).where(eq(googleTokens.sessionId, sessionId)).get();
  }

  async upsertGoogleToken(token: GoogleToken): Promise<GoogleToken> {
    const existing = await this.getGoogleToken(token.sessionId);
    if (existing) {
      const updated = db
        .update(googleTokens)
        .set({
          accessToken: token.accessToken,
          // Some refresh flows don't return a new refresh token; keep the old one.
          refreshToken: token.refreshToken || existing.refreshToken,
          expiresAt: token.expiresAt,
          email: token.email ?? existing.email,
          name: token.name ?? existing.name,
          picture: token.picture ?? existing.picture,
        })
        .where(eq(googleTokens.sessionId, token.sessionId))
        .returning()
        .get();
      return updated;
    }
    return db.insert(googleTokens).values(token).returning().get();
  }

  async deleteGoogleToken(sessionId: string): Promise<boolean> {
    const result = db.delete(googleTokens).where(eq(googleTokens.sessionId, sessionId)).run();
    return result.changes > 0;
  }
}

export const storage = new DatabaseStorage();
