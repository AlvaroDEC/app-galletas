import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Config, DB, Insumo, Pedido, Presentacion, Receta } from './types'
import { calcularStocks, type Stocks } from './calc'
import { crearRepo, type Cambios, type Repo } from './db'
import {
  opCerrarProduccion,
  opCompra,
  opConteo,
  opLiberarProduccion,
  opVenta,
  type EntradaCerrarProduccion,
  type EntradaCompra,
  type EntradaConteo,
  type EntradaLiberarProduccion,
  type EntradaVenta,
} from './ops'
import { dbSoloStock, dbVacia } from './seed'
import { hoyISO, id } from './units'

interface Estado {
  db: DB
  stocks: Stocks
  cargando: boolean
  error: string | null
  modo: 'local' | 'nube'
  guardando: boolean
}

interface Acciones {
  registrarCompra(e: EntradaCompra): Promise<void>
  /** Descuenta los insumos y deja la producción pendiente. Devuelve su id. */
  liberarProduccion(e: EntradaLiberarProduccion): Promise<string>
  /** Suma al stock las galletas que salieron y cierra la producción. */
  cerrarProduccion(e: EntradaCerrarProduccion): Promise<void>
  /** Abre un pedido a nombre de un cliente y devuelve su id. */
  abrirPedido(cliente: string): Promise<string>
  /** Guarda el pedido tal cual quedó: ítems, canal, medio de pago, descuento. */
  guardarPedido(p: Pedido): Promise<void>
  /** Cierra el pedido sin cobrarlo. No toca el stock. */
  descartarPedido(id: string): Promise<void>
  /** Convierte el pedido en venta, descuenta el stock y lo borra. */
  cobrarPedido(id: string): Promise<void>
  registrarConteo(e: EntradaConteo): Promise<void>
  guardarInsumo(i: Insumo): Promise<void>
  borrarInsumo(id: string): Promise<void>
  guardarReceta(r: Receta, presentaciones: Presentacion[]): Promise<void>
  borrarReceta(id: string): Promise<void>
  guardarConfig(c: Config): Promise<void>
  reiniciar(modo: 'stock' | 'vacia'): Promise<void>
  recargar(): Promise<void>
  limpiarError(): void
}

const Ctx = createContext<(Estado & Acciones) | null>(null)

const DB_INICIAL: DB = {
  insumos: [],
  recetas: [],
  presentaciones: [],
  movimientos: [],
  producciones: [],
  ventas: [],
  compras: [],
  conteos: [],
  pedidos: [],
  config: { negocio: 'Galletas Artesanales DUNA', margenObjetivo: 0.55 },
}

