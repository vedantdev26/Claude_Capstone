'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MethodNotAllowedError } = require('./errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Fixed URL -> file allow-list: request paths are never joined to a directory.
const ASSETS = [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
];

function loadStaticAssets(dir = PUBLIC_DIR) {
  const assets = new Map();
  for (const [urlPath, file, contentType] of ASSETS) {
    const body = fs.readFileSync(path.join(dir, file));
    assets.set(urlPath, {
      body,
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
      },
    });
  }
  return assets;
}

function sendAsset(req, res, asset) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new MethodNotAllowedError();
  res.writeHead(200, asset.headers);
  res.end(req.method === 'HEAD' ? undefined : asset.body);
}

module.exports = { loadStaticAssets, sendAsset };
