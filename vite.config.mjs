import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
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
  // App Insights connection string — exposed to the client so the
  // Insights JS SDK can ingest from the browser. Safe to ship (it's
  // designed for client-side usage; the connection string is treated
  // as the ingestion key, not a secret).
  'VITE_APPINSIGHTS_CONNECTION_STRING',
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
    plugins: [
      react(),
      tailwindcss(),
      serveRuntimePlugin,
      VitePWA({
        // Generate /sw.js with workbox. We register it ourselves in
        // client/lib/registerSW.js with a "prompt to refresh" UX
        // instead of skipWaiting — playback shouldn't be cut off
        // mid-song just because a new build went out.
        registerType: 'prompt',
        injectRegister: null,
        strategies: 'generateSW',
        manifest: false, // we ship public/manifest.webmanifest directly
        workbox: {
          // App shell + JS/CSS chunks. Excludes audio + images because
          // those are large, mostly user-specific (Spotify CDN tracks)
          // or already cache-controlled with long max-age.
          globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
          // Don't precache the favicon at the root either — it's
          // already in the HTML <link>.
          globIgnores: ['**/audio/**', '**/images/**', '**/icons/**'],
          // Don't ever try to intercept the API or the Spotify SDK
          // script. They must always hit the network.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/audio\//,
            /^\/socket\.io/,
            /^\/healthz$/,
            /^\/readyz$/,
          ],
          runtimeCaching: [
            {
              // DJ portraits + station covers from /images/. Cache
              // them client-side after first fetch.
              urlPattern: /^\/images\/.*\.(?:png|jpe?g|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // 90d
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
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
