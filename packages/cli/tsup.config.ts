import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    halfcop: 'src/halfcop.ts',
  },
  format: ['cjs'],
  bundle: true,
  dts: false,
  platform: 'node',
  splitting: false,
  noExternal: [/@halfcopilot\//],
})