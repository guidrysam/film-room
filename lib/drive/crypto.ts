import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function encryptionKey(): Buffer {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY is not configured.");
  }
  // Accept 64-char hex or any string hashed to 32 bytes via SHA-256 of the string itself.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export type EncryptedBlob = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function encryptSecret(plaintext: string): EncryptedBlob {
  const key = encryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(blob: EncryptedBlob): string {
  const key = encryptionKey();
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(blob.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
