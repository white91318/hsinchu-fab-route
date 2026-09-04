/**
 * Resolver so plain `node` can run the app's TypeScript modules, which import
 * via the `@/*` alias that tsconfig maps to `src/*`. Used only by
 * scripts/parser-checks.mjs — Next resolves the alias itself at build time.
 */
import { pathToFileURL } from "node:url";

const SRC = pathToFileURL(`${process.cwd()}/src/`).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(`${SRC}${specifier.slice(2)}.ts`, context);
  }
  return next(specifier, context);
}
