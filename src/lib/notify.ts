import nodemailer from "nodemailer";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import { storagePut } from "./storage";

export type Outbound = { mode: "smtp" | "whatsapp" | "msg91" | "simulator" | "outbox"; id?: string };

export interface FaceMatchPort {
  compare(live: Buffer, reference: Buffer | null): Promise<{ match: boolean; score: number; mode: "simulator" | "provider" }>;
}

export class SimulatorFaceMatch implements FaceMatchPort {
  async compare(live: Buffer, reference: Buffer | null) {
    if (!reference || reference.length === 0 || live.length === 0) return { match: false, score: 0, mode: "simulator" as const };
    if (live.subarray(0, 4).toString() === "FAIL") return { match: false, score: 0.1, mode: "simulator" as const };
    if (live.equals(reference)) return { match: true, score: 1, mode: "simulator" as const };
    return { match: live.length > 8 && reference.length > 8, score: 0.86, mode: "simulator" as const };
  }
}

export function faceMatcher(): FaceMatchPort {
  return new SimulatorFaceMatch();
}

async function remember(tx: Tx | null, tenantId: string, actorId: string | null, subject: string, body: string, kind: string) {
  if (!tx) return;
  const row = await tx.outboxMail.create({ data: { tenantId, subject, body } });
  await storagePut(`outbox/${row.id}.eml`, Buffer.from(`Subject: ${subject}\n\n${body}\n`), "message/rfc822");
  await appendLedger(tx, {
    tenantId,
    eventType: kind,
    entityType: "outbox_mail",
    entityId: row.id,
    actorId,
    payload: { subject, mode: "outbox" },
  });
  return row.id;
}

export async function deliverEmail(
  tx: Tx,
  input: { tenantId: string; actorId: string | null; to: string; subject: string; text: string; filename?: string; attachment?: Buffer },
): Promise<Outbound> {
  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || "desk@mighty-movers.example",
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachment ? [{ filename: input.filename || "document.pdf", content: input.attachment }] : undefined,
    });
    await appendLedger(tx, {
      tenantId: input.tenantId,
      eventType: "email.sent",
      entityType: "tenant",
      entityId: input.tenantId,
      actorId: input.actorId,
      payload: { subject: input.subject, to: input.to, mode: "smtp" },
    });
    return { mode: "smtp" };
  }
  const id = await remember(tx, input.tenantId, input.actorId, input.subject, `To: ${input.to}\n\n${input.text}`, "email.summary");
  return { mode: "outbox", id };
}

export async function shareWhatsApp(
  tx: Tx,
  input: { tenantId: string; actorId: string | null; to: string; caption: string; filename: string; pdf: Buffer },
): Promise<Outbound> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneId) {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", "application/pdf");
    form.set("file", new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }), input.filename);
    const uploaded = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (!uploaded.ok) throw new Error(`WhatsApp media upload failed (${uploaded.status})`);
    const media = (await uploaded.json()) as { id?: string };
    const sent = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to.replace(/\D/g, ""),
        type: "document",
        document: { id: media.id, caption: input.caption, filename: input.filename },
      }),
    });
    if (!sent.ok) throw new Error(`WhatsApp send failed (${sent.status})`);
    await appendLedger(tx, {
      tenantId: input.tenantId,
      eventType: "whatsapp.sent",
      entityType: "tenant",
      entityId: input.tenantId,
      actorId: input.actorId,
      payload: { to: input.to, filename: input.filename },
    });
    return { mode: "whatsapp" };
  }
  const id = await remember(tx, input.tenantId, input.actorId, `WhatsApp ${input.filename}`, `${input.caption}\nTo: ${input.to}`, "whatsapp.queued");
  return { mode: "outbox", id };
}

export async function sendSmsOtp(phone: string, otp: string): Promise<Outbound> {
  const key = process.env.MSG91_AUTH_KEY;
  if (key && phone) {
    const response = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: { authkey: key, "content-type": "application/json" },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: phone.replace(/\D/g, ""),
        sender: process.env.MSG91_SENDER,
        otp,
      }),
    });
    if (!response.ok) throw new Error(`SMS provider failed (${response.status})`);
    return { mode: "msg91" };
  }
  return { mode: "simulator" };
}
