import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { existsSync, readFileSync } from 'fs'

// Rollup and Vite dev server convert file paths to file:// URLs internally.
// When the project directory contains '#', the '#' is treated as a URL fragment
// separator, truncating the path and breaking resolution.
// This plugin uses Node's path.resolve() directly to bypass URL-based resolution.
// Handles both:
//   1. Relative imports ('./foo') from importers whose path contains '#'
//   2. Absolute URL imports ('/main.tsx') when the Vite root itself contains '#'
const makeHashPathResolverPlugin = (viteRoot?: string) => ({
  name: 'hash-path-resolver',
  resolveId(source: string, importer: string | undefined): string | null {
    // Absolute URL path (e.g. /main.tsx) resolved against the Vite root
    if (source.startsWith('/') && viteRoot && viteRoot.includes('#')) {
      const exts = ['', '.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js']
      for (const ext of exts) {
        const full = resolve(viteRoot, source.slice(1) + ext)
        if (existsSync(full)) return full
      }
    }
    // Relative imports from files whose path contains '#'
    if (!importer || !source.startsWith('.')) return null
    if (!importer.includes('#')) return null
    const dir = dirname(importer)
    const exts = ['', '.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js']
    for (const ext of exts) {
      const full = resolve(dir, source + ext)
      if (existsSync(full)) return full
    }
    return null
  },
  // Vite's internal cleanUrl() strips everything after '#', treating it as a URL
  // fragment — this breaks when '#' appears in a directory name. We bypass that
  // by reading the file directly when the full resolved id (with '#') exists on disk.
  load(id: string): string | null {
    if (id.includes('#') && existsSync(id)) {
      return readFileSync(id, 'utf-8')
    }
    return null
  },
})

const rendererRoot = resolve(__dirname, 'src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), makeHashPathResolverPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), makeHashPathResolverPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: rendererRoot,
    // Move Vite's dep-optimization cache outside the '#' directory.
    // Vite serves optimized deps via /@fs/<abs-path>, and '#' in the path
    // is treated as a URL fragment by browsers, truncating the URL.
    cacheDir: resolve(__dirname, '../vite-cache-학교업무도우미'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html')
        }
      }
    },
    plugins: [react(), makeHashPathResolverPlugin(rendererRoot)],
    resolve: {
      // TypeScript 소스를 우선 사용하여 과거 타입 검사에서 생성된 .js 파일이
      // 남아 있어도 최신 .ts/.tsx 구현이 번들에 포함되도록 한다.
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
      alias: {
        '@': rendererRoot,
        '@renderer': rendererRoot
      }
    }
  }
})
