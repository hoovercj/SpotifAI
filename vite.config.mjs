import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Client-side env vars that the old webpack/DotenvWebpack build exposed via
// `process.env.*`. Vite normally only exposes vars prefixed with VITE_, so we
// explicitly forward this allowlist as `process.env.X` (string-literal define)
// to preserve backwards compatibility with the existing .env file.
const CLIENT_ENV_KEYS = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_REDIRECT_URI_DEV',
  'SPOTIFY_REDIRECT_URI_PROD',
];

// In dev: Vite serves the client on :3000 (matches Spotify OAuth redirect URI),
// and proxies API + socket.io traffic to Express on :3001.
// In prod: `vite build` emits to dist/, which Express serves directly.
export default defineConfig(({ mode }) => {
  // loadEnv() reads .env / .env.[mode] regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '');
  const processEnvDefines = Object.fromEntries(
    CLIENT_ENV_KEYS.map((key) => [
      `process.env.${key}`,
      JSON.stringify(env[key] ?? ''),
    ])
  );
  processEnvDefines['process.env.NODE_ENV'] = JSON.stringify(mode);

  return {
    plugins: [react(), tailwindcss()],
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
    },
    publicDir: 'public',
    // The react-spotify-web-playback CJS wrapper needs to be pre-bundled
    // so its `require()` calls are resolved at dev time.
    optimizeDeps: {
      include: ['react-spotify-web-playback'],
    },
  };
});
