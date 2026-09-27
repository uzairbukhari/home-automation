import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };
  const hash = process.env.DASHBOARD_PASSWORD_HASH;

  if (!hash) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD_HASH is not configured on the server." },
      { status: 500 }
    );
  }
  if (!password || !verifyPassword(password, hash)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const session = await getSession();
  session.loggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
