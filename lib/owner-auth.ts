import { env } from 'cloudflare:workers';
import { getChatGPTUser, chatGPTSignInPath } from '@/app/chatgpt-auth';
import { redirect } from 'next/navigation';

// Fail closed: opening static assets at the host must never open home data.
export async function getOwnerUser() {
  const user = await getChatGPTUser();
  const owner = (env as unknown as Record<string, unknown>).DASHBOARD_OWNER_EMAIL;
  return user && typeof owner === 'string' && owner.trim() &&
    user.email?.toLowerCase() === owner.trim().toLowerCase() ? user : null;
}

export async function requireOwnerUser(returnTo: string) {
  const user = await getOwnerUser();
  if (user) return user;
  if (!(await getChatGPTUser())) redirect(chatGPTSignInPath(returnTo));
  redirect('/access-denied');
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
