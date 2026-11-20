import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const form = await request.formData();
  const slug = String(form.get("workspace") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const origin = String(form.get("origin") ?? "").trim();
  const destination = String(form.get("destination") ?? "").trim();
  const goods = String(form.get("goods") ?? "").trim();
  const weight = Number(form.get("weightTons") ?? 0);
  if (!slug || !name || !phone || !origin || !destination || !goods || !(weight > 0)) {
    return NextResponse.redirect(new URL(`/portal?workspace=${encodeURIComponent(slug)}&error=Fill+every+field`, request.url));
  }
  try {
    await prisma.$queryRaw`SELECT portal_book(${slug}, ${name}, ${phone}, ${origin}, ${destination}, ${goods}, ${weight})`;
  } catch {
    return NextResponse.redirect(new URL(`/portal?workspace=${encodeURIComponent(slug)}&error=Workspace+not+found`, request.url));
  }
  return NextResponse.redirect(new URL(`/portal?workspace=${encodeURIComponent(slug)}&booked=1`, request.url));
}
