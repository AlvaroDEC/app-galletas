import type {
  ConsumoComponenteProduccion,
  DB,
  EstadoProduccion,
  Insumo,
  ItemTipo,
  Movimiento,
  Presentacion,
  Produccion,
  Receta,
  RecetaItem,
  TipoReceta,
  Venta,
} from './types'
import { diasHasta, redondearPrecio } from './units'

// Todo lo que la app "sabe" se calcula acá. Ninguna pantalla hace cuentas
// por su cuenta: si un número aparece en dos lugares, sale de la misma función.

// ---------------------------------------------------------------- stock

export type Stocks = Record<string, number>

export function claveStock(tipo: ItemTipo, itemId: string): string {
  return `${tipo}:${itemId}`
}

/** Suma todos los movimientos y devuelve el stock de cada insumo y cada galleta. */
export function calcularStocks(movimientos: Movimiento[]): Stocks {
  const stocks: Stocks = {}
  for (const m of movimientos) {
    const k = claveStock(m.itemTipo, m.itemId)
    stocks[k] = (stocks[k] ?? 0) + m.cantidad
  }
  return stocks
}

export function stockDe(stocks: Stocks, tipo: ItemTipo, itemId: string): number {
  return stocks[claveStock(tipo, itemId)] ?? 0
}

export type EstadoStock = 'agotado' | 'bajo' | 'ok'

export function estadoInsumo(insumo: Insumo, stock: number): EstadoStock {
  if (stock <= 0) return 'agotado'
  if (stock < insumo.stockMinimo) return 'bajo'
  return 'ok'
}

// -------------------------------------------------------------- recetas

/** Una receta sin `tipo` viene de un respaldo viejo: era toda una galleta. */
export function tipoReceta(r: Receta): TipoReceta {
  return r.tipo ?? 'galleta'
}

/** Lo que se puede vender: recetas activas de galleta. */
export function esVendible(r: Receta): boolean {
  return r.activo && tipoReceta(r) === 'galleta'
}

/** Lo que la mayoría de las funciones necesita para expandir: insumos + recetas. */
export type Catalogo = Pick<DB, 'insumos' | 'recetas'>

export interface GrupoProduccion {
  tipo: TipoReceta
  /** Nombre de la receta del componente (o de la receta misma para insumos directos). */
  nombre: string
  recetaId: string
  /** Lotes del componente dentro de este lote del padre. Para insumos directos = lotes del padre. */
  lotes: number
  costo: number
  /** Insumos ya expandidos (los sub-componentes se aplanan). */
  insumos: DesgloseCosto[]
}

export interface ExpansionReceta {
  /** insumoId -> cantidad total (ya multiplicada por lotes), para stock y costos. */
  porInsumo: Map<string, number>
  /** Agrupado por componente para la pantalla de Producir. */
  grupos: GrupoProduccion[]
}

/** Orden en que se muestran los grupos en la pantalla de Producir. */
const RANKING_TIPO: Record<TipoReceta, number> = {
  masa: 1,
  relleno: 2,
  extra: 3,
  topping: 4,
  galleta: 5,
}

/**
 * Convierte un mapa insumoId -> cantidad en el desglose que usa el resto de la
 * app: con nombre, unidad y costo, ordenado del más caro al más barato.
 */
function desgloseDesdeMap(porInsumo: Map<string, number>, insumos: Insumo[]): DesgloseCosto[] {
  const porId = new Map(insumos.map((i) => [i.id, i]))
  return [...porInsumo.entries()]
    .map(([insumoId, cantidad]) => {
      const insumo = porId.get(insumoId)
      if (!insumo) return null
      return {
        insumoId: insumo.id,
        nombre: insumo.nombre,
        cantidad,
        unidad: insumo.unidad,
        costo: cantidad * costoUnitario(insumo),
      }
    })
    .filter((x): x is DesgloseCosto => x !== null)
    .sort((a, b) => b.costo - a.costo)
}

/**
 * Expande una receta (y sus componentes) hasta los insumos sueltos. Devuelve
 * la cantidad total por insumo para stock y costos, y los grupos de producción
 * para la pantalla de Producir.
 */
