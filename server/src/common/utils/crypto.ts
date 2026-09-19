import crypto from "node:crypto";
import { env } from "../../env.js";

const ALGORITHM = "aes-256-gcm";
// ENCRYPTION_KEY can be any length string; hashing it down to exactly 32
// bytes is what AES-256 requires, without forcing a specific input format.
const key = crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();

/** Encrypts a secret (e.g. a user's own OpenAI key) for storage at rest. */
export function encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
    const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
    if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted payload");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
    return plaintext.toString("utf8");
}
