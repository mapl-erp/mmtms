import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StorageMode = "blob" | "s3" | "disk";

export function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) return "s3";
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Set BLOB_READ_WRITE_TOKEN or S3_BUCKET before storing files in production.");
  }
  return "disk";
}

function diskRoot() {
  return path.resolve(process.cwd(), "data", "uploads");
}

function diskFile(key: string) {
  const root = diskRoot();
  const abs = path.resolve(root, key);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("file path escapes the upload directory");
  return abs;
}

export async function storagePut(key: string, bytes: Buffer, mime: string): Promise<void> {
  const mode = storageMode();
  if (mode === "disk") {
    const abs = diskFile(key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    return;
  }
  if (mode === "blob") {
    const { put } = await import("@vercel/blob");
    await put(key, bytes, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: mime,
      allowOverwrite: true,
    });
    return;
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: bytes, ContentType: mime }));
}

export async function storageGet(key: string): Promise<Buffer> {
  const mode = storageMode();
  if (mode === "disk") return readFile(diskFile(key));
  if (mode === "blob") {
    const { get } = await import("@vercel/blob");
    const result = await get(key, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error("stored object is missing");
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
    }
    return Buffer.concat(chunks);
  }
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
  const result = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  const body = result.Body;
  if (!body) throw new Error("stored object is missing");
  return Buffer.from(await body.transformToByteArray());
}
