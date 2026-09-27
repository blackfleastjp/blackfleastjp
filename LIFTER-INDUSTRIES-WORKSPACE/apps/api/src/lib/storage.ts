import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { get, put } from "@vercel/blob";
import { env } from "./env.js";

const localStorageRoot = path.resolve(process.cwd(), "storage");
const s3 =
  env.STORAGE_PROVIDER === "s3"
    ? new S3Client({
        region: env.STORAGE_REGION,
        ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT, forcePathStyle: true } : {}),
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY,
          secretAccessKey: env.STORAGE_SECRET_KEY,
        },
      })
    : null;

function safeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error("Storage key must be a relative path without traversal segments");
  }
  return normalized;
}

export async function storeObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ key: string; url: string | null }> {
  const key = safeKey(input.key);
  if (env.STORAGE_PROVIDER === "s3") {
    await s3!.send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key, url: null };
  }
  if (env.STORAGE_PROVIDER === "vercel-blob") {
    const blob = await put(key, Buffer.from(input.body), {
      access: "private",
      token: env.STORAGE_ACCESS_KEY,
      contentType: input.contentType,
      addRandomSuffix: false,
    });
    return { key, url: blob.url };
  }
  const filePath = path.resolve(localStorageRoot, key);
  if (!filePath.startsWith(`${localStorageRoot}${path.sep}`))
    throw new Error("Storage key is outside the local storage directory");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.body, { flag: "wx" });
  return { key, url: null };
}

export async function readObject(keyInput: string): Promise<Uint8Array> {
  const key = safeKey(keyInput);
  if (env.STORAGE_PROVIDER === "s3") {
    const result = await s3!.send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
    if (!result.Body) throw new Error("Stored object has no content");
    return result.Body.transformToByteArray();
  }
  if (env.STORAGE_PROVIDER === "vercel-blob") {
    const result = await get(key, { access: "private", token: env.STORAGE_ACCESS_KEY });
    if (!result || result.statusCode !== 200) throw new Error("Stored object was not found");
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  const filePath = path.resolve(localStorageRoot, key);
  if (!filePath.startsWith(`${localStorageRoot}${path.sep}`))
    throw new Error("Storage key is outside the local storage directory");
  return readFile(filePath);
}

export function newStorageKey(companyId: string, originalName: string): string {
  const safeName = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120);
  return `${companyId}/${randomUUID()}-${safeName || "file"}`;
}
