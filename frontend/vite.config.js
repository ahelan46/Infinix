import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const smsRedirectPlugin = () => ({
  name: 'sms-direct-redirect',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ? req.url.split('?')[0] : '';
      if (url === '/sms' || url === '/sms/') {
        const bodyText = encodeURIComponent(
          "🚨 AEGIS EMERGENCY EVACUATION NOTICE 🚨\n" +
          "Incident: FIRE active on Ground.\n" +
          "Elevators disabled. Proceed to nearest stairwells S1-S3.\n" +
          "Safe Exit: Ground Floor.\n" +
          "Live Mobile Link: http://10.51.105.70:5173"
        );
        const smsUri = `sms:+917200673492?body=${bodyText}`;
        res.writeHead(302, {
          'Location': smsUri,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end();
        return;
      }
      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), smsRedirectPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})

