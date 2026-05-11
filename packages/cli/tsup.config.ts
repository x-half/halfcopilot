import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    halfcop: 'src/halfcop.ts',
  },
  format: ['cjs'],
  bundle: true,
  dts: false,
  platform: 'node',
  splitting: false,
  noExternal: [/@halfcopilot\//],
  external: ['ink', 'react', 'react-devtools-core'],
})