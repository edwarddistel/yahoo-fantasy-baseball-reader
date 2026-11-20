import { mkdir, open, rename, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** A rename in the same directory prevents readers from seeing a partially written file. */
export async function atomicWriteJson(file, value, { mode = 0o600 } = {}) {
  const location = path.resolve(file);
  await mkdir(path.dirname(location), { recursive: true });
  const temporary = `${location}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.close();
    handle = null;
    await chmod(temporary, mode);
    await rename(temporary, location);
    await chmod(location, mode);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
