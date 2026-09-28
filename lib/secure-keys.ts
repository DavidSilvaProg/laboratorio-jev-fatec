import { env } from "cloudflare:workers";

export type Provider = "jev" | "openrouter";

function database(): D1Database {
  if (!env.DB) throw new Error("Banco indisponível");
  return env.DB;
}

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function base64FromBytes(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function cryptoKey(): Promise<CryptoKey> {
  const encoded = env.KEY_ENCRYPTION_SECRET;
  if (!encoded) throw new Error("Cofre indisponível");
  const raw = bytesFromBase64(encoded);
  if (raw.byteLength !== 32) throw new Error("Cofre inválido");
  return crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function associatedData(userId: string, provider: Provider): Uint8Array {
  return new TextEncoder().encode(`${userId}:${provider}`);
}

export async function saveKey(userId: string, provider: Provider, value: string): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv), additionalData: asArrayBuffer(associatedData(userId, provider)) },
    await cryptoKey(),
    asArrayBuffer(new TextEncoder().encode(value)),
  );
  await database().prepare(`INSERT INTO api_keys (user_id, provider, ciphertext, iv, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
    ciphertext = excluded.ciphertext, iv = excluded.iv, updated_at = excluded.updated_at`)
    .bind(userId, provider, base64FromBytes(new Uint8Array(ciphertext)), base64FromBytes(iv), new Date().toISOString())
    .run();
}

export async function loadKey(userId: string, provider: Provider): Promise<string | null> {
  const row = await database().prepare(
    "SELECT ciphertext, iv FROM api_keys WHERE user_id = ? AND provider = ?"
  ).bind(userId, provider).first<{ ciphertext: string; iv: string }>();
  if (!row) return null;
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(bytesFromBase64(row.iv)), additionalData: asArrayBuffer(associatedData(userId, provider)) },
    await cryptoKey(),
    asArrayBuffer(bytesFromBase64(row.ciphertext)),
  );
  return new TextDecoder().decode(plaintext);
}

export async function keyStatus(userId: string): Promise<Record<Provider, boolean>> {
  const rows = await database().prepare("SELECT provider FROM api_keys WHERE user_id = ?")
    .bind(userId).all<{ provider: Provider }>();
  const found = new Set(rows.results.map((row) => row.provider));
  return { jev: found.has("jev"), openrouter: found.has("openrouter") };
}

export async function deleteKey(userId: string, provider: Provider): Promise<void> {
  await database().prepare("DELETE FROM api_keys WHERE user_id = ? AND provider = ?")
    .bind(userId, provider).run();
}
