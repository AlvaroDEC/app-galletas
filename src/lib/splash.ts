/**
 * Retira la pantalla de inicio que está escrita en index.html.
 *
 * Regla de diseño: la pantalla de inicio NO agrega espera. Se muestra mientras
 * la app carga sus datos, que es tiempo que ya existía. Lo único que agrega es
 * un mínimo de visibilidad, para que en una carga instantánea no aparezca y
 * desaparezca de golpe — un parpadeo se lee como un error, no como marca.
 */

const MINIMO_VISIBLE = 250
const FUNDIDO = 200

let yaSeFue = false

export function ocultarSplash(): void {
  if (yaSeFue) return
  yaSeFue = true

  const el = document.getElementById('splash')
  if (!el) return

  const desde = (window as { __splashDesde?: number }).__splashDesde ?? Date.now()
  const restante = Math.max(0, MINIMO_VISIBLE - (Date.now() - desde))

  window.setTimeout(() => {
    el.classList.add('fuera')
    window.setTimeout(() => el.remove(), FUNDIDO)
  }, restante)
}
