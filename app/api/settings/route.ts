import { NextResponse } from "next/server";
import { getSettings, upsertSettings } from "@/lib/queries";
import type { TariffSettings } from "@/lib/metrics";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<TariffSettings>;
  const updated = await upsertSettings(body);
  return NextResponse.json(updated);
}
