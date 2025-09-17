require('dotenv').config()
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const cors = require("cors");

// Environment configuration
const PORT = process.env.PORT || 4000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://192.168.0.103:3000';
const FRONTEND_URL = process.env.FRONTEND_URL 
const NODE_ENV = process.env.NODE_ENV || 'development';
// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow no-origin requests

    // normalize trailing slashes
    const normalizedOrigin = origin.replace(/\/$/, '');
    const allowedOrigins = [
      BACKEND_URL,
      FRONTEND_URL,
      'http://192.168.0.103:3001',
      'https://fileupload-app.netlify.app/',
      'https://file-upload-gateway-1-1moy.onrender.com'
    ];

    if (allowedOrigins.includes(normalizedOrigin) || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', normalizedOrigin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-forwarded-host', 'x-forwarded-proto']
};


app.use(cors(corsOptions));

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  console.log('Headers:', {
    host: req.get('host'),
    origin: req.get('origin'),
    'user-agent': req.get('user-agent')
  });
  next();
});

// Create proxy middleware with proper error handling
const createProxy = (routeName) => createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  timeout: 30000, // 30 second timeout
  pathRewrite: {
    '^/api': '', // Remove /api prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    // Set headers to let backend know it's coming through gateway
    const host = req.get('host');
    proxyReq.setHeader('x-forwarded-host', host);
    proxyReq.setHeader('x-forwarded-proto', req.protocol);
    proxyReq.setHeader('x-original-host', host);
    proxyReq.setHeader('x-gateway-request', 'true');
    
    console.log(`🔄 [${routeName}] Proxying: ${req.method} ${req.originalUrl} → ${BACKEND_URL}${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ [${routeName}] Response: ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ [${routeName}] Proxy error:`, err.message);
    console.error(`Backend URL: ${BACKEND_URL}`);
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

app.get('/', (req, res) => {
  res.send('API Gateway is up and running');
});


app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    backend_url: BACKEND_URL,
    environment: NODE_ENV
  });
});


// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📡 Proxying to backend: ${BACKEND_URL}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log('Available routes:');
  console.log(`  POST /api/upload`);
  console.log(`  POST /api/download/:id`);
});