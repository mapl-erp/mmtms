import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Session = {
  uid: string;
  tid: string;
  role: string;
  name: string;
  email: string;
  driverId: string | null;
  exp: number;
};

const COOKIE = "mm_session";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function encodeSession(session: Session): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string): Session | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export async function requireSession(): Promise<Session> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSessionCookie(session: Omit<Session, "exp">) {
  const jar = await cookies();
  const token = encodeSession({ ...session, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function actorFrom(session: Session): Actor {
  return {
    id: session.uid,
    tenantId: session.tid,
    role: session.role,
    name: session.name,
    driverId: session.driverId,
    permissionOverrides: {},
  };
}

export type Actor = {
  id: string;
  tenantId: string;
  role: string;
  name: string;
  driverId: string | null;
  permissionOverrides?: unknown;
};
