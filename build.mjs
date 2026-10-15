/**
 * dsh-web-discovery build — dual-face via shared dsh-build-tools.
 *
 * Defaults: src/host/index.ts → lib/index.js (ESM/node)
 *           src/client/index.ts → lib/client.js (__ModuleLoader__ CJS)
 * Extra:    discovery-core standalone entry for hermetic smoke.
 */
import { buildDshPlugin } from 'dsh-build-tools'

await buildDshPlugin({
  modules: [{ entry: 'src/host/discovery-core.ts', out: 'discovery.mjs' }],
})
