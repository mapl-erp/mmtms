import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tx } from "./db";
import { sha256Bytes } from "./ledger";
import { uploadPath } from "./verify";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
};

export async function storeBytes(tx: Tx, tenantId: string, bytes: Buffer, mime: string, label: string) {
  const sha256 = sha256Bytes(bytes);
  const ext = MIME_EXT[mime] ?? ".bin";
  const relative = path.join(tenantId, sha256.slice(0, 2), `${sha256}${ext}`);
  const absolute = uploadPath(relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return tx.storedFile.create({
    data: {
      tenantId,
      sha256,
      bytes: bytes.length,
      mime,
      label,
      path: relative,
    },
  });
}

export function labeledSvg(title: string, subtitle: string): Buffer {
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
  <rect width="960" height="600" fill="#1b3a34"/>
  <rect x="28" y="28" width="904" height="544" rx="18" fill="#f6efe4"/>
  <rect x="28" y="28" width="904" height="74" rx="18" fill="#e7a23a"/>
  <text x="56" y="76" font-family="Georgia, serif" font-size="32" fill="#1c1612">Mighty Movers proof</text>
  <text x="56" y="210" font-family="Georgia, serif" font-size="54" fill="#1c1612">${escape(title)}</text>
  <text x="56" y="270" font-family="ui-sans-serif, sans-serif" font-size="28" fill="#5c5348">${escape(subtitle)}</text>
  <text x="56" y="520" font-family="ui-monospace, monospace" font-size="18" fill="#1b3a34">CAMERA-STAMPED STILL · NOT FROM THE GALLERY</text>
</svg>`;
  return Buffer.from(svg);
}
