import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { preserveCandidate } from './candidate-artifact.mjs';

test('approval artifact retains exact exported bytes, including final newline', () => {
  const dir=mkdtempSync(join(tmpdir(),'candidate-artifact-'));
  try {
    const bytes=Buffer.from('{\n  "version": 1\n}\n');
    const fingerprint=createHash('sha256').update(bytes).digest('hex');
    const path=join(dir,'candidate.json');
    assert.equal(preserveCandidate(path,bytes,fingerprint),fingerprint);
    assert.deepEqual(readFileSync(path),bytes);
    const reserialized=Buffer.from(JSON.stringify(JSON.parse(bytes),null,2));
    assert.throws(()=>preserveCandidate(join(dir,'altered.json'),reserialized,fingerprint),/fingerprint/);
    assert.throws(()=>preserveCandidate(path,bytes,fingerprint),/EEXIST/);
    assert.deepEqual(readFileSync(path),bytes);
  } finally {
    try {unlinkSync(join(dir,'candidate.json'));} catch(e) {if(e.code!=='ENOENT')throw e;}
    rmdirSync(dir);
  }
});
