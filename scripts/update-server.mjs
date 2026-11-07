import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.cwd(), 'release');
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

if (!existsSync(root)) {
  console.error(`Папка release не найдена: ${root}`);
  console.error('Сначала соберите APK: powershell -ExecutionPolicy Bypass -File .\\android\\build-apk.ps1');
  process.exit(1);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath ?? '/').split('?')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const full = resolve(join(root, relative));
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

const server = createServer((request, response) => {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  let target = safePath(request.url);
  if (!target) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Запрещено');
    return;
  }

  if (existsSync(target) && statSync(target).isDirectory()) {
    target = join(target, 'index.html');
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    response.end('Файл не найден');
    return;
  }

  const stats = statSync(target);
  const extension = extname(target).toLowerCase();
  const headers = {
    'Content-Type': MIME[extension] ?? 'application/octet-stream',
    'Content-Length': stats.size,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control':
      extension === '.json' ? 'no-store' : 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };

  if (method === 'HEAD') {
    response.writeHead(200, headers);
    response.end();
    return;
  }

  response.writeHead(200, headers);
  createReadStream(target).pipe(response);
});

server.listen(port, host, () => {
  console.log(`OTA-сервер запущен: http://localhost:${port}/update.json`);
  console.log(`Папка: ${root}`);
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  for (const address of addresses) {
    console.log(`Для телефона в той же Wi-Fi: http://${address}:${port}/update.json`);
  }
  console.log('Остановить: Ctrl+C');
});
