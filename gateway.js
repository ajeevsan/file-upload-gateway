const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Proxy /api/upload → backend /upload
app.use('/api/upload', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' }, // remove /api prefix
}));

// Proxy /api/download → backend /download
app.use('/api/download', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}));

app.listen(4000, () => console.log('Gateway running on port 4000'));
