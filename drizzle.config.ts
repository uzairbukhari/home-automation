import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" }); // never overrides real process.env (e.g. a shell-exported prod DATABASE_URL for a one-off command)

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    // Normalize "" -> undefined: local file: URLs have no auth token, but an
    // empty string (vs. unset) fails drizzle-kit's turso dialect validation.
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
