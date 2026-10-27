// Modelo de datos del sistema.
//
// Regla central: el stock NUNCA se guarda como un número suelto. Se calcula
// sumando movimientos. Así cada unidad que entra o sale queda con su motivo,
// su fecha y su origen — y si algún día los números no cuadran, se puede ver
// exactamente dónde se rompió.

export type UnidadBase = 'g' | 'ml' | 'u'

export type CategoriaInsumo = 'seco' | 'humedo' | 'perecedero' | 'empaque'

export interface Insumo {
  id: string
  nombre: string
  categoria: CategoriaInsumo
  /** Unidad en la que se guarda y se descuenta. Todo vive en g, ml o unidades. */
  unidad: UnidadBase
  /** Cómo se compra de verdad: "Bolsa 1 kg", "Maple 30 u", "Barra 200 g". */
  presentacion: string
  /** Cuánto trae esa presentación, en la unidad base. Bolsa 1 kg -> 1000. */
  contenido: number
  /** Cuánto cuesta esa presentación, en Bs. */
  precio: number
  /** Debajo de esto, la app avisa. En unidad base. */
  stockMinimo: number
  perecedero: boolean
  /** Vencimiento del lote en uso. Control simple: una fecha por insumo. */
  venceEl: string | null
  activo: boolean
}

export type TipoReceta = 'galleta' | 'masa' | 'relleno' | 'extra' | 'topping'

export interface RecetaItem {
  /** Línea de insumo directo. Presente cuando el renglón es un ingrediente. */
  insumoId?: string
  /** Para insumo: cantidad para UN lote en unidad base. Para componente: lotes del componente usados en un lote. */
  cantidad: number
  /** Sub-receta (masa/relleno/extra/topping). Presente cuando el renglón es un componente. */
  componenteId?: string
}

export interface Receta {
  id: string
  nombre: string
  emoji: string
  /** Ausente o 'galleta' en respaldos viejos: se lee con tipoReceta(). */
  tipo?: TipoReceta
  /** Cuántas galletas salen de un lote. */
  rinde: number
  items: RecetaItem[]
  notas: string
  activo: boolean
}

export interface PresentacionEmpaque {
  insumoId: string
  cantidad: number
}

export interface Presentacion {
  id: string
  recetaId: string
  /** "Unidad", "Bolsita de 6", "Docena". */
  nombre: string
  /** Cuántas galletas entran en esta presentación. */
  unidades: number
  /** Precio de venta en Bs. */
  precio: number
  /** Bolsita, etiqueta, caja: se descuenta al vender. */
  empaque: PresentacionEmpaque[]
}

export type TipoMovimiento =
  | 'inicial'
  | 'compra'
  | 'consumo'
  | 'produccion'
  | 'venta'
  | 'merma'
  | 'ajuste'

export type ItemTipo = 'insumo' | 'galleta'

export interface Movimiento {
  id: string
  fecha: string
  tipo: TipoMovimiento
  itemTipo: ItemTipo
  /** id del insumo o de la receta, según itemTipo. */
  itemId: string
  /** Positivo suma al stock, negativo resta. */
  cantidad: number
  /** id de la producción, venta, compra o conteo que lo originó. */
  refId: string | null
  nota: string
}

export interface ConsumoProduccion {
  insumoId: string
  /** Lo que decía la receta. */
  teorico: number
  /** Lo que realmente se usó, corregido por la persona al cerrar el lote. */
  real: number
}

/**
 * Preparación ya hecha (masa, relleno, extra, topping) que se usó de su stock
 * intermedio al liberar una producción de galletas. Campo aditivo: los
 * respaldos viejos no lo tienen y la producción se lee igual que antes.
 */
export interface ConsumoComponenteProduccion {
  recetaId: string
  /** Lotes del componente que salieron de su stock intermedio. */
  lotes: number
}

/**
 * Producir ocurre en dos momentos separados en el tiempo: primero se liberan
 * los insumos ('pendiente'), horas después se cuentan las galletas que salieron
 * ('cerrada'). El campo es opcional a propósito: los respaldos anteriores no lo
 * tienen y se leen como 'cerrada', que es lo que eran.
 */
export type EstadoProduccion = 'pendiente' | 'cerrada'

