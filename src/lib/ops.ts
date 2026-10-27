import type {
  Canal,
  Compra,
  ConsumoComponenteProduccion,
  ConsumoProduccion,
  Conteo,
  DB,
  ItemTipo,
  MedioPago,
  Movimiento,
  Produccion,
  Venta,
  VentaItem,
} from './types'
import { hoyISO, id } from './units'
import { tipoReceta, totalVenta } from './calc'

// Las cuatro operaciones que mueven stock. Cada una devuelve el registro
// que se guarda y los movimientos que genera. Nada mueve stock por fuera de acá.

function mov(
  tipo: Movimiento['tipo'],
  itemTipo: ItemTipo,
  itemId: string,
  cantidad: number,
  refId: string | null,
  fecha: string,
  nota = '',
): Movimiento {
  return { id: id('mov'), fecha, tipo, itemTipo, itemId, cantidad, refId, nota }
}

// ------------------------------------------------------------- compra

export interface EntradaCompra {
  insumoId: string
  /** Cuántas presentaciones: 2 bolsas, 1 maple. */
  cantidad: number
  precioTotal: number
  venceEl?: string | null
  fecha?: string
}

export function opCompra(
  db: DB,
  e: EntradaCompra,
): { compra: Compra; movimientos: Movimiento[] } {
  const insumo = db.insumos.find((i) => i.id === e.insumoId)
  if (!insumo) throw new Error('Ese insumo no existe')
  const fecha = e.fecha ?? hoyISO()
  const compra: Compra = {
    id: id('cmp'),
    fecha,
    insumoId: e.insumoId,
    cantidad: e.cantidad,
    precioTotal: e.precioTotal,
    venceEl: e.venceEl ?? null,
  }
  // La conversión que evita todos los desastres: presentaciones -> unidad base.
  const enUnidadBase = e.cantidad * insumo.contenido
  return {
    compra,
    movimientos: [
      mov(
        'compra',
        'insumo',
        e.insumoId,
        enUnidadBase,
        compra.id,
        fecha,
        `${e.cantidad} × ${insumo.presentacion}`,
      ),
    ],
  }
}

// --------------------------------------------------------- producción

export interface EntradaProduccion {
  recetaId: string
  lotes: number
  /** Consumo real por insumo, ya corregido por la persona al cerrar el lote. */
  consumos: ConsumoProduccion[]
  /** Galletas buenas que salieron. */
  producido: number
  /** Galletas que salieron mal: nunca entran al stock, pero se registran. */
  merma: number
  nota?: string
  fecha?: string
}

/**
 * Producción entera en un solo paso: descuenta insumos y suma galletas a la vez.
 * La usa el generador de datos de ejemplo (`seed.ts`). En la app, producir pasa
 * por `opLiberarProduccion` + `opCerrarProduccion`.
 */
export function opProduccion(
  db: DB,
  e: EntradaProduccion,
): { produccion: Produccion; movimientos: Movimiento[] } {
  const receta = db.recetas.find((r) => r.id === e.recetaId)
  if (!receta) throw new Error('Esa receta no existe')
  const fecha = e.fecha ?? hoyISO()
  const produccion: Produccion = {
    id: id('prd'),
    fecha,
    recetaId: e.recetaId,
    lotes: e.lotes,
    esperado: Math.round(receta.rinde * e.lotes),
    producido: e.producido,
    merma: e.merma,
    nota: e.nota ?? '',
    consumos: e.consumos,
    estado: 'cerrada',
    cerradaEl: fecha,
  }

  const movimientos: Movimiento[] = []
  for (const c of e.consumos) {
    if (c.real <= 0) continue
    movimientos.push(
      mov('consumo', 'insumo', c.insumoId, -c.real, produccion.id, fecha, receta.nombre),
    )
  }
  // Solo las buenas entran al stock. La merma queda en el registro de la
  // producción para poder medirla, pero nunca sumó ni restó del inventario.
  if (e.producido > 0) {
    movimientos.push(
      mov('produccion', 'galleta', e.recetaId, e.producido, produccion.id, fecha),
    )
  }
  return { produccion, movimientos }
}

// --------------------------------------- producción en dos momentos

// En la cocina real, entre meter la masa al horno y contar las galletas que
// salieron pasan horas. Partir la operación en dos evita el descuadre de tener
// que adivinar el resultado antes de tenerlo:
//
//   liberar  — salen los insumos de la despensa. Movimientos 'consumo'.
//   cerrar   — entran las galletas buenas al stock. Movimiento 'produccion'.
//
// Entre las dos, la producción queda 'pendiente' y no aportó ninguna galleta.

export interface EntradaLiberarProduccion {
  recetaId: string
  lotes: number
  /** Consumo real por insumo, ya corregido por la persona antes de amasar. */
  consumos: ConsumoProduccion[]
  /** Preparaciones ya hechas que se usan de su stock intermedio (solo galletas). */
  consumosComponente?: ConsumoComponenteProduccion[]
  nota?: string
  fecha?: string
}

