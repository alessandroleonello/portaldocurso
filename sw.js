const CACHE_NAME = 'portal-do-curso-v17';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './src/services/firebase-service.js',
  './src/services/storage-service.js',
  './src/services/pdf-service.js',
  './src/services/jspdf.umd.min.js',
  './src/services/jspdf.plugin.autotable.min.js',
  './src/services/html2canvas.min.js',
  './src/modules/notices.js',
  './src/modules/documents.js',
  './src/modules/lessons.js',
  './src/modules/student.js',
  './src/modules/financial.js',
  './src/modules/grades.js',
  './src/modules/users.js',
  './src/modules/academicReports.js',
  './src/modules/notifications.js',
  './src/modules/academicCalendar.js',
  './img/logo.png',
  './img/academic-hero.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png',
  './img/apple-touch-icon.png',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Cache parcial instalado:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ignorar requisições não-GET e requisições do Firebase/Firestore em tempo real
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin.includes('firestore.googleapis.com') || url.origin.includes('firebase')) return;

  // Estratégia Network-First: busca da rede primeiro para código sempre atualizado, fallback para cache se offline
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
