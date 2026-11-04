// Worker entry: the OpenNext build plus the D1 binding and cron handler. Used as `main` in wrangler.jsonc.
import app, { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js';
import { withScheduled } from './handler.mjs';

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };
export default withScheduled(app);