export function expandirReceta(receta: Receta, lotes: number, catalogo: Catalogo): ExpansionReceta {
  const recetas = new Map(catalogo.recetas.map((r) => [r.id, r]))
  const porInsumo = new Map<string, number>()
  const grupos: GrupoProduccion[] = []
  // La receta base no puede reaparecer dentro de su propia expansión: los
  // ciclos se cortan acá y con el límite de profundidad de abajo.
  const visitando = new Set<string>([receta.id])

  /** Suma una cantidad de insumo al total expandido. */
  function sumar(insumoId: string, cantidad: number): void {
    porInsumo.set(insumoId, (porInsumo.get(insumoId) ?? 0) + cantidad)
  }

  /**
   * Expande los items de una receta como componente: suma lo que consume a
   * `porInsumo` y devuelve sus insumos aplanados (los sub-componentes quedan
   * escondidos dentro del grupo de este componente).
   */
  function expandirItems(
    recetaId: string,
    items: RecetaItem[],
    escala: number,
    profundidad: number,
  ): DesgloseCosto[] {
    if (profundidad > 8) return []
    if (visitando.has(recetaId)) return []

    visitando.add(recetaId)
    const directos = new Map<string, number>()
    const aplanados: DesgloseCosto[] = []
    for (const it of items) {
      if (it.insumoId !== undefined) {
        const cantidad = it.cantidad * escala
        directos.set(it.insumoId, (directos.get(it.insumoId) ?? 0) + cantidad)
        sumar(it.insumoId, cantidad)
      } else if (it.componenteId !== undefined) {
        const comp = recetas.get(it.componenteId)
        if (comp) {
          aplanados.push(...expandirItems(comp.id, comp.items, it.cantidad * escala, profundidad + 1))
        }
      }
    }
    visitando.delete(recetaId)

    const todos = [...desgloseDesdeMap(directos, catalogo.insumos), ...aplanados]
    return todos.sort((a, b) => b.costo - a.costo)
  }

  // Grupo de la receta base: solo sus insumos directos. Si no tiene (todo lo
  // hace un componente), ese grupo no aparece.
  const baseDirecto = new Map<string, number>()
  for (const it of receta.items) {
    if (it.insumoId !== undefined) {
      const cantidad = it.cantidad * lotes
      baseDirecto.set(it.insumoId, (baseDirecto.get(it.insumoId) ?? 0) + cantidad)
      sumar(it.insumoId, cantidad)
    }
  }
  if (baseDirecto.size > 0) {
    const insumos = desgloseDesdeMap(baseDirecto, catalogo.insumos)
    grupos.push({
      tipo: tipoReceta(receta),
      nombre: receta.nombre,
      recetaId: receta.id,
      lotes,
      costo: insumos.reduce((s, d) => s + d.costo, 0),
      insumos,
    })
  }

  // Un grupo por cada línea de componente, con sus insumos ya aplanados.
  for (const it of receta.items) {
    if (it.componenteId === undefined) continue
    const comp = recetas.get(it.componenteId)
    if (!comp) continue
    const lotesComp = it.cantidad * lotes
    const insumos = expandirItems(comp.id, comp.items, lotesComp, 1)
    grupos.push({
      tipo: tipoReceta(comp),
      nombre: comp.nombre,
      recetaId: comp.id,
      lotes: lotesComp,
      costo: insumos.reduce((s, d) => s + d.costo, 0),
      insumos,
    })
  }

  // Orden fijo por tipo; los de igual tipo conservan el orden de los items.
  // Un tipo desconocido (respaldo viejo) cae al final en vez de romper el orden.
  grupos.sort((a, b) => (RANKING_TIPO[a.tipo] ?? 99) - (RANKING_TIPO[b.tipo] ?? 99))

  return { porInsumo, grupos }
}

// ------------------------------------------------ plan de una producción

function redondear(v: number): number {
  return Math.round(v * 100) / 100
}

export interface GrupoPlan {
  tipo: TipoReceta
  /** Nombre de la receta del componente (o de la receta misma para insumos directos). */
  nombre: string
  recetaId: string
  /** Lotes del componente dentro de este lote del padre. Para insumos directos = lotes del padre. */
  lotes: number
  costo: number
  /** Insumos sueltos que salen en este grupo (el faltante sobre el stock preparado). */
  insumos: DesgloseCosto[]
  /** Lotes del componente que se toman de su stock intermedio, si hubo. */
  desdeStock: number | null
}

export interface PlanProduccion {
  /** insumoId -> cantidad total a descontar de la despensa (solo el faltante). */
  porInsumo: Map<string, number>
  grupos: GrupoPlan[]
  /** Preparaciones ya hechas que se descuentan de su stock intermedio. */
  consumosComponente: ConsumoComponenteProduccion[]
}

