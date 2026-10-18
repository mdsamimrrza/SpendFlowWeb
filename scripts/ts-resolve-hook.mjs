/**
 * Module-resolution hook for `node --test`: maps the codebase's `@/*` path
 * alias onto real files so the TS modules under test import natively (Node 22+
 * strips types; format.ts and constants/app.ts use erasable syntax only).
 * Zero dependencies - docs/TESTING.md's Vitest plan can replace this wholesale
 * when component/E2E layers land.
 */
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(process.cwd(), specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
