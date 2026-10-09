function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function decode(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function key(secret: string) {
  const raw = decode(secret);
  if (raw.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 base64-encoded bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptToken(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    new TextEncoder().encode(token),
  );
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function decryptToken(value: string, secret: string) {
  const [iv, ciphertext] = value.split(".");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv) },
    await key(secret),
    decode(ciphertext),
  );
  return new TextDecoder().decode(plain);
}
export function randomToken() {
  return encode(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function hashToken(token: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
