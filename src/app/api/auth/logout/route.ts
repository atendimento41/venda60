import { NextResponse } from "next/server";
import { cookieLogout } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", cookieLogout());
  return res;
}