export function ProveedorDatos({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repo | null>(null)
  if (repoRef.current === null) repoRef.current = crearRepo()
  const repo = repoRef.current

  const [db, setDb] = useState<DB>(DB_INICIAL)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sólo el primer arranque muestra la pantalla de inicio. Las relecturas que
  // vienen del realtime se hacen en segundo plano, con lo que ya hay en la
  // pantalla a la vista: apagar la app ahí se lee como un corte, no como marca.
  const primeraCarga = useRef(true)

  const cargar = useCallback(async () => {
    const esPrimera = primeraCarga.current
    if (esPrimera) setCargando(true)
    try {
      setDb(await repo.cargar())
      setError(null)
    } catch (e) {
      if (esPrimera) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
      }
    } finally {
      primeraCarga.current = false
      setCargando(false)
    }
  }, [repo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Si otro dispositivo guarda algo, esta pantalla se entera sola.
  useEffect(() => {
    if (!repo.escuchar) return
    return repo.escuchar(() => {
      void cargar()
    })
  }, [repo, cargar])

  /** Aplica el cambio en pantalla al instante y lo persiste detrás. */
  const persistir = useCallback(
    async (siguiente: DB, cambios: Cambios) => {
      const previo = db
      setDb(siguiente)
      setGuardando(true)
      try {
        await repo.aplicar(cambios)
        setError(null)
      } catch (e) {
        setDb(previo)
        setError(e instanceof Error ? e.message : 'No se pudo guardar')
        throw e
      } finally {
        setGuardando(false)
      }
    },
    [db, repo],
  )

  const registrarCompra = useCallback(
    async (e: EntradaCompra) => {
      const { compra, movimientos } = opCompra(db, e)
      await persistir(
        {
          ...db,
          compras: [...db.compras, compra],
          movimientos: [...db.movimientos, ...movimientos],
          insumos: e.venceEl
            ? db.insumos.map((i) => (i.id === e.insumoId ? { ...i, venceEl: e.venceEl! } : i))
            : db.insumos,
        },
        {
          guardar: {
            compras: [compra],
            movimientos,
            ...(e.venceEl
              ? {
                  insumos: db.insumos
                    .filter((i) => i.id === e.insumoId)
                    .map((i) => ({ ...i, venceEl: e.venceEl! })),
                }
              : {}),
          },
        },
      )
    },
    [db, persistir],
  )

  const liberarProduccion = useCallback(
    async (e: EntradaLiberarProduccion) => {
      const { produccion, movimientos } = opLiberarProduccion(db, e)
      await persistir(
        {
          ...db,
          producciones: [...db.producciones, produccion],
          movimientos: [...db.movimientos, ...movimientos],
        },
        { guardar: { producciones: [produccion], movimientos } },
      )
      return produccion.id
    },
    [db, persistir],
  )

  const cerrarProduccion = useCallback(
    async (e: EntradaCerrarProduccion) => {
      const { produccion, movimientos } = opCerrarProduccion(db, e)
      await persistir(
        {
          // Mismo id que la pendiente: en la nube el delta hace upsert por
          // (tienda, tabla, id), así que pisa la fila en vez de duplicarla.
          ...db,
          producciones: db.producciones.map((p) => (p.id === produccion.id ? produccion : p)),
          movimientos: [...db.movimientos, ...movimientos],
        },
        { guardar: { producciones: [produccion], movimientos } },
      )
    },
    [db, persistir],
  )

  const abrirPedido = useCallback(
    async (cliente: string) => {
      const pedido: Pedido = {
        id: id('ped'),
        cliente: cliente.trim() || 'Mostrador',
        items: [],
        canal: 'feria',
        medioPago: 'qr',
        descuento: 0,
        nota: '',
        abiertoEl: hoyISO(),
      }
      await persistir(
        { ...db, pedidos: [...db.pedidos, pedido] },
        { guardar: { pedidos: [pedido] } },
      )
      return pedido.id
    },
    [db, persistir],
  )

  const guardarPedido = useCallback(
    async (p: Pedido) => {
      const existe = db.pedidos.some((x) => x.id === p.id)
      await persistir(
        {
          ...db,
          pedidos: existe ? db.pedidos.map((x) => (x.id === p.id ? p : x)) : [...db.pedidos, p],
        },
        { guardar: { pedidos: [p] } },
      )
    },
    [db, persistir],
  )

  const descartarPedido = useCallback(
    async (idPedido: string) => {
      // Un pedido nunca movió stock, así que descartarlo no deja rastro:
      // se borra de verdad, no se desactiva como los insumos o las recetas.
      await persistir(
        { ...db, pedidos: db.pedidos.filter((p) => p.id !== idPedido) },
        { borrar: { pedidos: [idPedido] } },
      )
    },
    [db, persistir],
  )

  const cobrarPedido = useCallback(
    async (idPedido: string) => {
      const pedido = db.pedidos.find((p) => p.id === idPedido)
      if (!pedido) return
      const entrada: EntradaVenta = {
        items: pedido.items,
        canal: pedido.canal,
        medioPago: pedido.medioPago,
        descuento: pedido.descuento,
        cliente: pedido.cliente,
        nota: pedido.nota,
      }
      const { venta, movimientos } = opVenta(db, entrada)
      // Un solo delta: la venta entra y el pedido desaparece en la misma
      // escritura. Si algo falla, no queda un pedido fantasma ya cobrado.
      await persistir(
        {
          ...db,
          ventas: [...db.ventas, venta],
          movimientos: [...db.movimientos, ...movimientos],
          pedidos: db.pedidos.filter((p) => p.id !== idPedido),
        },
        {
          guardar: { ventas: [venta], movimientos },
          borrar: { pedidos: [idPedido] },
        },
      )
    },
    [db, persistir],
  )

  const registrarConteo = useCallback(
    async (e: EntradaConteo) => {
      const { conteo, movimientos } = opConteo(e)
      await persistir(
        {
          ...db,
          conteos: [...db.conteos, conteo],
          movimientos: [...db.movimientos, ...movimientos],
        },
        { guardar: { conteos: [conteo], movimientos } },
      )
    },
    [db, persistir],
  )

  const guardarInsumo = useCallback(
    async (i: Insumo) => {
      const existe = db.insumos.some((x) => x.id === i.id)
      await persistir(
        {
          ...db,
          insumos: existe ? db.insumos.map((x) => (x.id === i.id ? i : x)) : [...db.insumos, i],
        },
        { guardar: { insumos: [i] } },
      )
    },
    [db, persistir],
  )

  const borrarInsumo = useCallback(
    async (id: string) => {
      // No se borra de verdad: se desactiva, para que el historial siga cuadrando.
      const insumo = db.insumos.find((x) => x.id === id)
      if (!insumo) return
      const apagado = { ...insumo, activo: false }
      await persistir(
        { ...db, insumos: db.insumos.map((x) => (x.id === id ? apagado : x)) },
        { guardar: { insumos: [apagado] } },
      )
    },
    [db, persistir],
  )

  const guardarReceta = useCallback(
    async (r: Receta, presentaciones: Presentacion[]) => {
      const existe = db.recetas.some((x) => x.id === r.id)
      const otras = db.presentaciones.filter((p) => p.recetaId !== r.id)
      const anteriores = db.presentaciones.filter((p) => p.recetaId === r.id)
      const vigentes = new Set(presentaciones.map((p) => p.id))
      // No borramos presentaciones que alguna venta o pedido referencie, para
      // no romper el historial de ventas y pedidos.
      const referidas = new Set<string>()
      for (const v of db.ventas) for (const it of v.items) referidas.add(it.presentacionId)
      for (const p of db.pedidos) for (const it of p.items) referidas.add(it.presentacionId)
      const aBorrar = anteriores
        .filter((p) => !vigentes.has(p.id) && !referidas.has(p.id))
        .map((p) => p.id)
      const anterioresConservadas = anteriores.filter(
        (p) => vigentes.has(p.id) || referidas.has(p.id),
      )
      await persistir(
        {
          ...db,
          recetas: existe ? db.recetas.map((x) => (x.id === r.id ? r : x)) : [...db.recetas, r],
          presentaciones: [...otras, ...anterioresConservadas, ...presentaciones],
        },
        {
          guardar: { recetas: [r], presentaciones },
          borrar: aBorrar.length ? { presentaciones: aBorrar } : undefined,
        },
      )
    },
    [db, persistir],
  )

  const borrarReceta = useCallback(
    async (id: string) => {
      const receta = db.recetas.find((x) => x.id === id)
      if (!receta) return
      const apagada = { ...receta, activo: false }
      await persistir(
        { ...db, recetas: db.recetas.map((x) => (x.id === id ? apagada : x)) },
        { guardar: { recetas: [apagada] } },
      )
    },
    [db, persistir],
  )

  const guardarConfig = useCallback(
    async (c: Config) => {
      await persistir({ ...db, config: c }, { config: c })
    },
    [db, persistir],
  )

  const reiniciar = useCallback(
    async (modo: 'stock' | 'vacia') => {
      const nueva = modo === 'stock' ? dbSoloStock() : dbVacia()
      setGuardando(true)
      try {
        await repo.reemplazarTodo(nueva)
        setDb(nueva)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo reiniciar')
      } finally {
        setGuardando(false)
      }
    },
    [repo],
  )

  const stocks = useMemo(() => calcularStocks(db.movimientos), [db.movimientos])

  const valor = useMemo(
    () => ({
      db,
      stocks,
      cargando,
      guardando,
      error,
      modo: repo.tipo,
      registrarCompra,
      liberarProduccion,
      cerrarProduccion,
      abrirPedido,
      guardarPedido,
      descartarPedido,
      cobrarPedido,
      registrarConteo,
      guardarInsumo,
      borrarInsumo,
      guardarReceta,
      borrarReceta,
      guardarConfig,
      reiniciar,
      recargar: cargar,
      limpiarError: () => setError(null),
    }),
    [
      db,
      stocks,
      cargando,
      guardando,
      error,
      repo.tipo,
      registrarCompra,
      liberarProduccion,
      cerrarProduccion,
      abrirPedido,
      guardarPedido,
      descartarPedido,
      cobrarPedido,
      registrarConteo,
      guardarInsumo,
      borrarInsumo,
      guardarReceta,
      borrarReceta,
      guardarConfig,
      reiniciar,
      cargar,
    ],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useDatos() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDatos debe usarse dentro de ProveedorDatos')
  return ctx
}
