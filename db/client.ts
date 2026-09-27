import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// DATABASE_URL:
//   - Turso (cloud, free tier):  libsql://<db-name>-<org>.turso.io
//   - Local file (VPS/dev):      file:./data.db
// DATABASE_AUTH_TOKEN is required for Turso, unused for local file DBs.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

export const db = drizzle(client, { schema });
