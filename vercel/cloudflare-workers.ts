// Stands in for the `cloudflare:workers` module when the app is built with plain Next.js (Vercel):
// settings come from process.env and there are no Cloudflare bindings (DB, BUCKET).
export const env = process.env as unknown as Cloudflare.Env & Record<string, string | undefined>;
