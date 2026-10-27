import type { UnidadBase } from './types'

// La app guarda todo en gramos, mililitros o unidades. Nadie escribe eso.
// Acá vive la traducción entre lo que la persona ve y lo que el sistema calcula.

export const UNIDADES: Record<UnidadBase, string> = { g: 'g', ml: 'ml', u: 'u' }

/** Factores para que la persona pueda escribir en kg, litros o unidades. */
export const ESCALAS: Record<UnidadBase, { label: string; factor: number }[]> = {
  g: [
    { label: 'g', factor: 1 },
    { label: 'kg', factor: 1000 },
  ],
  ml: [
    { label: 'ml', factor: 1 },
    { label: 'l', factor: 1000 },
  ],
  u: [{ label: 'u', factor: 1 }],
}

/** Un número tal como se escribe acá: 0,5 y no 0.5. */
export function num(v: number, decimales = 2): string {
  const r = Math.round(v * 10 ** decimales) / 10 ** decimales
  return r.toLocaleString('es-BO', { maximumFractionDigits: decimales })
}

/**
 * Muestra una cantidad en la escala que se lee mejor.
 * 350 g queda en gramos; 1500 g pasa a 1,5 kg.
 */
export function fmtCantidad(valor: number, unidad: UnidadBase): string {
  if (unidad === 'u') {
    const entero = Math.abs(valor - Math.round(valor)) < 0.001
    return `${num(valor, entero ? 0 : 1)} u`
  }
  const grande = unidad === 'g' ? 'kg' : 'l'
  if (Math.abs(valor) >= 1000) return `${num(valor / 1000, 2)} ${grande}`
  return `${num(valor, valor < 10 ? 1 : 0)} ${unidad}`
}

/** Versión corta para tablas apretadas. */
export function fmtCantidadCorta(valor: number, unidad: UnidadBase): string {
  return fmtCantidad(valor, unidad)
}

/** Bolivianos. Siempre dos decimales, siempre con el símbolo adelante. */
export function bs(valor: number): string {
  const signo = valor < 0 ? '−' : ''
  return `${signo}Bs ${Math.abs(valor).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Para gráficos y totales grandes, sin decimales. */
export function bsCorto(valor: number): string {
  return `Bs ${Math.round(valor).toLocaleString('es-BO')}`
}

export function pct(valor: number): string {
  return `${Math.round(valor * 100)}%`
}

/**
 * Redondea un precio a algo que se pueda cobrar de verdad.
 * En Bolivia la moneda chica es de 0,50, así que redondeamos hacia arriba a eso.
 */
export function redondearPrecio(valor: number): number {
  return Math.ceil(valor * 2) / 2
}

export function hoyISO(): string {
  return new Date().toISOString()
}

export function soloFecha(iso: string): string {
  return iso.slice(0, 10)
}

export function fmtFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })
}

export function fmtFechaLarga(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
}

/** Días que faltan para una fecha. Negativo si ya pasó. */
export function diasHasta(iso: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - hoy.getTime()) / 86400000)
}

/**
 * "1 galleta" / "3 galletas". Sin esto los textos quedan con cosas como
 * "Son 1 galletas", que es lo primero que nota alguien mirando la app.
 */
export function plural(n: number, singular: string, plural_: string): string {
  return `${num(n, 2)} ${n === 1 ? singular : plural_}`
}

export function id(prefijo: string): string {
  return `${prefijo}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}