/**
 * Plan concreto para liberar una producción. Es como `expandirReceta` pero con
 * una diferencia clave para el flujo real de la cocina: si una galleta usa un
 * componente que ya se preparó (hay stock intermedio de masa, relleno, etc.),
 * primero se consume ese stock y solo el faltante se descuenta de la materia
 * prima. Así preparar la masa por separado no duplica el gasto de ingredientes.
 *
 * Cuando no hay nada preparado (o la receta no es una galleta) el resultado es
 * idéntico a `expandirReceta`: el flujo de siempre queda intacto.
 */
export function planProduccion(
  receta: Receta,
  lotes: number,
  catalogo: Catalogo,
  stocks: Stocks,
): PlanProduccion {
  const recetas = new Map(catalogo.recetas.map((r) => [r.id, r]))
  const esGalleta = tipoReceta(receta) === 'galleta'
  const porInsumo = new Map<string, number>()
  const consumosComponente: ConsumoComponenteProduccion[] = []
  const grupos: GrupoPlan[] = []
  const visitando = new Set<string>([receta.id])

  function sumar(insumoId: string, cantidad: number): void {
    porInsumo.set(insumoId, (porInsumo.get(insumoId) ?? 0) + cantidad)
  }

  function expandirItems(
    recetaId: string,
    items: RecetaItem[],
    escala: number,
    profundidad: number,
  ): DesgloseCosto[] {
    if (profundidad > 8) return []
    if (visitando.has(recetaId)) return []

    visitando.add(recetaId)
    const directos = new Map<string, number>()
    const aplanados: DesgloseCosto[] = []
    for (const it of items) {
      if (it.insumoId !== undefined) {
        const cantidad = it.cantidad * escala
        directos.set(it.insumoId, (directos.get(it.insumoId) ?? 0) + cantidad)
        sumar(it.insumoId, cantidad)
      } else if (it.componenteId !== undefined) {
        const comp = recetas.get(it.componenteId)
        if (comp) {
          aplanados.push(...expandirItems(comp.id, comp.items, it.cantidad * escala, profundidad + 1))
        }
      }
    }
    visitando.delete(recetaId)

    const todos = [...desgloseDesdeMap(directos, catalogo.insumos), ...aplanados]
    return todos.sort((a, b) => b.costo - a.costo)
  }

  // Grupo de la receta base: solo sus insumos directos.
  const baseDirecto = new Map<string, number>()
  for (const it of receta.items) {
    if (it.insumoId !== undefined) {
      const cantidad = it.cantidad * lotes
      baseDirecto.set(it.insumoId, (baseDirecto.get(it.insumoId) ?? 0) + cantidad)
      sumar(it.insumoId, cantidad)
    }
  }
  if (baseDirecto.size > 0) {
    const insumos = desgloseDesdeMap(baseDirecto, catalogo.insumos)
    grupos.push({
      tipo: tipoReceta(receta),
      nombre: receta.nombre,
      recetaId: receta.id,
      lotes,
      costo: insumos.reduce((s, d) => s + d.costo, 0),
      insumos,
      desdeStock: null,
    })
  }

  // Un grupo por cada línea de componente. En las galletas, primero se consume
  // el stock intermedio de ese componente y el faltante se expande a materia prima.
  for (const it of receta.items) {
    if (it.componenteId === undefined) continue
    const comp = recetas.get(it.componenteId)
    if (!comp) continue
    const compNecesarios = it.cantidad * lotes
    let insumos: DesgloseCosto[] = []
    let desdeStock = 0
    if (esGalleta) {
      const disponibles = Math.max(0, stockDe(stocks, 'galleta', comp.id))
      desdeStock = Math.min(redondear(compNecesarios), disponibles)
      const faltante = compNecesarios - desdeStock
      if (desdeStock > 0) consumosComponente.push({ recetaId: comp.id, lotes: desdeStock })
      if (faltante > 0.0001) insumos = expandirItems(comp.id, comp.items, faltante, 1)
    } else {
      insumos = expandirItems(comp.id, comp.items, compNecesarios, 1)
    }
    grupos.push({
      tipo: tipoReceta(comp),
      nombre: comp.nombre,
      recetaId: comp.id,
      lotes: compNecesarios,
      costo: insumos.reduce((s, d) => s + d.costo, 0),
      insumos,
      desdeStock: desdeStock > 0 ? redondear(desdeStock) : null,
    })
  }

  grupos.sort((a, b) => (RANKING_TIPO[a.tipo] ?? 99) - (RANKING_TIPO[b.tipo] ?? 99))

  return { porInsumo, grupos, consumosComponente }
}

// ----------------------------------------------------------- producción

/**
 * Una producción sin `estado` viene de un respaldo anterior a los dos momentos:
 * ya había descontado insumos y sumado galletas, así que está cerrada.
 */
