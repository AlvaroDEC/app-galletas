import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DB } from './types'
import { dbVacia } from './seed'

// Dónde viven los datos.
//
// La app funciona igual en dos modos y las pantallas no saben en cuál están:
//
//   local  — todo en este dispositivo (IndexedDB). Sirve para probar y para
//            trabajar sin haber configurado nada.
//   nube   — todo en Supabase, compartido entre la laptop y el celular.
//
// Se cambia de uno a otro desde Ajustes, sin tocar código.

export type TablaNombre =
  | 'insumos'
  | 'recetas'
  | 'presentaciones'
  | 'movimientos'
  | 'producciones'
  | 'ventas'
  | 'compras'
  | 'conteos'
  | 'pedidos'

export const TABLAS: TablaNombre[] = [
  'insumos',
  'recetas',
  'presentaciones',
  'movimientos',
  'producciones',
  'ventas',
  'compras',
  'conteos',
  'pedidos',
]

export interface Cambios {
  guardar?: Partial<Record<TablaNombre, { id: string }[]>>
  borrar?: Partial<Record<TablaNombre, string[]>>
  config?: DB['config']
}

export interface Repo {
  tipo: 'local' | 'nube'
  cargar(): Promise<DB>
  aplicar(c: Cambios): Promise<void>
  reemplazarTodo(db: DB): Promise<void>
  /** Avisa cuando otro dispositivo cambió algo. Devuelve cómo desuscribirse. */
  escuchar?(alCambiar: () => void): () => void
}

// ------------------------------------------------- almacenamiento local

const IDB_NOMBRE = 'galletas'
const IDB_STORE = 'db'
const IDB_CLAVE = 'principal'

function abrirIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NOMBRE, 1)
    req.onupgradeneeded = () => {
      const idb = req.result
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbLeer<T>(clave: string): Promise<T | undefined> {
  return abrirIDB().then(
    (idb) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readonly')
        const req = tx.objectStore(IDB_STORE).get(clave)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbEscribir(clave: string, valor: unknown): Promise<void> {
  return abrirIDB().then(
    (idb) =>
      new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite')
        tx.objectStore(IDB_STORE).put(valor, clave)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

/**
 * Un respaldo guardado antes de que existiera una tabla no la trae. Se rellena
 * con una lista vacía en vez de dejar un `undefined` suelto que reventaría en
 * la primera cuenta. Vale para `pedidos` y para cualquier tabla futura.
 */
export function normalizarDB(db: DB): DB {
  const salida = { ...db } as DB & Record<TablaNombre, unknown>
  for (const tabla of TABLAS) {
    if (!Array.isArray(salida[tabla])) salida[tabla] = []
  }
  return salida
}

function aplicarEnMemoria(db: DB, c: Cambios): DB {
  const salida: DB = { ...db, config: c.config ?? db.config }
  for (const tabla of TABLAS) {
    const guardar = c.guardar?.[tabla]
    const borrar = c.borrar?.[tabla]
    if (!guardar && !borrar) continue
    let filas = [...(salida[tabla] as { id: string }[])]
    if (borrar?.length) {
      const fuera = new Set(borrar)
      filas = filas.filter((f) => !fuera.has(f.id))
    }
    if (guardar?.length) {
      const porId = new Map(filas.map((f) => [f.id, f]))
      for (const fila of guardar) porId.set(fila.id, fila)
      filas = [...porId.values()]
    }
    // @ts-expect-error las tablas son homogéneas por construcción
    salida[tabla] = filas
  }
  return salida
}

// IndexedDB es el almacén preferido, pero no siempre está disponible: algunos
// navegadores lo bloquean dentro de un iframe o en ventana privada. Cuando pasa,
// la app baja a localStorage, y si tampoco hay, se queda en memoria para que al
// menos la sesión funcione. El usuario nunca ve un error por esto.
const CLAVE_LS = 'galletas.db'
let idbUsable: boolean | null = null
let enMemoria: DB | null = null

async function idbDisponible(): Promise<boolean> {
  if (idbUsable !== null) return idbUsable
  try {
    if (typeof indexedDB === 'undefined') throw new Error('sin indexedDB')
    ;(await abrirIDB()).close()
    idbUsable = true
  } catch {
    idbUsable = false
  }
  return idbUsable
}

async function leerDB(): Promise<DB | undefined> {
  if (await idbDisponible()) {
    try {
      const guardada = await idbLeer<DB>(IDB_CLAVE)
      if (guardada) return normalizarDB(guardada)
    } catch {
      idbUsable = false
    }
  }
  try {
    const raw = localStorage.getItem(CLAVE_LS)
    if (raw) return normalizarDB(JSON.parse(raw) as DB)
  } catch {
    /* localStorage bloqueado */
  }
  return enMemoria ?? undefined
}

async function escribirDB(db: DB): Promise<void> {
  enMemoria = db
  if (await idbDisponible()) {
    try {
      await idbEscribir(IDB_CLAVE, db)
      return
    } catch {
      idbUsable = false
    }
  }
  try {
    localStorage.setItem(CLAVE_LS, JSON.stringify(db))
  } catch {
    /* sin espacio o bloqueado: queda solo en memoria */
  }
}

export class RepoLocal implements Repo {
  tipo = 'local' as const

  async cargar(): Promise<DB> {
    const guardada = await leerDB()
    if (guardada) return guardada
    const inicial = dbVacia()
    await escribirDB(inicial)
    return inicial
  }

  async aplicar(c: Cambios): Promise<void> {
    const actual = (await leerDB()) ?? dbVacia()
    await escribirDB(aplicarEnMemoria(actual, c))
  }

  async reemplazarTodo(db: DB): Promise<void> {
    await escribirDB(normalizarDB(db))
  }
}

// ---------------------------------------------------------------- nube

export interface ConfigNube {
  url: string
  clave: string
  tienda: string
}

const CLAVE_CONFIG_NUBE = 'galletas.nube'

export function leerConfigNube(): ConfigNube | null {
  try {
    const raw = localStorage.getItem(CLAVE_CONFIG_NUBE)
    if (!raw) return null
    const c = JSON.parse(raw) as ConfigNube
    return c.url && c.clave ? { ...c, tienda: c.tienda || 'principal' } : null
  } catch {
    return null
  }
}

export function guardarConfigNube(c: ConfigNube | null): void {
  if (c) localStorage.setItem(CLAVE_CONFIG_NUBE, JSON.stringify(c))
  else localStorage.removeItem(CLAVE_CONFIG_NUBE)
}

interface FilaRegistro {
  tienda: string
  tabla: string
  id: string
  datos: Record<string, unknown>
}

/**
 * Todo se guarda en una sola tabla `registros`, con el contenido en JSON.
 *
 * Es una decisión deliberada: la app carga todo en memoria y hace las cuentas
 * del lado del navegador, así que no necesita consultas SQL complejas. A cambio,
 * la puesta en marcha del cliente es pegar veinte líneas de SQL una sola vez, y
 * agregar un campo nuevo no obliga a migrar la base.
 */
export class RepoNube implements Repo {
  tipo = 'nube' as const
  private cliente: SupabaseClient
  private tienda: string

  constructor(cfg: ConfigNube) {
    this.cliente = createClient(cfg.url, cfg.clave)
    this.tienda = cfg.tienda || 'principal'
  }

  async cargar(): Promise<DB> {
    const { data, error } = await this.cliente
      .from('registros')
      .select('tabla,id,datos')
      .eq('tienda', this.tienda)
    if (error) throw new Error(traducirError(error.message))

    const base = dbVacia()
    const vacia: DB = {
      insumos: [],
      recetas: [],
      presentaciones: [],
      movimientos: [],
      producciones: [],
      ventas: [],
      compras: [],
      conteos: [],
      pedidos: [],
      config: base.config,
    }

    if (!data || data.length === 0) {
      // Primera vez en la nube: subimos las recetas e insumos de arranque.
      const inicial = dbVacia()
      await this.reemplazarTodo(inicial)
      return inicial
    }

    for (const fila of data as FilaRegistro[]) {
      if (fila.tabla === 'config') {
        vacia.config = fila.datos as unknown as DB['config']
        continue
      }
      if (!TABLAS.includes(fila.tabla as TablaNombre)) continue
      // @ts-expect-error las tablas son homogéneas por construcción
      vacia[fila.tabla as TablaNombre].push(fila.datos)
    }
    return vacia
  }

  async aplicar(c: Cambios): Promise<void> {
    const filas: FilaRegistro[] = []
    for (const tabla of TABLAS) {
      for (const fila of c.guardar?.[tabla] ?? []) {
        filas.push({
          tienda: this.tienda,
          tabla,
          id: fila.id,
          datos: fila as unknown as Record<string, unknown>,
        })
      }
    }
    if (c.config) {
      filas.push({
        tienda: this.tienda,
        tabla: 'config',
        id: 'config',
        datos: c.config as unknown as Record<string, unknown>,
      })
    }
    if (filas.length) {
      const { error } = await this.cliente
        .from('registros')
        .upsert(filas, { onConflict: 'tienda,tabla,id' })
      if (error) throw new Error(traducirError(error.message))
    }
    for (const tabla of TABLAS) {
      const ids = c.borrar?.[tabla]
      if (!ids?.length) continue
      const { error } = await this.cliente
        .from('registros')
        .delete()
        .eq('tienda', this.tienda)
        .eq('tabla', tabla)
        .in('id', ids)
      if (error) throw new Error(traducirError(error.message))
    }
  }

  async reemplazarTodo(entrada: DB): Promise<void> {
    const db = normalizarDB(entrada)
    const { error: errBorrar } = await this.cliente
      .from('registros')
      .delete()
      .eq('tienda', this.tienda)
    if (errBorrar) throw new Error(traducirError(errBorrar.message))

    const filas: FilaRegistro[] = []
    for (const tabla of TABLAS) {
      for (const fila of db[tabla] as { id: string }[]) {
        filas.push({
          tienda: this.tienda,
          tabla,
          id: fila.id,
          datos: fila as unknown as Record<string, unknown>,
        })
      }
    }
    filas.push({
      tienda: this.tienda,
      tabla: 'config',
      id: 'config',
      datos: db.config as unknown as Record<string, unknown>,
    })

    // En bloques, porque una carga inicial puede traer miles de movimientos.
    for (let i = 0; i < filas.length; i += 400) {
      const { error } = await this.cliente.from('registros').insert(filas.slice(i, i + 400))
      if (error) throw new Error(traducirError(error.message))
    }
  }

  escuchar(alCambiar: () => void): () => void {
    const canal = this.cliente
      .channel(`registros_${this.tienda}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registros' },
        () => alCambiar(),
      )
      .subscribe()
    return () => {
      void this.cliente.removeChannel(canal)
    }
  }
}

/** Los errores de Supabase vienen en inglés y de técnico. Acá se traducen. */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('relation') && m.includes('does not exist')) {
    return 'La tabla "registros" todavía no existe en su proyecto de Supabase. Copie el SQL de la guía de instalación y ejecútelo una vez.'
  }
  if (m.includes('jwt') || m.includes('api key') || m.includes('invalid')) {
    return 'La clave de Supabase no es válida. Revise que haya copiado la clave pública (anon / publishable), no la privada.'
  }
  if (m.includes('row-level security') || m.includes('policy')) {
    return 'Supabase está bloqueando el acceso por seguridad. Faltó ejecutar la parte del SQL que crea la política de acceso.'
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'No se pudo conectar. Revise la dirección del proyecto y su conexión a internet.'
  }
  return mensaje
}

export function crearRepo(): Repo {
  const cfg = leerConfigNube()
  return cfg ? new RepoNube(cfg) : new RepoLocal()
}
