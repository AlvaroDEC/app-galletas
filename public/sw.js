// Service worker mínimo, a propósito.
//
// Su único trabajo es que la app abra aunque el internet esté lento o caído.
// NO guarda datos ni intenta sincronizar ventas offline: eso requiere resolver
// conflictos entre dispositivos y quedó fuera de esta primera versión.
//
// Estrategia: la red manda siempre; el caché es la red de contención.

const CACHE = 'galletas-v2'
const BASE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request
  if (pedido.method !== 'GET') return

  const url = new URL(pedido.url)
  // Nunca cachear las llamadas a Supabase: los datos siempre se piden frescos.
  if (url.origin !== self.location.origin) return

  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone()
          void caches.open(CACHE).then((c) => c.put(pedido, copia))
        }
        return respuesta
      })
      .catch(async () => {
        const guardada = await caches.match(pedido)
        if (guardada) return guardada
        if (pedido.mode === 'navigate') {
          const inicio = await caches.match('/index.html')
          if (inicio) return inicio
        }
        return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' })
      }),
  )
})
