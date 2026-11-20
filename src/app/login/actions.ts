"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

type LoginRow = {
  user_id: string;
  tenant_id: string;
  password_hash: string;
  role: string;
  name: string;
  driver_id: string | null;
};

export async function loginAction(formData: FormData) {
  const slug = String(formData.get("workspace") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rows = await prisma.$queryRaw<LoginRow[]>`SELECT * FROM app_login(${slug}, ${email})`;
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    redirect("/login?error=1");
  }
  await setSessionCookie({
    uid: row.user_id,
    tid: row.tenant_id,
    role: row.role,
    name: row.name,
    email,
    driverId: row.driver_id,
  });
  redirect(row.role === "DRIVER" ? "/driver" : "/desk");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
