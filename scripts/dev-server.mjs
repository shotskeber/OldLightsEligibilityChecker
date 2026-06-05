import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT ?? 4173);

const publicConfig = {
  BUNGIE_CLIENT_ID: process.env.NEXT_PUBLIC_BUNGIE_CLIENT_ID ?? '',
  BUNGIE_API_KEY: process.env.NEXT_PUBLIC_BUNGIE_API_KEY ?? '',
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`,
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === '/config.js') {
      res.writeHead(200, { 'content-type': contentTypes['.js'] });
      res.end(`window.__APP_CONFIG__ = ${JSON.stringify(publicConfig, null, 2)};\n`);
      return;
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(rootDir, 'src', pathname);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      throw new Error('Not a file');
    }

    const body = await readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, { 'content-type': contentTypes[extension] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});