export function estadoProduccion(p: Produccion): EstadoProduccion {
  return p.estado ?? 'cerrada'
}

/** Insumos ya descontados, galletas todavía sin contar. */
export function estaPendiente(p: Produccion): boolean {
  return estadoProduccion(p) === 'pendiente'
}

// ---------------------------------------------------------------- costos

/** Cuánto cuesta UN gramo, UN ml o UNA unidad de este insumo. */
export function costoUnitario(insumo: Insumo): number {
  if (!insumo.contenido) return 0
  return insumo.precio / insumo.contenido
}

export interface DesgloseCosto {
  insumoId: string
  nombre: string
  cantidad: number
  unidad: Insumo['unidad']
  costo: number
}

/** Costo de los ingredientes de un lote, ítem por ítem. */
export function desgloseLote(receta: Receta, catalogo: Catalogo): DesgloseCosto[] {
  return desgloseDesdeMap(expandirReceta(receta, 1, catalogo).porInsumo, catalogo.insumos)
}

export function costoLote(receta: Receta, catalogo: Catalogo): number {
  return desgloseLote(receta, catalogo).reduce((s, d) => s + d.costo, 0)
}

/** Costo de una galleta suelta, sin empaque. */
export function costoGalleta(receta: Receta, catalogo: Catalogo): number {
  if (!receta.rinde) return 0
  return costoLote(receta, catalogo) / receta.rinde
}

export function costoEmpaque(pres: Presentacion, insumos: Insumo[]): number {
  const porId = new Map(insumos.map((i) => [i.id, i]))
  return pres.empaque.reduce((s, e) => {
    const insumo = porId.get(e.insumoId)
    return s + (insumo ? e.cantidad * costoUnitario(insumo) : 0)
  }, 0)
}

/** Costo total de lo que se entrega al cliente: galletas + bolsita + etiqueta. */
export function costoPresentacion(
  pres: Presentacion,
  receta: Receta,
  catalogo: Catalogo,
): number {
  return pres.unidades * costoGalleta(receta, catalogo) + costoEmpaque(pres, catalogo.insumos)
}

/** Cuánto de cada Bs cobrado queda después de pagar ingredientes y empaque. */
export function margen(precio: number, costo: number): number {
  if (precio <= 0) return 0
  return (precio - costo) / precio
}

/** Precio que habría que cobrar para llegar al margen objetivo. */
export function precioSugerido(costo: number, margenObjetivo: number): number {
  const m = Math.min(Math.max(margenObjetivo, 0), 0.95)
  return redondearPrecio(costo / (1 - m))
}

// ---------------------------------------------------- producción posible

export interface Necesidad {
  insumo: Insumo
  necesario: number
  disponible: number
  falta: number
}

/** Qué hace falta para producir esta cantidad de lotes, y cuánto falta de cada cosa. */
export function necesidadPara(
  receta: Receta,
  lotes: number,
  catalogo: Catalogo,
  stocks: Stocks,
): Necesidad[] {
  const porId = new Map(catalogo.insumos.map((i) => [i.id, i]))
  return [...expandirReceta(receta, lotes, catalogo).porInsumo.entries()]
    .map(([insumoId, cantidad]) => {
      const insumo = porId.get(insumoId)
      if (!insumo) return null
      const necesario = cantidad
      const disponible = stockDe(stocks, 'insumo', insumo.id)
      return {
        insumo,
        necesario,
        disponible,
        falta: Math.max(0, necesario - disponible),
      }
    })
    .filter((x): x is Necesidad => x !== null)
}

/**
 * Cuántos lotes enteros se pueden hacer hoy. Cuenta tanto la despensa como las
 * preparaciones ya hechas: si hay masa en el stock intermedio, esa parte no
 * necesita materia prima. Cuando no hay nada preparado, es igual a siempre.
 */
export function lotesPosibles(receta: Receta, catalogo: Catalogo, stocks: Stocks): number {
  const puede = (l: number): boolean => {
    const plan = planProduccion(receta, l, catalogo, stocks)
    for (const [insumoId, cantidad] of plan.porInsumo) {
      if (cantidad <= 0) continue
      if (stockDe(stocks, 'insumo', insumoId) + 1e-9 < cantidad) return false
    }
    return true
  }

  const base = planProduccion(receta, 1, catalogo, stocks)
  if (base.porInsumo.size === 0 && base.consumosComponente.length === 0) return 0
  if (!puede(1)) return 0

  // Dobla hasta encontrar un límite, después bisección (es monotónico: el
  // faltante de materia prima no baja al subir la cantidad de lotes).
  let hi = 1
  while (puede(hi) && hi < 200000) hi *= 2
  let lo = Math.floor(hi / 2)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (puede(mid)) lo = mid
    else hi = mid - 1
  }
  return lo
}

