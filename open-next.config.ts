import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page is rendered on demand and data lives in D1, so no incremental cache is needed.
export default defineCloudflareConfig();
