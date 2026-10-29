/**
 * Ed25519 signing for tamper-evident receipts.
 *
 * Customer owns the private key. The boundary signs; anyone with the
 * public key can verify. Keys are never sent to the model vendor.
 */

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  createHash,
  type KeyObject,
} from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface KeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  keyId: string;
}

/** Fingerprint of the public key (short stable id). */
export function keyIdFromPublic(publicKey: KeyObject): string {
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return "ed25519:" + createHash("sha256").update(spki).digest("hex").slice(0, 16);
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKey,
    keyId: keyIdFromPublic(publicKey),
  };
}

/** Load or create a key pair from a PEM file path. */
export function loadOrCreateKeyPair(path: string): KeyPair {
  const abs = resolve(path);
  if (existsSync(abs)) {
    const pem = readFileSync(abs, "utf8");
    const privateKey = createPrivateKey(pem);
    const publicKey = createPublicKey(privateKey);
    return { privateKey, publicKey, keyId: keyIdFromPublic(publicKey) };
  }

  mkdirSync(dirname(abs), { recursive: true });
  const pair = generateKeyPair();
  const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  writeFileSync(abs, pem, { mode: 0o600 });
  // Also write public key alongside for verification
  const pubPath = abs.replace(/\.ed25519$/, "") + ".pub.pem";
  const pubPem = pair.publicKey.export({ type: "spki", format: "pem" }) as string;
  writeFileSync(pubPath, pubPem, { mode: 0o644 });
  return pair;
}

export function signHash(privateKey: KeyObject, contentHash: string): string {
  const sig = sign(null, Buffer.from(contentHash, "utf8"), privateKey);
  return sig.toString("base64url");
}

export function verifyHash(
  publicKey: KeyObject,
  contentHash: string,
  signature: string,
): boolean {
  try {
    return verify(
      null,
      Buffer.from(contentHash, "utf8"),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}
