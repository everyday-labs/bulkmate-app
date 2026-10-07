// Loads every source module so coverage reports untested files as 0% instead
// of leaving them out (Deno only counts modules a test imports). index.ts
// files are skipped: each one only calls serve(handler) and would start a
// server — the logic they wire up lives in handler.ts.
import { assert } from 'jsr:@std/assert@1';

const root = new URL('./', import.meta.url);

async function* sourceFiles(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) {
      if (entry.name !== '_testing') yield* sourceFiles(url);
    } else if (
      entry.name.endsWith('.ts') &&
      entry.name !== 'index.ts' &&
      !entry.name.endsWith('.test.ts')
    ) {
      yield url;
    }
  }
}

Deno.test('every Edge Function source module loads', async () => {
  let count = 0;
  for await (const file of sourceFiles(root)) {
    await import(file.href);
    count++;
  }
  assert(count > 20, `expected to load the source modules, loaded ${count}`);
});
