import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react"; // Temporarily using regular plugin instead of SWC to fix parsing issues
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get backend port from environment or default to 8085
  const backendPort = env.VITE_BACKEND_PORT || '8085';
  const backendTarget = `http://localhost:${backendPort}`;

  return {
    server: {
      host: "::",
      port: 5173,
      strictPort: false, // Allow Vite to use next available port
      hmr: {
        overlay: false, // Disable error overlay as workaround for SWC parsing issues
      },
      proxy: {
        '/api': {
          target: backendTarget,
        changeOrigin: true,
        secure: false,
        // Map frontend /api/* -> backend /api/v1/*
        rewrite: (path) => {
          // /api/auth/login -> /api/v1/auth/login
          const rewritten = path.replace(/^\/api/, '/api/v1');
          return rewritten;
        },
        // Add timeout and error handling
        timeout: 30000,
        // Ensure all headers are forwarded, especially Authorization
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Forward all headers from the original request
            if (req.headers.authorization) {
              proxyReq.setHeader('Authorization', req.headers.authorization);
            }
            // Forward other important headers
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
            if (req.headers['user-agent']) {
              proxyReq.setHeader('User-Agent', req.headers['user-agent']);
            }
          });
          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err);
          });
        }
      }
    }
  },
  plugins: [
    react(),
    // Sentry plugin for source maps and error tracking (only in production builds)
    mode === 'production' && process.env.VITE_SENTRY_AUTH_TOKEN && sentryVitePlugin({
      org: process.env.VITE_SENTRY_ORG,
      project: process.env.VITE_SENTRY_PROJECT,
      authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
      sourcemaps: {
        assets: "./dist/**",
      },
      telemetry: false,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Generate source maps for better error tracking
    sourcemap: true,
  },
}});