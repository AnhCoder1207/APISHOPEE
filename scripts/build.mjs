import { rm } from 'node:fs/promises'
import { build } from 'esbuild'

await rm('dist', { recursive: true, force: true })
await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/server.js',
  sourcemap: true,
  packages: 'external',
})
