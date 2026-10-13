# Five-minute Photon checks on cron-job.org

The earlier hosting scheduler rejected five-minute runs because its minimum interval is hourly. No hourly substitute was created. The deployed collector has been verified with both providers and alert evaluation. The existing external job is active: production database records confirmed recurring five-minute collection on 2026-10-06, including the first version 35 collection at 06:30 UTC. Retain that job; the steps below are for recovery or replacement, not creating a duplicate. Provider acceleration remains disabled until actual entitlement is verified.

1. Sign in at https://console.cron-job.org and create a job called **Photon collection and alerts**.
2. Use URL `https://<your-project>.vercel.app/api/mobile/collect`.
3. Set the schedule to every **5 minutes**, timezone **Asia/Karachi**. Keep it enabled.
4. In advanced settings select **POST**, with an empty body. Add header **x-collection-secret** using the value from the private local file `outputs/android/cron-job-setup.private.json`. Do not put the secret in the URL. The public hosting layer needs no extra bearer header; the endpoint checks its own server secret.
5. Leave response saving disabled. Enable failed-run, recovery and automatic-disable notices if you want scheduler health messages. Use the available 30-second timeout, then run the test execution.
6. Confirm HTTP **200**, both provider results `ok: true`, and alert status `completed` (or `already_running` if another collection is active). The Photon notification settings show the last evaluation time. If a provider fails, the endpoint returns **502** but still evaluates stale-data rules. Repeated timeouts need investigation before enabling the job.

The private JSON contains the exact request settings and a ready-to-use API creation payload. It is excluded from source and hosting archives. It contains a collection credential: keep it private. Use only one scheduler for this endpoint. Do not enable both this job and a second collection job unintentionally.

The free service supports minute intervals and a 30-second execution limit. See [cron-job.org's FAQ](https://cron-job.org/en/faq/) and [request settings](https://docs.cron-job.org/creating-cron-jobs.html). For programmatic setup see its [API documentation](https://docs.cron-job.org/rest-api.html); an API key belongs in your private account settings and must never be committed.

