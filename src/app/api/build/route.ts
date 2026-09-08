import { NextResponse } from "next/server";
import { APP_BUILD } from "@/lib/utils";

export async function GET() {
  return NextResponse.json({ build: APP_BUILD });
}
