import { safeReturnPath } from '@/lib/session';
import { LoginForm } from '@/components/login-form';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  invalid: 'That password is not correct.',
  locked: 'Too many attempts. Try again in a few minutes.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; return_to?: string }> }) {
  const { error, return_to } = await searchParams;
  return <LoginForm returnTo={safeReturnPath(return_to)} error={error ? MESSAGES[error] ?? MESSAGES.invalid : undefined} />;
}
