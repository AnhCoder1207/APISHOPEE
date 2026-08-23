import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir('dist', { recursive: true })
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
