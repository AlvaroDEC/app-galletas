import { useMemo, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import {
  costoEmpaque,
  costoGalleta,
  costoLote,
  desgloseLote,
  lotesPosibles,
  margen,
  precioSugerido,
  tipoReceta,
  type Catalogo,
} from '../lib/calc'
import type { Presentacion, Receta, RecetaItem, TipoReceta, UnidadBase } from '../lib/types'
import { TIPOS_RECETA } from '../lib/types'
import { bs, fmtCantidad, id as nuevoId, pct } from '../lib/units'
import { EMPAQUE_CAJA_4, EMPAQUE_CAJA_6, EMPAQUE_UNIDAD } from '../lib/seed'
import { Aviso, BuscadorAgregar, Cabecera, Campo, Hoja, InputNumero, Pildora, Segmento, Tarjeta, Vacio } from '../componentes/ui'

const EMOJIS = ['🍪', '🖤', '💥', '🤍', '🍫', '🥜', '🍋', '🫐', '🍓', '⭐']

export function PantallaRecetas({ ir }: PropsPantalla) {
  const { db, stocks, guardarReceta, borrarReceta, guardando } = useDatos()
  const [editando, setEditando] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [tipoSel, setTipoSel] = useState<string>(TIPOS_RECETA[0].id)
  const [direccion, setDireccion] = useState<'der' | 'izq' | null>(null)

  const recetas = db.recetas.filter((r) => r.activo)
  const receta = db.recetas.find((r) => r.id === editando) ?? null
  // Las recetas con un tipo que no está en TIPOS_RECETA (respaldo viejo o dato
  // raro) no pueden desaparecer del selector: caen en un grupo "Otras" aparte.
  const esTipoConocido = (t: string) => TIPOS_RECETA.some((x) => x.id === t)
  const cuantosOtras = recetas.filter((r) => !esTipoConocido(tipoReceta(r))).length
  // Si no hay recetas raras, "Otras" no existe y se vuelve al primer tipo real.
  const enOtras = tipoSel === 'otras' && cuantosOtras > 0
  const tiposConRecetas = TIPOS_RECETA.filter((t) =>
    recetas.some((r) => tipoReceta(r) === t.id),
  )
  const tipoActivo =
    tiposConRecetas.find((t) => t.id === tipoSel) ?? tiposConRecetas[0] ?? TIPOS_RECETA[0]
  const labelTipo = enOtras ? 'Otras' : tipoActivo.id === 'galleta' ? 'Galletas' : tipoActivo.label
  const icoTipo = enOtras ? '🧩' : tipoActivo.ico
  const recetasDeTipo = recetas.filter((r) => {
    const t = tipoReceta(r)
    return enOtras ? !esTipoConocido(t) : t === tipoActivo.id
  })

  return (
    <>
      <Cabecera
        titulo="Recetas"
        bajada="Las cantidades son para un lote. Todo lo que cambie aquí recalcula costos y precios."
        accion={
          <button className="btn btn-chico" onClick={() => setCreando(true)}>
            + Nueva
          </button>
        }
      />

      {recetas.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="📋"
            titulo="No hay recetas"
            detalle="Registre su primera receta: ingredientes y cuántas galletas rinde."
            accion={
              <button className="btn btn-primario" onClick={() => setCreando(true)}>
                Crear receta
              </button>
            }
          />
        </Tarjeta>
      ) : (
        <>
          <div className="segmento" role="group" aria-label="Tipo de receta">
            {tiposConRecetas.map((t) => {
              const cuantos = recetas.filter((r) => tipoReceta(r) === t.id).length
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={!enOtras && t.id === tipoActivo.id}
                  onClick={() => {
                    const viejos = TIPOS_RECETA.map((x) => x.id)
                    setDireccion(
                      viejos.indexOf(t.id) > viejos.indexOf(tipoActivo.id) ? 'der' : 'izq',
                    )
                    setTipoSel(t.id)
                  }}
                >
                  {t.ico} {t.id === 'galleta' ? 'Galletas' : t.label} · {cuantos}
                </button>
              )
            })}
            {cuantosOtras > 0 && (
              <button
                key="otras"
                type="button"
                aria-pressed={enOtras}
                onClick={() => {
                  setDireccion('der')
                  setTipoSel('otras')
                }}
              >
                🧩 Otras · {cuantosOtras}
              </button>
            )}
          </div>

          <div
            key={tipoSel}
            className={
              direccion
                ? `insumos-slide ${direccion === 'der' ? 'entra-der' : 'entra-izq'}`
                : 'insumos-slide'
            }
          >
            <Tarjeta titulo={`${icoTipo} ${labelTipo}`}>
              <div className="lista">
                {recetasDeTipo.map((r) => {
                  const tipo = tipoReceta(r)
                  const esGalleta = tipo === 'galleta'
                const costo = esGalleta ? costoGalleta(r, db) : costoLote(r, db)
                return (
                  <button key={r.id} className="fila" onClick={() => setEditando(r.id)}>
                    <span className="avatar" aria-hidden="true">
                      {r.emoji}
                    </span>
                    <div className="fila-cuerpo">
                      <span className="fila-titulo">{r.nombre}</span>
                      <span className="fila-sub">
                        {r.items.length} {esGalleta ? 'ingredientes' : 'renglones'}
                        {esGalleta ? ` · rinde ${r.rinde}` : ''} · alcanza para{' '}
                        {lotesPosibles(r, db, stocks)} lotes
                      </span>
                    </div>
                    <div className="fila-fin">
                      <span className="n">{bs(costo)}</span>
                      <span className="s">{esGalleta ? 'por galleta' : 'por lote'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Tarjeta>
          </div>
        </>
      )}

      <Aviso icono="⚖️" titulo="Un consejo que cambia todo">
        La primera vez, pese los ingredientes en vez de calcularlos de memoria. Una receta cargada
        “más o menos” hace que el stock y los costos queden mal para siempre, y no hay forma de que
        el sistema lo detecte solo.
      </Aviso>

      {(receta || creando) && (
        <EditorReceta
          receta={
            receta ?? {
              id: nuevoId('rec'),
              nombre: '',
              emoji: '🍪',
              tipo: 'galleta',
              rinde: 30,
              items: [],
              notas: '',
              activo: true,
            }
          }
          presentaciones={
            receta
              ? db.presentaciones.filter((p) => p.recetaId === receta.id)
              : plantillaPresentaciones(nuevoId('rec'))
          }
          esNueva={!receta}
          guardando={guardando}
          alCerrar={() => {
            setEditando(null)
            setCreando(false)
          }}
          alGuardar={async (r, ps) => {
            await guardarReceta(r, ps)
            setEditando(null)
            setCreando(false)
          }}
          alDesactivar={async () => {
            if (receta) await borrarReceta(receta.id)
            setEditando(null)
          }}
          alIrACostos={() => {
            setEditando(null)
            setCreando(false)
            ir('costos')
          }}
        />
      )}
    </>
  )
}

/**
 * Cuánto topping entra en UNA galleta: el lote del topping se abre hasta los
 * insumos sueltos y se reparte por las galletas que rinde el lote de la receta.
 * `lotes` es cuántos lotes de topping entran en un lote de galletas.
 */
function toppingPorGalleta(
  topping: Receta,
  lotes: number,
  rindeGalleta: number,
  catalogo: Catalogo,
): { costo: number; renglones: { cantidad: number; unidad: UnidadBase; nombre: string }[] } {
  const escala = rindeGalleta > 0 ? lotes / rindeGalleta : 0
  return {
    costo: costoLote(topping, catalogo) * escala,
    renglones: desgloseLote(topping, catalogo).map((d) => ({
      nombre: d.nombre,
      unidad: d.unidad,
      cantidad: d.cantidad * escala,
    })),
  }
}

function plantillaPresentaciones(recetaId: string): Presentacion[] {
  return [
    {
      id: `${recetaId}_u`,
      recetaId,
      nombre: 'Unidad',
      unidades: 1,
      precio: 15,
      empaque: [...EMPAQUE_UNIDAD],
    },
    {
      id: `${recetaId}_4`,
      recetaId,
      nombre: 'Caja de 4',
      unidades: 4,
      precio: 58,
      empaque: [...EMPAQUE_CAJA_4],
    },
    {
      id: `${recetaId}_6`,
      recetaId,
      nombre: 'Caja de 6',
      unidades: 6,
      precio: 85,
      empaque: [...EMPAQUE_CAJA_6],
    },
  ]
}

function EditorReceta({
  receta,
  presentaciones,
  esNueva,
  guardando,
  alCerrar,
  alGuardar,
  alDesactivar,
  alIrACostos,
}: {
  receta: Receta
  presentaciones: Presentacion[]
  esNueva: boolean
  guardando: boolean
  alCerrar: () => void
  alGuardar: (r: Receta, ps: Presentacion[]) => Promise<void>
  alDesactivar: () => Promise<void>
  alIrACostos: () => void
}) {
  const { db } = useDatos()
  const [borrador, setBorrador] = useState<Receta>(receta)
  const [pres, setPres] = useState<Presentacion[]>(
    presentaciones.length ? presentaciones : plantillaPresentaciones(receta.id),
  )

  const esGalleta = tipoReceta(borrador) === 'galleta'

  const ingredientes = db.insumos.filter((i) => i.activo && i.categoria !== 'empaque')
  const empaques = db.insumos.filter((i) => i.activo && i.categoria === 'empaque')

  const desglose = useMemo(() => desgloseLote(borrador, db), [borrador, db])
  const costoDeLote = costoLote(borrador, db)
  const porGalleta = borrador.rinde > 0 ? costoDeLote / borrador.rinde : 0

  const disponibles = ingredientes.filter((i) => !borrador.items.some((it) => it.insumoId === i.id))

  // Los toppings tienen su propia sección ("Topping por galleta"), así que no
  // aparecen en la lista genérica de componentes.
  const componentesDisponibles = db.recetas.filter(
    (r) =>
      r.activo &&
      tipoReceta(r) !== 'galleta' &&
      tipoReceta(r) !== 'topping' &&
      r.id !== borrador.id &&
      !borrador.items.some((it) => it.componenteId === r.id),
  )

  const toppingsDisponibles = db.recetas.filter(
    (r) =>
      r.activo &&
      tipoReceta(r) === 'topping' &&
      r.id !== borrador.id &&
      !borrador.items.some((it) => it.componenteId === r.id),
  )

  const toppingsEnGalleta = borrador.items
    .map((it, idx) => {
      const topping = it.componenteId
        ? db.recetas.find((r) => r.id === it.componenteId)
        : undefined
      return topping && tipoReceta(topping) === 'topping'
        ? { it, idx, topping }
        : null
    })
    .filter((x): x is { it: RecetaItem; idx: number; topping: Receta } => x !== null)

  const costoToppingPorGalleta = toppingsEnGalleta.reduce(
    (s, x) => s + toppingPorGalleta(x.topping, x.it.cantidad, borrador.rinde, db).costo,
    0,
  )

  // Renglones que se muestran en la lista de "Ingredientes de un lote": todo
  // menos los toppings, que viven en su sección propia. Se conserva el índice
  // real dentro de borrador.items para quitar/editar la línea correcta.
  const itemsDeLista = borrador.items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => {
      if (it.componenteId === undefined) return true
      const c = db.recetas.find((r) => r.id === it.componenteId)
      return c ? tipoReceta(c) !== 'topping' : true
    })

  return (
    <Hoja
      titulo={esNueva ? 'Nueva receta' : borrador.nombre || 'Receta'}
      ancha
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            className="btn btn-primario"
            disabled={guardando || !borrador.nombre.trim() || borrador.rinde <= 0}
            onClick={() =>
              void alGuardar(
                borrador,
                esGalleta ? pres.map((p) => ({ ...p, recetaId: borrador.id })) : [],
              )
            }
          >
            Guardar receta
          </button>
        </>
      }
    >
      <Campo etiqueta="Tipo de receta">
        <Segmento
          opciones={TIPOS_RECETA}
          valor={tipoReceta(borrador)}
          alCambiar={(tipo) => {
            setBorrador({ ...borrador, tipo })
            setPres((anterior) =>
              tipo === 'galleta'
                ? anterior.length
                  ? anterior
                  : plantillaPresentaciones(borrador.id)
                : anterior,
            )
          }}
        />
      </Campo>

      <div className="fila-campos">
        <Campo etiqueta="Nombre">
          <input
            className="input"
            value={borrador.nombre}
            placeholder="Chips de chocolate"
            onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
          />
        </Campo>
        {(() => {
          const tipo = tipoReceta(borrador)
          const ayudaRinde: Record<TipoReceta, string> = {
            galleta: 'Cuántas galletas salen de un lote completo.',
            masa: 'A cuántas galletas alcanza un lote de esta masa.',
            relleno: 'A cuántas galletas alcanza un lote de este relleno.',
            extra: 'A cuántas galletas alcanza un lote de este extra.',
            topping: 'A cuántas galletas cubre un lote de este topping.',
          }
          return (
            <Campo
              etiqueta={tipo === 'galleta' ? 'Rinde por lote' : 'Rinde (a cuántas galletas)'}
              ayuda={ayudaRinde[tipo]}
            >
              <InputNumero
                className="input num"
                inputMode="numeric"
                valor={borrador.rinde}
                alCambiar={(numero) => setBorrador({ ...borrador, rinde: Math.max(1, numero) })}
              />
            </Campo>
          )
        })()}
      </div>

      <Campo etiqueta="Ícono">
        <div className="envoltura">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="btn btn-chico"
              aria-pressed={borrador.emoji === e}
              style={
                borrador.emoji === e
                  ? { background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }
                  : undefined
              }
              onClick={() => setBorrador({ ...borrador, emoji: e })}
            >
              {e}
            </button>
          ))}
        </div>
      </Campo>

      <div>
        <div className="entre" style={{ marginBottom: '.5rem' }}>
          <span className="eyebrow">Ingredientes de un lote</span>
          <span className="mini silencio n">{bs(costoDeLote)}</span>
        </div>
        <div className="lista tarjeta">
          {itemsDeLista.length === 0 && (
            <div className="fila">
              <span className="mini silencio">Todavía no agregaste ingredientes ni componentes.</span>
            </div>
          )}
          {itemsDeLista.map(({ it, idx }) => {
            const quitar = () =>
              setBorrador({ ...borrador, items: borrador.items.filter((_, i) => i !== idx) })
            const editarCantidad = (numero: number) => {
              const v = Math.max(0, numero)
              setBorrador({
                ...borrador,
                items: borrador.items.map((x, i) => (i === idx ? { ...x, cantidad: v } : x)),
              })
            }

            if (it.componenteId) {
              const componente = db.recetas.find((r) => r.id === it.componenteId)
              const nombre = componente?.nombre ?? 'Componente borrado'
              const tipoComponente = componente
                ? TIPOS_RECETA.find((t) => t.id === tipoReceta(componente))?.label
                : undefined
              return (
                <div key={it.componenteId} className="fila">
                  <span className="avatar" aria-hidden="true">
                    {componente?.emoji ?? '🧩'}
                  </span>
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">{nombre}</span>
                    <span className="fila-sub">{tipoComponente ?? 'componente'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexShrink: 0 }}>
                    <InputNumero
                      className="input num"
                      style={{ width: '84px', minHeight: '38px' }}
                      valor={it.cantidad}
                      aria-label={`Lotes de ${nombre}`}
                      alCambiar={editarCantidad}
                    />
                    <span className="mini silencio">lote(s)</span>
                    <button
                      className="btn btn-chico btn-fantasma"
                      aria-label={`Quitar ${nombre}`}
                      onClick={quitar}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            }

            const insumo = db.insumos.find((i) => i.id === it.insumoId)
            if (!insumo) return null
            const costo = desglose.find((d) => d.insumoId === it.insumoId)?.costo ?? 0
            return (
              <div key={it.insumoId} className="fila">
                <div className="fila-cuerpo">
                  <span className="fila-titulo">{insumo.nombre}</span>
                  <span className="fila-sub">
                    {bs(costo)} · {pct(costoDeLote > 0 ? costo / costoDeLote : 0)} del lote
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexShrink: 0 }}>
                  <InputNumero
                    className="input num"
                    style={{ width: '84px', minHeight: '38px' }}
                    valor={it.cantidad}
                    aria-label={`Cantidad de ${insumo.nombre}`}
                    alCambiar={editarCantidad}
                  />
                  <span className="mini silencio" style={{ width: '20px' }}>
                    {insumo.unidad}
                  </span>
                  <button
                    className="btn btn-chico btn-fantasma"
                    aria-label={`Quitar ${insumo.nombre}`}
                    onClick={quitar}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="envoltura" style={{ marginTop: '.5rem' }}>
          {disponibles.length > 0 && (
            <BuscadorAgregar
              opciones={disponibles.map((i) => ({ id: i.id, label: `${i.nombre} (${i.unidad})` }))}
              placeholder="+ Agregar ingrediente…"
              alElegir={(id) =>
                setBorrador({ ...borrador, items: [...borrador.items, { insumoId: id, cantidad: 0 }] })
              }
            />
          )}
          {componentesDisponibles.length > 0 && (
            <BuscadorAgregar
              opciones={componentesDisponibles.map((c) => ({ id: c.id, label: `${c.emoji} ${c.nombre}` }))}
              placeholder="+ Agregar componente…"
              alElegir={(id) =>
                setBorrador({
                  ...borrador,
                  items: [...borrador.items, { componenteId: id, cantidad: 0 }],
                })
              }
            />
          )}
        </div>
      </div>

      {esGalleta && (
        <div>
          <div className="entre" style={{ marginBottom: '.5rem' }}>
            <span className="eyebrow">Topping por galleta</span>
            <span className="mini silencio n">{bs(costoToppingPorGalleta)} por galleta</span>
          </div>
          <div className="lista tarjeta">
            {toppingsEnGalleta.length === 0 && (
              <div className="fila">
                <span className="mini silencio">
                  Todavía no definiste topping. Elegí uno abajo y con él se arma la galleta.
                </span>
              </div>
            )}
            {toppingsEnGalleta.map(({ it, idx, topping }) => {
              const resumen = toppingPorGalleta(topping, it.cantidad, borrador.rinde, db)
              const detalle = resumen.renglones
                .filter((r) => r.cantidad > 0)
                .map((r) => `${r.nombre}: ${fmtCantidad(r.cantidad, r.unidad)}`)
                .join(' · ')
              return (
                <div key={it.componenteId} className="fila">
                  <span className="avatar" aria-hidden="true">
                    {topping.emoji}
                  </span>
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">{topping.nombre}</span>
                    <span className="fila-sub">
                      1 lote cubre {topping.rinde} galletas · {bs(resumen.costo)} por galleta
                      {detalle && ` · ${detalle}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexShrink: 0 }}>
                    <InputNumero
                      className="input num"
                      style={{ width: '84px', minHeight: '38px' }}
                      valor={it.cantidad}
                      aria-label={`Lotes de ${topping.nombre}`}
                      alCambiar={(numero) => {
                        const v = Math.max(0, numero)
                        setBorrador({
                          ...borrador,
                          items: borrador.items.map((x, i) =>
                            i === idx ? { ...x, cantidad: v } : x,
                          ),
                        })
                      }}
                    />
                    <span className="mini silencio">lote(s)</span>
                    <button
                      className="btn btn-chico btn-fantasma"
                      aria-label={`Quitar ${topping.nombre}`}
                      onClick={() =>
                        setBorrador({ ...borrador, items: borrador.items.filter((_, i) => i !== idx) })
                      }
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {toppingsDisponibles.length > 0 && (
            <div style={{ marginTop: '.5rem' }}>
              <BuscadorAgregar
                opciones={toppingsDisponibles.map((t) => ({ id: t.id, label: `${t.emoji} ${t.nombre}` }))}
                placeholder="+ Agregar topping…"
                alElegir={(id) =>
                  setBorrador({
                    ...borrador,
                    items: [...borrador.items, { componenteId: id, cantidad: 1 }],
                  })
                }
              />
            </div>
          )}
          <p className="mini silencio" style={{ marginTop: '.4rem' }}>
            El número que ajustás son lotes del topping por lote de galletas; lo que ves por galleta
            sale de dividirlo por el rinde.
          </p>
        </div>
      )}

      <Aviso tono="acento" icono="🧮" titulo="Lo que cuesta esta receta">
        {esGalleta ? (
          <>
            Un lote sale {bs(costoDeLote)} y cada galleta {bs(porGalleta)}, contando solo los
            ingredientes.{' '}
          </>
        ) : (
          <>
            Un lote sale {bs(costoDeLote)}, contando solo los ingredientes.{' '}
          </>
        )}
        <button className="btn btn-chico btn-fantasma" onClick={alIrACostos}>
          Ver precios sugeridos
        </button>
      </Aviso>

      {esGalleta && (
        <div>
          <div className="entre" style={{ marginBottom: '.5rem' }}>
            <span className="eyebrow">Cómo se vende</span>
          </div>
          <div className="pila-chica">
            {pres.map((p, idx) => {
              const costoP = p.unidades * porGalleta + costoEmpaque(p, db.insumos)
              const m = margen(p.precio, costoP)
              return (
                <div key={p.id} className="tarjeta tarjeta-pad">
                  <div className="fila-campos">
                    <Campo etiqueta="Nombre">
                      <input
                        className="input"
                        value={p.nombre}
                        onChange={(e) =>
                          setPres(pres.map((x, i) => (i === idx ? { ...x, nombre: e.target.value } : x)))
                        }
                      />
                    </Campo>
                    <Campo etiqueta="Galletas">
                      <InputNumero
                        className="input num"
                        inputMode="numeric"
                        valor={p.unidades}
                        alCambiar={(numero) =>
                          setPres(
                            pres.map((x, i) =>
                              i === idx ? { ...x, unidades: Math.max(1, numero) } : x,
                            ),
                          )
                        }
                      />
                    </Campo>
                    <Campo etiqueta="Precio (Bs)">
                      <InputNumero
                        className="input num"
                        valor={p.precio}
                        alCambiar={(numero) =>
                          setPres(
                            pres.map((x, i) =>
                              i === idx ? { ...x, precio: Math.max(0, numero) } : x,
                            ),
                          )
                        }
                      />
                    </Campo>
                  </div>

                  <div className="envoltura" style={{ marginTop: '.6rem', alignItems: 'center' }}>
                    <span className="mini silencio">Empaque:</span>
                    {empaques.map((emp) => {
                      const puesto = p.empaque.some((x) => x.insumoId === emp.id)
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          className="btn btn-chico"
                          aria-pressed={puesto}
                          style={
                            puesto
                              ? { background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }
                              : undefined
                          }
                          onClick={() =>
                            setPres(
                              pres.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      empaque: puesto
                                        ? x.empaque.filter((y) => y.insumoId !== emp.id)
                                        : [...x.empaque, { insumoId: emp.id, cantidad: 1 }],
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          {emp.nombre}
                        </button>
                      )
                    })}
                  </div>

                  <div className="entre" style={{ marginTop: '.6rem' }}>
                    <span className="mini silencio">
                      Cuesta {bs(costoP)} · sugerido {bs(precioSugerido(costoP, db.config.margenObjetivo))}
                    </span>
                    <Pildora tono={m < 0.2 ? 'critica' : m < 0.4 ? 'warn' : 'ok'}>
                      margen {pct(m)}
                    </Pildora>
                  </div>

                  {pres.length > 1 && (
                    <button
                      className="btn btn-chico btn-fantasma"
                      style={{ marginTop: '.4rem' }}
                      onClick={() => setPres(pres.filter((_, i) => i !== idx))}
                    >
                      Quitar presentación
                    </button>
                  )}
                </div>
              )
            })}
            <button
              className="btn btn-chico"
              onClick={() =>
                setPres([
                  ...pres,
                  {
                    id: nuevoId('pres'),
                    recetaId: borrador.id,
                    nombre: 'Nueva presentación',
                    unidades: 1,
                    precio: 0,
                    empaque: [],
                  },
                ])
              }
            >
              + Agregar presentación
            </button>
          </div>
        </div>
      )}

      <Campo etiqueta="Notas de preparación" ayuda="Se muestran al producir. Temperatura, tiempos, trucos.">
        <textarea
          className="input"
          value={borrador.notas}
          placeholder="Horno 180 °C, 12 minutos. Mantequilla a temperatura ambiente."
          onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })}
        />
      </Campo>

      {desglose.length > 0 && (
        <div className="scroll-x tarjeta">
          <table className="tabla">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th className="n">Por lote</th>
                <th className="n">Costo</th>
              </tr>
            </thead>
            <tbody>
              {desglose.map((d) => (
                <tr key={d.insumoId}>
                  <td>{d.nombre}</td>
                  <td className="n">{fmtCantidad(d.cantidad, d.unidad)}</td>
                  <td className="n">{bs(d.costo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total del lote</td>
                <td className="n">{esGalleta ? `${borrador.rinde} galletas` : 'por lote'}</td>
                <td className="n">{bs(costoDeLote)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!esNueva && (
        <button className="btn btn-peligro" onClick={() => void alDesactivar()}>
          Desactivar receta
        </button>
      )}
    </Hoja>
  )
}