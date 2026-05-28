import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite's built-in `publicDir` only supports a single directory. We have two
// sources of static assets — `public/` (committed seed assets) and `runtime/`
// (gitignored TTS output) — and need both served at the URL root in dev so
// `/audio/<file>` resolves regardless of which dir actually holds it. In
// prod, Express handles this directly. In dev, we splice an extra
// express.static middleware into Vite's request pipeline via this plugin.
const serveRuntimePlugin = {
  name: 'spotifai:serve-runtime-assets',
  configureServer(server) {
    const runtimeDir = path.resolve(__dirname, 'runtime');
    server.middlewares.use(express.static(runtimeDir));
  },
};

// Client-side env vars that the old webpack/DotenvWebpack build exposed via
// `process.env.*`. Vite normally only exposes vars prefixed with VITE_, so we
// explicitly forward this allowlist as `process.env.X` (string-literal define)
// to preserve backwards compatibility with the existing .env file.
const CLIENT_ENV_KEYS = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_REDIRECT_URI',
];

// In dev: Vite serves the client on :3000 (matches Spotify OAuth redirect URI),
// and proxies API + socket.io traffic to Express on :3001.
// In prod: `vite build` emits to dist/, which Express serves directly.
export default defineConfig(({ mode }) => {
  // loadEnv() reads .env / .env.[mode] regardless of VITE_ prefix. In CI
  // there is no .env, so fall back to process.env — that's how the GitHub
  // Actions workflow injects SPOTIFY_CLIENT_ID / SPOTIFY_REDIRECT_URI at
  // build time. Without this fallback, vite bakes "" into the bundle and
  // the client hits Spotify with `client_id=` (empty), which Spotify
  // rejects as "client_id: Not present".
  const env = loadEnv(mode, process.cwd(), '');
  const processEnvDefines = Object.fromEntries(
    CLIENT_ENV_KEYS.map((key) => [
      `process.env.${key}`,
      JSON.stringify(env[key] ?? process.env[key] ?? ''),
    ])
  );
  processEnvDefines['process.env.NODE_ENV'] = JSON.stringify(mode);

  return {
    plugins: [react(), tailwindcss(), serveRuntimePlugin],
    define: processEnvDefines,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './client'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: false,
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          ws: true,
          changeOrigin: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      // Don't duplicate public/ (audio/avatars/station covers, ~190 MB) into dist/.
      // The Express server mounts both dist/ and public/ separately at runtime.
      copyPublicDir: false,
    },
    publicDir: 'public',
    // The react-spotify-web-playback CJS wrapper needs to be pre-bundled
    // so its `require()` calls are resolved at dev time.
    optimizeDeps: {
      include: ['react-spotify-web-playback'],
    },
  };
});
