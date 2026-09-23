import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}

test('application CSS gets literal palette values only from the theme contract', () => {
  const source = resolve(import.meta.dirname, '../src');
  const theme = join(source, 'app/theme.css');
  const exceptions = cssFiles(source).filter((path) => path !== theme && /#[\da-f]{3,8}\b/i.test(readFileSync(path, 'utf8')));
  assert.deepEqual(exceptions, [], 'Move new color literals into src/app/theme.css semantic tokens');
  assert.match(readFileSync(theme, 'utf8'), /--folio-font-body:/);
  assert.match(readFileSync(theme, 'utf8'), /--folio-accent:/);
});
