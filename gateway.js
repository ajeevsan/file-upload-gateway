const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require("cors");

const app = express();

// Hardcoded configuration to avoid any env variable issues
const BACKEND_URL = 'https://fileupload-backend-34ev.onrender.com';
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🔧 Configuration:');
console.log('PORT:', PORT);
console.log('BACKEND_URL:', BACKEND_URL);
console.log('NODE_ENV:', NODE_ENV);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🔍 CORS check for origin:', origin);
    
    if (!origin) {
      console.log('✅ No origin - allowing');
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'https://fileupload-app.netlify.app',
      'https://file-upload-gateway-flna.onrender.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4000'
    ];

    const normalizedOrigin = origin.replace(/\/$/, '');
    
    if (allowedOrigins.includes(normalizedOrigin) || NODE_ENV === 'development') {
      console.log('✅ Origin allowed:', normalizedOrigin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', normalizedOrigin);
      callback(null, true); // Allow for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-forwarded-host', 
    'x-forwarded-proto',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Manual CORS headers as backup
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  console.log('Origin:', req.get('origin'));
  
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
    backend_url: BACKEND_URL,
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    backend_url: BACKEND_URL,
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Test backend connectivity
app.get('/test-backend', async (req, res) => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    const data = await response.text();
    
    res.json({
      backend_status: response.status,
      backend_response: data,
      backend_url: BACKEND_URL,
      backend_ok: response.ok
    });
  } catch (error) {
    console.error('❌ Backend test failed:', error);
    res.status(500).json({
      error: 'Backend unreachable',
      message: error.message,
      backend_url: BACKEND_URL
    });
  }
});

// Alternative approach - create proxy without path filter first
console.log('🔄 Attempting to create proxy middleware...');

try {
  // Method 1: Create proxy without path filter
  const proxyMiddleware = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    timeout: 60000,
    secure: true,
    followRedirects: true,
    pathRewrite: {
      '^/api': '/api'
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`🔄 Proxying: ${req.method} ${req.originalUrl} -> ${BACKEND_URL}${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`✅ Response: ${proxyRes.statusCode} for ${req.originalUrl}`);
    },
    onError: (err, req, res) => {
      console.error(`❌ Proxy error:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Backend service unavailable'
        });
      }
    }
  });

  console.log('✅ Proxy middleware created successfully');

  // Apply proxy to /api routes
  app.use('/api', (req, res, next) => {
    console.log(`📡 API route intercepted: ${req.method} ${req.originalUrl}`);
    proxyMiddleware(req, res, next);
  });

} catch (error) {
  console.error('❌ Failed to create proxy:', error);
  
  // Fallback: Manual proxy implementation
  app.use('/api', async (req, res) => {
    console.log(`📡 Fallback: Manual proxy for ${req.method} ${req.originalUrl}`);
    
    try {
      const targetUrl = `${BACKEND_URL}${req.originalUrl}`;
      console.log(`🎯 Forwarding to: ${targetUrl}`);
      
      const options = {
        method: req.method,
        headers: {
          ...req.headers,
          host: new URL(BACKEND_URL).host
        }
      };
      
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // Handle request body for POST/PUT requests
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          options.body = body;
          
          const response = await fetch(targetUrl, options);
          const responseBody = await response.text();
          
          res.status(response.status);
          response.headers.forEach((value, name) => {
            if (name !== 'content-encoding') { // Avoid double encoding
              res.set(name, value);
            }
          });
          res.send(responseBody);
        });
      } else {
        const response = await fetch(targetUrl, options);
        const responseBody = await response.text();
        
        res.status(response.status);
        response.headers.forEach((value, name) => {
          if (name !== 'content-encoding') {
            res.set(name, value);
          }
        });
        res.send(responseBody);
      }
      
    } catch (error) {
      console.error('❌ Manual proxy error:', error);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend service unavailable'
      });
    }
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📡 Backend URL: ${BACKEND_URL}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log('Available routes:');
  console.log(`  GET  / (health check)`);
  console.log(`  GET  /health`);
  console.log(`  GET  /test-backend`);
  console.log(`  POST /api/upload`);
  console.log(`  POST /api/verify/:id`);
  console.log(`  GET  /api/download/:id`);
});