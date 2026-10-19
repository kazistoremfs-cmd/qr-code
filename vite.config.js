import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'requests.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStoredRequests() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading requests.json', e);
  }
  return [];
}

function saveStoredRequests(list) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing requests.json', e);
  }
}

let requestsStore = loadStoredRequests();

function handleApiMiddleware(req, res, next) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  if (!url.pathname.startsWith('/api/requests')) {
    return next();
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === 'GET') {
    res.statusCode = 200;
    return res.end(JSON.stringify(requestsStore));
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const item = JSON.parse(body || '{}');
        if (!item.id) {
          item.id = 'R' + Date.now().toString().slice(-4);
        }
        // Avoid duplicate ID if sent twice
        requestsStore = requestsStore.filter(r => r.id !== item.id);
        requestsStore.unshift(item);
        saveStoredRequests(requestsStore);

        res.statusCode = 201;
        return res.end(JSON.stringify({ success: true, item }));
      } catch (err) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.method === 'PATCH') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const update = JSON.parse(body || '{}');
        const target = requestsStore.find(r => r.id === update.id);
        if (target) {
          if (update.status !== undefined) target.status = update.status;
          if (update.last4Digits !== undefined) target.last4Digits = update.last4Digits;
          saveStoredRequests(requestsStore);
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, item: target }));
        } else {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (id) {
      requestsStore = requestsStore.filter(r => r.id !== id);
      saveStoredRequests(requestsStore);
      res.statusCode = 200;
      return res.end(JSON.stringify({ success: true }));
    }
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Missing id query param' }));
  }

  return next();
}

export default defineConfig({
  plugins: [
    {
      name: 'kazi-store-api-server',
      configureServer(server) {
        server.middlewares.use(handleApiMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(handleApiMiddleware);
      }
    }
  ],
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  preview: {
    port: 3000,
    host: '0.0.0.0'
  }
});
