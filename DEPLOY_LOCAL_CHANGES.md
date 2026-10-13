# Deploy local changes to the hosted dashboard

Use this checklist whenever you update the dashboard in VS Code and want those changes to appear on the private hosted site.

## 1. Open the project

In VS Code, open this folder:

```text
C:\GitHub\home-automation\solar-dashboard
```

Open the integrated terminal and confirm it is in that folder:

```powershell
cd C:\GitHub\home-automation\solar-dashboard
```

## 2. Run and check your changes locally

Start the local dashboard:

```powershell
npm run dev -- --port 5173
```

Open the local address shown in the terminal, usually:

```text
http://localhost:5173
```

Check the pages you changed before deploying. Stop the local server with `Ctrl+C` when you are finished.

## 3. Create a production build

Run:

```powershell
npm run build
```

Fix any reported errors before continuing.

## 4. Save your code changes in Git

Review the files that changed:

```powershell
git status
```

Add only the files you intend to publish, then create a commit:

```powershell
git add <file-or-folder>
git commit -m "Describe the change"
```

Examples:

```powershell
git add app lib
git commit -m "Improve battery report"
```

Do **not** add `.env.local`. It contains your DessMonitor and Tuya credentials and must remain on your computer only.

## 5. Publish the change

Push your branch, open a pull request, and merge it into `main` once the CI check is green. Merging deploys automatically to Vercel (see `docs/vercel-setup.md`).

## Before each deployment

- Keep `.env.local` private and out of Git.
- Run `npm run build` successfully.
- Check `git status` so unrelated work is not included.
- Confirm the deployed dashboard behaves correctly after release (the Vercel dashboard shows each deployment).
