import { clearedSessionCookie } from '@/lib/session';

function logout(request: Request) {
  return new Response(null, {
    status: 303,
    headers: { location: '/login', 'set-cookie': clearedSessionCookie(new URL(request.url).protocol === 'https:'), 'cache-control': 'no-store' },
  });
}

export const GET = logout;
export const POST = logout;
