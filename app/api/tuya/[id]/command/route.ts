import { NextResponse } from "next/server";
import { sendCommand } from "@/lib/tuya/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { commands } = (await request.json()) as {
    commands?: Array<{ code: string; value: string | number | boolean }>;
  };

  if (!commands?.length) {
    return NextResponse.json({ error: "commands is required" }, { status: 400 });
  }

  try {
    await sendCommand(id, commands);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
