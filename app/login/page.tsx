import { safeReturnPath } from '@/lib/session';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  invalid: 'That password is not correct.',
  locked: 'Too many attempts. Try again in a few minutes.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; return_to?: string }> }) {
  const { error, return_to } = await searchParams;
  return (
    <main className="mobile-status-page">
      <h1>Private dashboard</h1>
      <form method="post" action="/api/auth/login">
        <input type="hidden" name="return_to" value={safeReturnPath(return_to)} />
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" autoFocus required />
        </label>
        {error && <p role="alert">{MESSAGES[error] ?? MESSAGES.invalid}</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
