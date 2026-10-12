declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    TURSO_DATABASE_URL?: string;
    TURSO_AUTH_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
