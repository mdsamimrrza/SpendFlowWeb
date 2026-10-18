/**
 * Entry for `node --test --import ./scripts/ts-resolve-register.mjs`:
 * registers the `@/*` alias hook so tests import TS modules natively.
 */
import { register } from "node:module";
register("./ts-resolve-hook.mjs", import.meta.url);
