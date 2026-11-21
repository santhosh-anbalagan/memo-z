export interface Ciphertext {
  v: 1;
  nonce: string;
  data: string;
}

const encode = new TextEncoder();
const decode = new TextDecoder();
const vaultPurpose = "memo-z/v1/vault";

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
  return result;
}

function importKey(raw: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(key: CryptoKey, value: Uint8Array<ArrayBuffer>, purpose: string): Promise<Ciphertext> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encode.encode(purpose) }, key, value,
  );
  return { v: 1, nonce: base64(nonce), data: base64(new Uint8Array(encrypted)) };
}

async function decrypt(key: CryptoKey, value: Ciphertext, purpose: string) {
  if (value.v !== 1) throw new Error("This encrypted record needs a newer version of Memo Z.");
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(value.nonce), additionalData: encode.encode(purpose) },
    key,
    bytes(value.data),
  );
}

export async function newVault() {
  const recovery = crypto.getRandomValues(new Uint8Array(32));
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  try {
    const wrapper = await importKey(recovery);
    return {
      vault: await encrypt(wrapper, rawKey, vaultPurpose),
      key: await importKey(rawKey),
      recoveryKey: base64(recovery),
    };
  } finally {
    recovery.fill(0);
    rawKey.fill(0);
  }
}

export async function unlockVault(vault: Ciphertext, input: string): Promise<CryptoKey> {
  const normalized = input.replace(/\s/g, "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) throw new Error("Enter your 43-character recovery key.");
  const recovery = bytes(normalized);
  try {
    const wrapper = await importKey(recovery);
    const raw = new Uint8Array(await decrypt(wrapper, vault, vaultPurpose));
    try {
      return await importKey(raw);
    } finally {
      raw.fill(0);
    }
  } catch {
    throw new Error("That key could not unlock this journal.");
  } finally {
    recovery.fill(0);
  }
}

export function recordPurpose(entryId: string, revisionId: string, part: "header" | "body") {
  return `memo-z/v1/entry/${entryId}/${revisionId}/${part}`;
}

export function seal(key: CryptoKey, value: unknown, purpose: string) {
  return encrypt(key, encode.encode(JSON.stringify(value)), purpose);
}

export async function unseal(key: CryptoKey, value: Ciphertext, purpose: string): Promise<unknown> {
  return JSON.parse(decode.decode(await decrypt(key, value, purpose)));
}
