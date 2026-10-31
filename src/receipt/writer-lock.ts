import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

/** Local-filesystem coordination only; the host must protect this directory. */
export function canonicalReceiptPath(path: string): string {
  fs.mkdirSync(dirname(path), { recursive: true });
  return join(fs.realpathSync.native(dirname(path)), basename(path));
}

function assertRegularSingleLink(path: string): void {
  try {
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error("Receipt log must be a regular file with one link");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Atomic mkdir excludes cooperating writers from startup snapshots and append critical sections.
 * No clock/PID-based expiry: a crashed owner leaves a lock for explicit operator recovery.
 */
export function withReceiptWriterLock<T>(path: string, operation: (assertOwned: () => void) => T): T {
  const lockPath = path + ".writer-lock";
  try { fs.mkdirSync(lockPath, { mode: 0o700 }); }
  catch { throw new Error("Receipt writer lock unavailable; contention or operator recovery required"); }
  const token = join(lockPath, `${process.pid}-${randomUUID()}.owner`);
  let identity: fs.Stats | undefined;
  let ownsToken = false;
  const assertOwned = () => {
    const current = fs.lstatSync(lockPath);
    if (!identity || !current.isDirectory() || current.isSymbolicLink() ||
        current.dev !== identity.dev || current.ino !== identity.ino || !fs.existsSync(token)) {
      throw new Error("Receipt writer lock ownership lost");
    }
  };
  const release = () => {
    assertOwned();
    fs.unlinkSync(token);
    ownsToken = false;
    fs.rmdirSync(lockPath); // Never recursively remove unknown files or a replacement lock.
  };
  try {
    identity = fs.lstatSync(lockPath);
    const fd = fs.openSync(token, "wx", 0o600);
    ownsToken = true;
    fs.closeSync(fd);
    assertRegularSingleLink(path);
    assertOwned();
    const result = operation(assertOwned);
    release();
    return result;
  } catch (error) {
    // Release only an intact lock we still own. Ambiguous/replaced locks stay fail-closed.
    if (ownsToken) {
      try { release(); } catch { /* preserve ambiguous lock; operator recovery required */ }
    }
    throw error;
  }
}
