// Adds what OpenNext's generated Worker lacks: the D1 binding for the app's database layer and a cron (scheduled) handler.
// Kept apart from worker.mjs, which imports the build output, so it can be tested without a build.

const D1_BINDING = Symbol.for('home-automation.d1'); // read by lib/db.ts

export function withScheduled(app) {
  const bind = env => { if (env?.DB) globalThis[D1_BINDING] = env.DB; };
  return {
    async fetch(request, env, ctx) { bind(env); return app.fetch(request, env, ctx); },
    // The cron trigger runs the same collection as POST /api/mobile/collect (usage counting and blocked-database handling included)
    // by calling the app in-process with the collection secret, so there is one collection code path.
    async scheduled(controller, env, ctx) {
      bind(env);
      const secret = env.NOTIFICATION_COLLECTION_SECRET || env.NOTIFICATION_SCHEDULE_SECRET;
      if (!secret) throw new Error('Set NOTIFICATION_COLLECTION_SECRET as a secret on the Worker so the cron can run the collection.');
      const response = await app.fetch(new Request('https://worker.internal/api/mobile/collect', { method: 'POST', headers: { 'x-collection-secret': secret } }), env, ctx);
      if (response.status >= 400) throw new Error(`Collection answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    },
  };
}
