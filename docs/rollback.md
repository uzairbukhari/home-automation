# Rolling back the UI redesign

The app as it was before the UI and Energy redesign is kept on the branch `baseline/ui-2026-10-13`
(`main` at commit `3a03e4d`, after PR #51). Never delete that branch.

## Fastest: Vercel Instant Rollback (live site only)
1. Vercel dashboard → the project → **Deployments**.
2. Open the last deployment from before the redesign → **⋯ → Instant Rollback**.
3. The old UI is live within seconds. A later merge to `main` deploys the redesign again, so also do one of the options below if you want the rollback to stay.

## Permanent: restore the code
Ask Claude to open a PR that restores the app code from `baseline/ui-2026-10-13` onto `main`, or run:

```sh
git checkout -b revert-ui origin/main
git checkout origin/baseline/ui-2026-10-13 -- app components lib hooks public
git commit -m "Restore the UI from baseline/ui-2026-10-13"
```

Merging that PR redeploys the old UI.

## Data is safe either way
Every redesign change to the database only adds tables or columns (see `drizzle/`), never alters or drops existing ones.
The baseline app ignores the additions and keeps reading the same Turso data.

## One phase only
Each redesign phase is its own PR; reverting a single phase is a normal `git revert` of its merge commit.
