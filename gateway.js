const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Add logging middleware FIRST
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Simple test routes
app.get('/', (req, res) => {
  res.json({ message: 'Gateway root is working' });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API test route is working' });
});

// Create individual proxy configurations for each route
const createProxy = (routeName) => createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // Remove /api prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔄 [${routeName}] Proxying: ${req.method} ${req.originalUrl} → http://localhost:3000${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ [${routeName}] Response: ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ [${routeName}] Proxy error:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad Gateway', details: err.message, route: routeName });
    }
  }
});

// Apply proxies with explicit route matching
app.post('/api/upload', (req, res, next) => {
  console.log('📤 Upload route matched');
  createProxy('upload')(req, res, next);
});

app.post('/api/download/:id', (req, res, next) => {
  console.log('📥 Download route matched:', req.params.id);
  createProxy('download')(req, res, next);
});

app.get('/api/file/:id', (req, res, next) => {
  console.log('📁 File route matched:', req.params.id);
  createProxy('file')(req, res, next);
});

app.get('/api/health', (req, res, next) => {
  console.log('🏥 Health route matched');
  createProxy('health')(req, res, next);
});



app.listen(4000, () => {
  console.log('Gateway running on port 4000');
  console.log('Available routes:');
  console.log('  GET  http://localhost:4000/');
  console.log('  GET  http://localhost:4000/api/test');
  console.log('  GET  http://localhost:4000/api/health');
  console.log('  POST http://localhost:4000/api/upload');
  console.log('  POST http://localhost:4000/api/download/:id');
  console.log('  GET  http://localhost:4000/api/file/:id');
});