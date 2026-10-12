import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export type SessionUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const values = env as unknown as Record<string, unknown>;
  const secret = typeof values.SESSION_SECRET === "string" ? values.SESSION_SECRET : undefined;
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  if (!session) return null;
  return { userId: session.userId, displayName: session.email, email: session.email, fullName: null };
}

export function signInPath(returnTo: string): string {
  return `/login?return_to=${encodeURIComponent(returnTo)}`;
}