export interface Produccion {
  id: string
  /** Cuándo se liberaron los insumos. */
  fecha: string
  recetaId: string
  /** Lotes de la receta. Puede ser 0,5 o 2,5: la receta escala. */
  lotes: number
  /**
   * Producto que debería haber salido: galletas (rinde × lotes) para una
   * galleta, o lotes para una preparación (masa, relleno, extra, topping).
   */
  esperado: number
  /** Producto bueno que salió de verdad. Cero mientras está pendiente. */
  producido: number
  /** Estropeado, que no entra al stock. Cero mientras está pendiente. */
  merma: number
  nota: string
  consumos: ConsumoProduccion[]
  /** Preparaciones ya hechas que se tomaron de su stock intermedio (solo galletas). */
  consumosComponente?: ConsumoComponenteProduccion[]
  /** Ausente = 'cerrada'. Leer siempre con `estadoProduccion(p)`. */
  estado?: EstadoProduccion
  /** Cuándo se completó. Nulo o ausente mientras está pendiente. */
  cerradaEl?: string | null
}

export type Canal = 'feria' | 'whatsapp' | 'delivery' | 'local'
export type MedioPago = 'qr' | 'efectivo'

export interface VentaItem {
  recetaId: string
  presentacionId: string
  /** Cuántos paquetes de esta presentación. */
  cantidad: number
  /** Precio cobrado por paquete. Editable en el momento. */
  precioUnit: number
  /** Galletas totales que salen del stock. */
  unidades: number
}

export interface Venta {
  id: string
  fecha: string
  canal: Canal
  medioPago: MedioPago
  items: VentaItem[]
  descuento: number
  total: number
  nota: string
  /** A nombre de quién se cobró. Vacío o ausente en las ventas de mostrador. */
  cliente?: string
}

/**
 * Un pedido es una venta a medio armar. En una feria hay varias a la vez —
 * cada clienta con su nombre — y las cuentas no se pueden mezclar. Vive en su
 * propia tabla para que sobreviva a cerrar la app; al cobrar se convierte en
 * `Venta` y desaparece.
 *
 * El stock, en cambio, es uno solo: un pedido abierto no reserva galletas,
 * pero la pantalla las descuenta de lo que los demás pedidos pueden pedir.
 */
export interface Pedido {
  id: string
  cliente: string
  items: VentaItem[]
  canal: Canal
  medioPago: MedioPago
  descuento: number
  nota: string
  /** Cuándo se abrió. Ordena las pestañas: el más viejo primero. */
  abiertoEl: string
}

export interface Compra {
  id: string
  fecha: string
  insumoId: string
  /** Cuántas presentaciones se compraron: 2 bolsas, 1 maple. */
  cantidad: number
  precioTotal: number
  venceEl: string | null
}

export interface Conteo {
  id: string
  fecha: string
  itemTipo: ItemTipo
  itemId: string
  anterior: number
  contado: number
  diferencia: number
  motivo: string
}

export interface Config {
  negocio: string
  /** Margen que se quiere ganar sobre el precio de venta, 0–1. */
  margenObjetivo: number
}

export interface DB {
  insumos: Insumo[]
  recetas: Receta[]
  presentaciones: Presentacion[]
  movimientos: Movimiento[]
  producciones: Produccion[]
  ventas: Venta[]
  compras: Compra[]
  conteos: Conteo[]
  /** Pedidos abiertos, todavía sin cobrar. Los respaldos viejos no lo traen. */
  pedidos: Pedido[]
  config: Config
}

export const CANALES: { id: Canal; label: string }[] = [
  { id: 'feria', label: 'Feria' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'local', label: 'Local' },
]

export const MEDIOS_PAGO: { id: MedioPago; label: string }[] = [
  { id: 'qr', label: 'QR' },
  { id: 'efectivo', label: 'Efectivo' },
]

export const CATEGORIAS: { id: CategoriaInsumo; label: string }[] = [
  { id: 'seco', label: 'Secos' },
  { id: 'humedo', label: 'Húmedos' },
  { id: 'perecedero', label: 'Perecederos' },
  { id: 'empaque', label: 'Empaque' },
]

export const TIPOS_RECETA: { id: TipoReceta; label: string; ico: string }[] = [
  { id: 'galleta', label: 'Galleta', ico: '🍪' },
  { id: 'masa', label: 'Masa', ico: '🌾' },
  { id: 'relleno', label: 'Relleno', ico: '🍯' },
  { id: 'extra', label: 'Extra', ico: '✨' },
  { id: 'topping', label: 'Topping', ico: '🍬' },
]
