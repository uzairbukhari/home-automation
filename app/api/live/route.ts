import { NextResponse } from "next/server";
import { getLiveData } from "@/lib/live-data";

export async function GET() {
  return NextResponse.json(await getLiveData());
}