// ---------------------------------------------------------------- alertas

export type Severidad = 'critica' | 'aviso'

export interface Alerta {
  id: string
  severidad: Severidad
  titulo: string
  detalle: string
  ir?: { pantalla: string; foco?: string }
}

export function alertas(db: DB, stocks: Stocks): Alerta[] {
  const out: Alerta[] = []

  for (const insumo of db.insumos.filter((i) => i.activo)) {
    const stock = stockDe(stocks, 'insumo', insumo.id)
    const estado = estadoInsumo(insumo, stock)
    if (estado === 'agotado') {
      out.push({
        id: `ago_${insumo.id}`,
        severidad: 'critica',
        titulo: `${insumo.nombre} se acabó`,
        detalle: 'No queda nada en la despensa. Hay que comprar antes de producir.',
        ir: { pantalla: 'insumos', foco: insumo.id },
      })
    } else if (estado === 'bajo') {
      out.push({
        id: `baj_${insumo.id}`,
        severidad: 'aviso',
        // "Queda poco stock de X" en vez de "Queda poco/poca X": así el texto
        // no depende del género del insumo, que cambia con cada nombre nuevo.
        titulo: `Queda poco stock de ${insumo.nombre.toLowerCase()}`,
        detalle: 'Está por debajo del mínimo que definió.',
        ir: { pantalla: 'insumos', foco: insumo.id },
      })
    }
  }

  for (const insumo of db.insumos.filter((i) => i.activo && i.venceEl)) {
    const dias = diasHasta(insumo.venceEl as string)
    if (dias < 0) {
      out.push({
        id: `ven_${insumo.id}`,
        severidad: 'critica',
        titulo: `${insumo.nombre} está vencido`,
        detalle: `Venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}. Revíselo antes de usarlo.`,
        ir: { pantalla: 'insumos', foco: insumo.id },
      })
    } else if (dias <= 7) {
      out.push({
        id: `ven_${insumo.id}`,
        severidad: 'aviso',
        titulo: `${insumo.nombre} vence pronto`,
        detalle:
          dias === 0
            ? 'Vence hoy. Conviene usarlo en la próxima producción.'
            : `Vence en ${dias} día${dias === 1 ? '' : 's'}. Conviene usarlo primero.`,
        ir: { pantalla: 'insumos', foco: insumo.id },
      })
    }
  }

  // Una producción liberada y nunca completada deja los insumos descontados y
  // las galletas sin entrar: el stock queda corto para siempre si nadie avisa.
  const pendientes = db.producciones.filter(estaPendiente)
  if (pendientes.length > 0) {
    out.push({
      id: 'prd_pendientes',
      severidad: 'aviso',
      titulo:
        pendientes.length === 1
          ? 'Hay una producción sin completar'
          : `Hay ${pendientes.length} producciones sin completar`,
      detalle:
        'Los ingredientes ya se descontaron. Las galletas entran al stock recién cuando registre cuántas salieron.',
      ir: { pantalla: 'producir' },
    })
  }

  return out.sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === 'critica' ? -1 : 1))
}

// ---------------------------------------------------------------- ventas

/**
 * Sirve igual para una `Venta` cerrada y para un `Pedido` todavía abierto: la
 * cuenta es la misma y no puede vivir en dos lugares distintos.
 */
export function totalVenta(v: Pick<Venta, 'items' | 'descuento'>): number {
  return v.items.reduce((s, i) => s + i.cantidad * i.precioUnit, 0) - v.descuento
}

/** Lo que costó producir lo que se vendió, para poder restarlo del ingreso. */
export function costoDeVenta(v: Venta, db: DB): number {
  const recetas = new Map(db.recetas.map((r) => [r.id, r]))
  const pres = new Map(db.presentaciones.map((p) => [p.id, p]))
  return v.items.reduce((s, it) => {
    const r = recetas.get(it.recetaId)
    const p = pres.get(it.presentacionId)
    if (!r || !p) return s
    return s + it.cantidad * costoPresentacion(p, r, db)
  }, 0)
}

export function enRango(iso: string, desde: Date, hasta: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= desde.getTime() && t <= hasta.getTime()
}

export function inicioDelDia(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function finDelDia(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function haceDias(n: number): Date {
  const x = inicioDelDia()
  x.setDate(x.getDate() - n)
  return x
}
