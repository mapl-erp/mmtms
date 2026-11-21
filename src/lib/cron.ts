export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret) return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
  return header === `Bearer ${secret}`;
}
