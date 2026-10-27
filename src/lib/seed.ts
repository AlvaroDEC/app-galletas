import type { DB, Insumo, Presentacion, Receta } from './types'
import { opProduccion, opStockInicial, opVenta } from './ops'

// Datos con los que arranca la app.
//
// Las cuatro variedades y el precio de 15 Bs salen del menú real de Duna.
// Las recetas son una reconstrucción razonable de galletas rellenas estilo
// NYC de unos 130 g: sirven para que la app calcule desde el primer minuto,
// pero HAY QUE REEMPLAZARLAS por las recetas verdaderas del negocio, pesando
// los ingredientes una vez. Lo mismo con los precios de los insumos, que son
// referenciales de plaza en Santa Cruz.

function fechaHace(dias: number, hora = 10): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(hora, 0, 0, 0)
  return d.toISOString()
}

function fechaEn(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

type DefInsumo = [
  id: string,
  nombre: string,
  categoria: Insumo['categoria'],
  unidad: Insumo['unidad'],
  presentacion: string,
  contenido: number,
  precio: number,
  stockMinimo: number,
  stockInicial: number,
]

// id, nombre, categoría, unidad, presentación de compra, contenido, Bs, mínimo, stock inicial
const INSUMOS: DefInsumo[] = [
  ['harina', 'Harina de trigo', 'seco', 'g', 'Bolsa 1 kg', 1000, 7, 2000, 6000],
  ['azucar', 'Azúcar granulada', 'seco', 'g', 'Bolsa 1 kg', 1000, 6, 1500, 3000],
  ['azucar_morena', 'Azúcar morena', 'seco', 'g', 'Bolsa 1 kg', 1000, 9, 1500, 3000],
  ['azucar_impalpable', 'Azúcar impalpable', 'seco', 'g', 'Bolsa 500 g', 500, 10, 250, 500],
  ['mantequilla', 'Mantequilla', 'perecedero', 'g', 'Barra 200 g', 200, 16, 1000, 3000],
  ['huevo', 'Huevos', 'perecedero', 'u', 'Maple 30 u', 30, 30, 12, 30],
  ['chips_leche', 'Chispas de chocolate de leche', 'seco', 'g', 'Bolsa 1 kg', 1000, 55, 500, 1000],
  ['choco_semi', 'Chocolate semiamargo', 'seco', 'g', 'Barra 250 g', 250, 35, 250, 750],
  ['choco_blanco', 'Chocolate blanco', 'seco', 'g', 'Barra 250 g', 250, 32, 250, 250],
  ['cocoa', 'Cocoa en polvo', 'seco', 'g', 'Bolsa 500 g', 500, 48, 500, 1000],
  ['oreo', 'Galletas Oreo', 'seco', 'g', 'Paquete 117 g', 117, 7, 234, 585],
  ['queso_crema', 'Queso crema', 'perecedero', 'g', 'Pote 290 g', 290, 30, 290, 580],
  ['leche_polvo', 'Leche en polvo', 'seco', 'g', 'Bolsa 400 g', 400, 35, 400, 800],
  ['leche_cond', 'Leche condensada', 'humedo', 'g', 'Lata 397 g', 397, 16, 397, 1191],
  ['vainilla', 'Esencia de vainilla', 'humedo', 'ml', 'Frasco 100 ml', 100, 12, 30, 100],
  ['polvo_hornear', 'Polvo de hornear', 'seco', 'g', 'Sobre 100 g', 100, 8, 50, 200],
  ['bicarbonato', 'Bicarbonato', 'seco', 'g', 'Sobre 100 g', 100, 6, 30, 100],
  ['sal', 'Sal', 'seco', 'g', 'Bolsa 1 kg', 1000, 5, 200, 1000],
  ['bolsita', 'Bolsita de celofán', 'empaque', 'u', 'Paquete 100 u', 100, 25, 50, 100],
  ['etiqueta', 'Etiqueta adhesiva', 'empaque', 'u', 'Rollo 100 u', 100, 30, 50, 100],
  ['caja_4', 'Caja para 4', 'empaque', 'u', 'Paquete 25 u', 25, 90, 10, 25],
  ['caja_6', 'Caja para 6', 'empaque', 'u', 'Paquete 25 u', 25, 112, 10, 25],
]

const VENCIMIENTOS: Record<string, string> = {
  mantequilla: fechaEn(5),
  huevo: fechaEn(11),
  queso_crema: fechaEn(9),
}

type DefReceta = [
  id: string,
  nombre: string,
  emoji: string,
  rinde: number,
  items: [string, number][],
  notas: string,
]

// Cantidades para UN lote, en la unidad base de cada insumo.
// Cada lote está calculado para 12 galletas grandes de unos 130 g.
const RECETAS: DefReceta[] = [
  [
    'clasica',
    'Clásica',
    '🍪',
    12,
    [
      ['harina', 500],
      ['mantequilla', 250],
      ['azucar_morena', 200],
      ['azucar', 130],
      ['huevo', 2],
      ['chips_leche', 180],
      ['choco_semi', 180],
      ['vainilla', 5],
      ['polvo_hornear', 6],
      ['bicarbonato', 4],
      ['sal', 4],
    ],
    'Masa clásica con chispas de chocolate de leche y semiamargo. Mantequilla a temperatura ambiente, masa fría 30 min antes de bolear. Horno 180 °C, 12 a 14 minutos.',
  ],
  [
    'black_velvet',
    'Black Velvet Cream',
    '🖤',
    12,
    [
      ['harina', 400],
      ['cocoa', 90],
      ['mantequilla', 230],
      ['azucar_morena', 200],
      ['azucar', 130],
      ['huevo', 2],
      ['oreo', 150],
      ['queso_crema', 240],
      ['azucar_impalpable', 60],
      ['choco_blanco', 80],
      ['vainilla', 5],
      ['polvo_hornear', 5],
      ['sal', 3],
    ],
    'Masa de cocoa oscura estilo brownie con oreo y relleno de queso crema. El relleno se congela en porciones de 20 g antes de rellenar. Horno 180 °C, 11 a 13 minutos. Terminar con hilo de chocolate blanco.',
  ],
  [
    'choco_boom',
    'Choco Boom',
    '💥',
    12,
    [
      ['harina', 400],
      ['cocoa', 120],
      ['mantequilla', 260],
      ['azucar_morena', 200],
      ['azucar', 130],
      ['huevo', 2],
      ['oreo', 150],
      ['leche_cond', 397],
      ['choco_semi', 100],
      ['polvo_hornear', 5],
      ['sal', 3],
    ],
    'Masa de cocoa oscura estilo brownie con oreo y relleno de brigadeiro clásico. Una lata entera de leche condensada por lote para el brigadeiro. Enfriar el relleno antes de armar. Horno 180 °C, 11 a 13 minutos.',
  ],
  [
    'leche_crumble',
    'Leche Crumble',
    '🤍',
    12,
    [
      ['harina', 500],
      ['mantequilla', 280],
      ['azucar_morena', 180],
      ['azucar', 130],
      ['huevo', 2],
      ['leche_polvo', 220],
      ['leche_cond', 200],
      ['azucar_impalpable', 60],
      ['vainilla', 5],
      ['polvo_hornear', 6],
      ['sal', 4],
    ],
    'Masa clásica con corazón cremoso de leche en polvo y crumble de leche por encima. Del total de leche en polvo, unos 150 g van al corazón y 70 g al crumble. Horno 175 °C, 13 a 15 minutos.',
  ],
]

// Precios de venta por presentación, en Bs. recetaId -> [unidad, caja de 4, caja de 6]
// El precio por unidad sale del menú de Duna: 15 Bs las cuatro variedades.
const PRECIOS: Record<string, [number, number, number]> = {
  clasica: [15, 58, 85],
  black_velvet: [15, 58, 85],
  choco_boom: [15, 58, 85],
  leche_crumble: [15, 58, 85],
}

export const EMPAQUE_UNIDAD = [
  { insumoId: 'bolsita', cantidad: 1 },
  { insumoId: 'etiqueta', cantidad: 1 },
]
export const EMPAQUE_CAJA_4 = [
  { insumoId: 'caja_4', cantidad: 1 },
  { insumoId: 'etiqueta', cantidad: 1 },
]
export const EMPAQUE_CAJA_6 = [
  { insumoId: 'caja_6', cantidad: 1 },
  { insumoId: 'etiqueta', cantidad: 1 },
]

function construirBase(): DB {
  const insumos: Insumo[] = INSUMOS.map(
    ([idI, nombre, categoria, unidad, presentacion, contenido, precio, stockMinimo]) => ({
      id: idI,
      nombre,
      categoria,
      unidad,
      presentacion,
      contenido,
      precio,
      stockMinimo,
      perecedero: categoria === 'perecedero',
      venceEl: VENCIMIENTOS[idI] ?? null,
      activo: true,
    }),
  )

  const recetas: Receta[] = RECETAS.map(([idR, nombre, emoji, rinde, items, notas]) => ({
    id: idR,
    nombre,
    emoji,
    tipo: 'galleta',
    rinde,
    items: items.map(([insumoId, cantidad]) => ({ insumoId, cantidad })),
    notas,
    activo: true,
  }))

  const presentaciones: Presentacion[] = []
  for (const r of recetas) {
    const [pu, p4, p6] = PRECIOS[r.id] ?? [15, 58, 85]
    presentaciones.push(
      {
        id: `${r.id}_u`,
        recetaId: r.id,
        nombre: 'Unidad',
        unidades: 1,
        precio: pu,
        empaque: [...EMPAQUE_UNIDAD],
      },
      {
        id: `${r.id}_4`,
        recetaId: r.id,
        nombre: 'Caja de 4',
        unidades: 4,
        precio: p4,
        empaque: [...EMPAQUE_CAJA_4],
      },
      {
        id: `${r.id}_6`,
        recetaId: r.id,
        nombre: 'Caja de 6',
        unidades: 6,
        precio: p6,
        empaque: [...EMPAQUE_CAJA_6],
      },
    )
  }

  return {
    insumos,
    recetas,
    presentaciones,
    movimientos: [],
    producciones: [],
    ventas: [],
    compras: [],
    conteos: [],
    pedidos: [],
    config: { negocio: 'Galletas Artesanales DUNA', margenObjetivo: 0.55 },
  }
}

/** DB limpia: recetas e insumos cargados, stock en cero, sin historial. */
export function dbVacia(): DB {
  return construirBase()
}

/** DB con stock inicial propuesto pero sin historial de producción ni ventas. */
export function dbSoloStock(): DB {
  const db = construirBase()
  const fecha = fechaHace(14)
  for (const [idI, , , , , , , , stockInicial] of INSUMOS) {
    if (stockInicial > 0) {
      db.movimientos.push(opStockInicial('insumo', idI, stockInicial, fecha))
    }
  }
  return db
}

/**
 * DB de demostración: el stock inicial más dos semanas de producción y ventas,
 * para que las pantallas de reportes y de costos muestren algo desde el primer
 * momento. Se borra de un botón en Ajustes.
 */
export function dbDemo(): DB {
  const db = dbSoloStock()

  const producir = (
    dias: number,
    recetaId: string,
    lotes: number,
    producido: number,
    merma: number,
    nota = '',
  ) => {
    const receta = db.recetas.find((r) => r.id === recetaId)
    if (!receta) return
    const { produccion, movimientos } = opProduccion(db, {
      recetaId,
      lotes,
      consumos: receta.items.map((it) => ({
        insumoId: it.insumoId as string,
        teorico: it.cantidad * lotes,
        real: it.cantidad * lotes,
      })),
      producido,
      merma,
      nota,
      fecha: fechaHace(dias, 9),
    })
    db.producciones.push(produccion)
    db.movimientos.push(...movimientos)
  }

  const vender = (
    dias: number,
    canal: 'feria' | 'whatsapp' | 'delivery' | 'local',
    medioPago: 'qr' | 'efectivo',
    lineas: [recetaId: string, sufijo: 'u' | '4' | '6', cantidad: number][],
  ) => {
    const items = lineas.map(([recetaId, sufijo, cantidad]) => {
      const pres = db.presentaciones.find((p) => p.id === `${recetaId}_${sufijo}`)!
      return {
        recetaId,
        presentacionId: pres.id,
        cantidad,
        precioUnit: pres.precio,
        unidades: pres.unidades * cantidad,
      }
    })
    const { venta, movimientos } = opVenta(db, {
      items,
      canal,
      medioPago,
      descuento: 0,
      fecha: fechaHace(dias, 16),
    })
    db.ventas.push(venta)
    db.movimientos.push(...movimientos)
  }

  producir(12, 'clasica', 2, 23, 1, 'Una se abrió en el horno')
  vender(10, 'feria', 'qr', [
    ['clasica', '6', 2],
    ['clasica', 'u', 4],
  ])
  producir(8, 'black_velvet', 1, 12, 0)
  vender(7, 'whatsapp', 'qr', [['black_velvet', '4', 2]])
  producir(4, 'leche_crumble', 1.5, 17, 1)
  vender(3, 'delivery', 'qr', [
    ['leche_crumble', '6', 1],
    ['leche_crumble', 'u', 3],
  ])
  producir(2, 'choco_boom', 1, 11, 1, 'El relleno se salió de una')
  vender(1, 'feria', 'efectivo', [
    ['choco_boom', '4', 1],
    ['choco_boom', 'u', 2],
  ])
  vender(0, 'whatsapp', 'efectivo', [['clasica', 'u', 3]])

  return db
}
