/**
 * dsh-local-web-discovery build: three artifacts, one package.
 *
 * - lib/index.js     — host half (ESM, node): Cordis plugin registering the
 *                       discovery_search tool.
 * - lib/discovery.mjs — standalone pure module (port + engines + tool logic +
 *                       discovery store) rebuilt as its own entry so the smoke
 *                       can unit-test without the cordis externals
 *                       (endpoint-health latch/metrics pattern).
 * - lib/client.js    — browser half (CJS ModuleLoader factory): no-op stub;
 *                       the companion is tool-only (M7), the face exists for
 *                       C9 shape parity with the dual-face siblings.
 *
 * Mirrors dsh-web-missions / dsh-slot-health packaging.
 */
import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const id = pkg.name

await mkdir(join(root, 'lib'), { recursive: true })

// ---- host half (ESM, node) -------------------------------------------------
await build({
  entryPoints: [join(root, 'src/host/index.ts')],
  outfile: join(root, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  external: ['@deepseek-ai/*'],
  logLevel: 'warning',
})

// ---- discovery core (testable standalone entry) -----------------------------
await build({
  entryPoints: [join(root, 'src/host/discovery-core.ts')],
  outfile: join(root, 'lib/discovery.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- client half (CJS, browser ModuleLoader factory — no-op) ----------------
await build({
  entryPoints: [join(root, 'src/client/index.ts')],
  outfile: join(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'warning',
})

console.log(`[dsh-local-web-discovery] built lib/index.js + lib/discovery.mjs + lib/client.js for ${id}`)
