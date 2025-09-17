const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require("cors");

const app = express();

// Direct configuration - no .env dependency
const CONFIG = {
  PORT: process.env.PORT || 4000,
  BACKEND_URL: process.env.BACKEND_URL || 'https://fileupload-backend-34ev.onrender.com',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

console.log('🔧 Configuration:');
console.log('PORT:', CONFIG.PORT);
console.log('BACKEND_URL:', CONFIG.BACKEND_URL);
console.log('NODE_ENV:', CONFIG.NODE_ENV);

// Validate configuration
if (!CONFIG.BACKEND_URL) {
  console.error('❌ BACKEND_URL is not configured');
  process.exit(1);
}

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://fileupload-app.netlify.app',
      'https://file-upload-gateway-1-1moy.onrender.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4000'
    ];

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalizedOrigin) || CONFIG.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', normalizedOrigin);
      callback(null, true); // Allow for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-forwarded-host', 'x-forwarded-proto']
};

// Add explicit OPTIONS handling for preflight requests
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Request logging with more details
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  console.log('Headers:', {
    host: req.get('host'),
    origin: req.get('origin'),
    'content-type': req.get('content-type'),
    'user-agent': req.get('user-agent'),
    'referer': req.get('referer')
  });
  
  // Add CORS headers manually as backup
  res.header('Access-Control-Allow-Origin', req.get('origin') || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-forwarded-host, x-forwarded-proto, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    console.log('🔄 Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  next();
});

// Health endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'API Gateway is running',
    backend_url: CONFIG.BACKEND_URL,
    environment: CONFIG.NODE_ENV,
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    backend_url: CONFIG.BACKEND_URL,
    environment: CONFIG.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Test backend connectivity
app.get('/test-backend', async (req, res) => {
  try {
    // Use built-in fetch for Node.js 18+, or import node-fetch for older versions
    const response = await fetch(`${CONFIG.BACKEND_URL}/health`);
    const data = await response.text();
    
    res.json({
      backend_status: response.status,
      backend_response: data,
      backend_url: CONFIG.BACKEND_URL,
      backend_ok: response.ok
    });
  } catch (error) {
    console.error('❌ Backend test failed:', error);
    res.status(500).json({
      error: 'Backend unreachable',
      message: error.message,
      backend_url: CONFIG.BACKEND_URL
    });
  }
});

// Create proxy configuration
const proxyOptions = {
  target: CONFIG.BACKEND_URL,
  changeOrigin: true,
  timeout: 60000,
  secure: true,
  followRedirects: true,
  pathRewrite: {
    '^/api': '/api' // Keep /api prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    const host = req.get('host');
    proxyReq.setHeader('x-forwarded-host', host);
    proxyReq.setHeader('x-forwarded-proto', req.protocol);
    proxyReq.setHeader('x-original-host', host);
    proxyReq.setHeader('x-gateway-request', 'true');
    
    console.log(`🔄 Proxying: ${req.method} ${req.originalUrl}`);
    console.log(`🎯 Target: ${CONFIG.BACKEND_URL}${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ Response: ${proxyRes.statusCode} for ${req.originalUrl}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy error for ${req.originalUrl}:`, err.message);
    console.error(`Backend URL: ${CONFIG.BACKEND_URL}`);
    
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend service unavailable',
        backend_url: CONFIG.BACKEND_URL,
        details: CONFIG.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
};

console.log('✅ Creating proxy with target:', CONFIG.BACKEND_URL);

// Create proxy middleware
const apiProxy = createProxyMiddleware('/api', proxyOptions);

// Apply proxy to all /api routes
app.use('/api', (req, res, next) => {
  console.log(`📡 API route hit: ${req.method} ${req.originalUrl}`);
  apiProxy(req, res, next);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: CONFIG.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`🚀 API Gateway running on port ${CONFIG.PORT}`);
  console.log(`📡 Proxying to backend: ${CONFIG.BACKEND_URL}`);
  console.log(`🌍 Environment: ${CONFIG.NODE_ENV}`);
  console.log('Available routes:');
  console.log(`  GET  / (health check)`);
  console.log(`  GET  /health`);
  console.log(`  GET  /test-backend (test backend connectivity)`);
  console.log(`  POST /api/upload`);
  console.log(`  POST /api/verify/:id`);
  console.log(`  GET  /api/download/:id`);
});