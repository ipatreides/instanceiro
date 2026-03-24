// src/lib/crypto.ts

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 128; // bits

function getKey(): Buffer {
  const hex = process.env.CALENDAR_ENCRYPTION_KEY;
  if (!hex) throw new Error("CALENDAR_ENCRYPTION_KEY not set");
  return Buffer.from(hex, "hex");
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: ALGORITHM }, false, ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    data
  );

  // Combine iv + ciphertext (includes auth tag) into one buffer
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return Buffer.from(combined).toString("base64");
}

export async function decrypt(encoded: string): Promise<string> {
  const key = getKey();
  const combined = Buffer.from(encoded, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: ALGORITHM }, false, ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
