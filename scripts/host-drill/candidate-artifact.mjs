import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function preserveCandidate(path, exportedBytes, expectedSha256) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  if (!Buffer.isBuffer(exportedBytes) || hash(exportedBytes) !== expectedSha256) {
    throw new Error('Candidate bytes do not match the verified export fingerprint');
  }
  writeFileSync(path, exportedBytes, { flag: 'wx' });
  const artifactSha256 = hash(readFileSync(path));
  if (artifactSha256 !== expectedSha256) throw new Error('Review artifact fingerprint mismatch');
  return artifactSha256;
}