export function opLiberarProduccion(
  db: DB,
  e: EntradaLiberarProduccion,
): { produccion: Produccion; movimientos: Movimiento[] } {
  const receta = db.recetas.find((r) => r.id === e.recetaId)
  if (!receta) throw new Error('Esa receta no existe')
  const fecha = e.fecha ?? hoyISO()
  // Una galleta cuenta su producto en galletas; una preparación (masa, relleno,
  // extra, topping) lo cuenta en lotes, que es lo que después consume la galleta.
  const esGalleta = tipoReceta(receta) === 'galleta'
  const esperado = esGalleta ? Math.round(receta.rinde * e.lotes) : Math.round(e.lotes)
  const produccion: Produccion = {
    id: id('prd'),
    fecha,
    recetaId: e.recetaId,
    lotes: e.lotes,
    esperado,
    // Todavía no salió ningún producto: eso se sabe al cerrar.
    producido: 0,
    merma: 0,
    nota: e.nota ?? '',
    consumos: e.consumos,
    consumosComponente: e.consumosComponente ?? [],
    estado: 'pendiente',
    cerradaEl: null,
  }

  const movimientos: Movimiento[] = []
  for (const c of e.consumos) {
    if (c.real <= 0) continue
    movimientos.push(
      mov('consumo', 'insumo', c.insumoId, -c.real, produccion.id, fecha, receta.nombre),
    )
  }
  // Descontar preparaciones ya hechas de su stock intermedio. Nada de esto
  // vuelve a tocar la materia prima: esa ya salió cuando se preparó el componente.
  for (const c of e.consumosComponente ?? []) {
    if (c.lotes <= 0) continue
    movimientos.push(
      mov('consumo', 'galleta', c.recetaId, -c.lotes, produccion.id, fecha, receta.nombre),
    )
  }
  return { produccion, movimientos }
}

export interface EntradaCerrarProduccion {
  produccionId: string
  /** Galletas buenas que salieron. */
  producido: number
  /** Galletas que salieron mal: nunca entran al stock, pero se registran. */
  merma: number
  nota?: string
  fecha?: string
}

export function opCerrarProduccion(
  db: DB,
  e: EntradaCerrarProduccion,
): { produccion: Produccion; movimientos: Movimiento[] } {
  const previa = db.producciones.find((p) => p.id === e.produccionId)
  if (!previa) throw new Error('Esa producción no existe')
  // Tres personas usan la app al mismo tiempo: cerrar dos veces la misma
  // producción sumaría las galletas dos veces al stock.
  if ((previa.estado ?? 'cerrada') === 'cerrada') {
    throw new Error('Esa producción ya está completada')
  }

  const cerradaEl = e.fecha ?? hoyISO()
  const produccion: Produccion = {
    ...previa,
    producido: e.producido,
    merma: e.merma,
    nota: e.nota ?? previa.nota,
    estado: 'cerrada',
    cerradaEl,
  }

  // Los insumos ya salieron al liberar: cerrar no los vuelve a descontar.
  const movimientos: Movimiento[] = []
  if (e.producido > 0) {
    movimientos.push(
      mov('produccion', 'galleta', previa.recetaId, e.producido, produccion.id, cerradaEl),
    )
  }
  return { produccion, movimientos }
}

// -------------------------------------------------------------- venta

export interface EntradaVenta {
  items: VentaItem[]
  canal: Canal
  medioPago: MedioPago
  descuento: number
  /** A nombre de quién se cobra. Queda en el historial. */
  cliente?: string
  nota?: string
  fecha?: string
}

export function opVenta(db: DB, e: EntradaVenta): { venta: Venta; movimientos: Movimiento[] } {
  const fecha = e.fecha ?? hoyISO()
  const venta: Venta = {
    id: id('vta'),
    fecha,
    canal: e.canal,
    medioPago: e.medioPago,
    items: e.items,
    descuento: e.descuento,
    total: 0,
    nota: e.nota ?? '',
    cliente: e.cliente ?? '',
  }
  venta.total = totalVenta(venta)

  const movimientos: Movimiento[] = []
  const presPorId = new Map(db.presentaciones.map((p) => [p.id, p]))
  for (const it of e.items) {
    if (it.unidades > 0) {
      movimientos.push(mov('venta', 'galleta', it.recetaId, -it.unidades, venta.id, fecha))
    }
    // El empaque también es stock: bolsitas, etiquetas y cajas se acaban.
    const pres = presPorId.get(it.presentacionId)
    if (pres) {
      for (const emp of pres.empaque) {
        const total = emp.cantidad * it.cantidad
        if (total > 0) {
          movimientos.push(
            mov('venta', 'insumo', emp.insumoId, -total, venta.id, fecha, pres.nombre),
          )
        }
      }
    }
  }
  return { venta, movimientos }
}

// ------------------------------------------------------------- conteo

export interface EntradaConteo {
  itemTipo: ItemTipo
  itemId: string
  /** Lo que el sistema creía que había. */
  anterior: number
  /** Lo que se contó de verdad en la despensa. */
  contado: number
  motivo?: string
  fecha?: string
}

export function opConteo(e: EntradaConteo): { conteo: Conteo; movimientos: Movimiento[] } {
  const fecha = e.fecha ?? hoyISO()
  const diferencia = e.contado - e.anterior
  const conteo: Conteo = {
    id: id('cnt'),
    fecha,
    itemTipo: e.itemTipo,
    itemId: e.itemId,
    anterior: e.anterior,
    contado: e.contado,
    diferencia,
    motivo: e.motivo ?? '',
  }
  const movimientos: Movimiento[] =
    diferencia === 0
      ? []
      : [
          mov(
            'ajuste',
            e.itemTipo,
            e.itemId,
            diferencia,
            conteo.id,
            fecha,
            e.motivo ?? 'Conteo físico',
          ),
        ]
  return { conteo, movimientos }
}

// ------------------------------------------------------- stock inicial

export function opStockInicial(
  itemTipo: ItemTipo,
  itemId: string,
  cantidad: number,
  fecha: string,
): Movimiento {
  return mov('inicial', itemTipo, itemId, cantidad, null, fecha, 'Stock inicial')
}
