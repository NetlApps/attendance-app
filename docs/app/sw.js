/* Service worker для офлайн-работы и уведомлений. */
const CACHE_NAME = 'attendance-app-v2';
const scope = self.registration.scope;
const shell = [
  scope,
  new URL('index.html', scope).href,
  new URL('manifest.webmanifest', scope).href,
  new URL('favicon.svg', scope).href,
  new URL('icons/icon-192.png', scope).href,
  new URL('icons/icon-512.png', scope).href,
  new URL('icons/apple-touch-icon.png', scope).href,
];

/** Собирает ссылки на ресурсы из HTML, чтобы закэшировать JS/CSS со сборки. */
function collectAssetUrls(html) {
  const urls = new Set();
  const regex = /(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], scope).href;
      if (url.startsWith(scope)) urls.add(url);
    } catch {
      /* некорректная ссылка — пропускаем */
    }
  }
  return [...urls].filter(
    (url) =>
      url.includes('/assets/') ||
      /\.(?:css|js|mjs|png|svg|webp|woff2?)(?:$|\?)/.test(url),
  );
}

/** Кладёт в кэш все ресурсы; ошибки отдельных файлов не срывают установку. */
async function cacheUrls(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) await cache.put(url, response);
      } catch {
        /* офлайн или файл недоступен — пропускаем */
      }
    }),
  );
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(shell);
  try {
    const response = await fetch(new URL('index.html', scope).href, { cache: 'no-store' });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put(new URL('index.html', scope).href, response);
    await cacheUrls(cache, collectAssetUrls(html));
  } catch {
    /* сеть недоступна — остаётся базовая оболочка */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const forCache = response.clone();
            const forText = response.clone();
            caches.open(CACHE_NAME).then(async (cache) => {
              await cache.put(request, forCache);
              try {
                const html = await forText.text();
                await cacheUrls(cache, collectAssetUrls(html));
              } catch {
                /* не удалось обновить ресурсы — не критично */
              }
            });
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(scope)) ||
            (await caches.match(new URL('index.html', scope).href))
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
