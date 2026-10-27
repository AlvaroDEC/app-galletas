import { useEffect, useMemo, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import {
  costoLote,
  costoUnitario,
  estaPendiente,
  lotesPosibles,
  planProduccion,
  stockDe,
  tipoReceta,
} from '../lib/calc'
import { TIPOS_RECETA } from '../lib/types'
import type { Insumo, Produccion, Receta, TipoReceta } from '../lib/types'
import { bs, fmtCantidad, fmtFecha, fmtHora, num, plural } from '../lib/units'
import { Aviso, Cabecera, Contador, InputNumero, Pildora, Tarjeta, Vacio } from '../componentes/ui'

// La pantalla que justifica todo el sistema. Producir ocurre en dos momentos,
// igual que en la cocina:
//
//   1. Liberar   — salen los ingredientes de la despensa y empieza el horneado.
//   2. Completar — horas después se cuentan las galletas buenas y la merma,
//                  y recién ahí entran al stock.
//
// Entre los dos, la producción queda pendiente y aparece arriba de todo hasta
// que alguien la cierra.

export function PantallaProducir({ ir, foco }: PropsPantalla) {
  const { db, stocks, liberarProduccion, cerrarProduccion, guardando } = useDatos()
  // Producir trata igual todas las recetas activas: la galleta (lo que se
  // vende) y las preparaciones (masa, relleno, extra, topping) que se elaboran
  // por separado y después consumen las galletas.
  const recetas = db.recetas.filter((r) => r.activo)

  const pendientes = useMemo(
    () => db.producciones.filter(estaPendiente).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [db.producciones],
  )

  const [recetaId, setRecetaId] = useState<string | null>(foco ?? null)
  const [completandoId, setCompletandoId] = useState<string | null>(null)
  const [lotes, setLotes] = useState(1)
  const [reales, setReales] = useState<Record<string, number>>({})
  const [nota, setNota] = useState('')
  const [tocado, setTocado] = useState(false)
  const [hecho, setHecho] = useState<{
    cantidad: number
    receta: string
    esGalleta: boolean
  } | null>(null)
  const [tipoSel, setTipoSel] = useState<string>(TIPOS_RECETA[0].id)
  const [direccion, setDireccion] = useState<'der' | 'izq' | null>(null)
  // Las recetas con un tipo que no está en TIPOS_RECETA (respaldo viejo o dato
  // raro) no pueden desaparecer del selector: caen en un grupo "Otras" aparte.
  const esTipoConocido = (t: string) => TIPOS_RECETA.some((x) => x.id === t)
  const cuantosOtras = recetas.filter((r) => !esTipoConocido(tipoReceta(r))).length
  // Si no hay recetas raras, "Otras" no existe y se vuelve al primer tipo real.
  const enOtras = tipoSel === 'otras' && cuantosOtras > 0
  const tipoActivo = TIPOS_RECETA.find((t) => t.id === tipoSel) ?? TIPOS_RECETA[0]
  const recetasDeTipo = recetas.filter((r) => {
    const t = tipoReceta(r)
    return enOtras ? !esTipoConocido(t) : t === tipoActivo.id
  })
  const labelTipo = enOtras ? 'Otras' : tipoActivo.id === 'galleta' ? 'Galletas' : tipoActivo.label
  const icoTipo = enOtras ? '🧩' : tipoActivo.ico

  const receta = recetas.find((r) => r.id === recetaId) ?? null
  const esGalleta = receta ? tipoReceta(receta) === 'galleta' : true
  const esperado = receta
    ? esGalleta
      ? Math.round(receta.rinde * lotes)
      : Math.round(lotes)
    : 0
  const completando = db.producciones.find((p) => p.id === completandoId) ?? null

  // Cada vez que cambia la receta o la cantidad de lotes, la app vuelve a
  // proponer el consumo según receta, desglosado por sección. Lo que la persona
  // haya corregido a mano se descarta a propósito: el punto de partida siempre
  // es la receta.
  useEffect(() => {
    if (!receta) return
    const plan = planProduccion(receta, lotes, db, stocks)
    const propuesta: Record<string, number> = {}
    for (const g of plan.grupos) {
      for (const d of g.insumos) propuesta[`${g.recetaId}::${d.insumoId}`] = redondear(d.cantidad)
    }
    setReales(propuesta)
    setTocado(false)
  }, [receta, lotes, db, stocks])

  const expansion = useMemo(
    () => (receta ? planProduccion(receta, lotes, db, stocks) : null),
    [receta, lotes, db, stocks],
  )
  const grupos = expansion?.grupos ?? []

  const insumosPorId = useMemo(() => new Map(db.insumos.map((i) => [i.id, i])), [db.insumos])

  const faltantes = useMemo(() => {
    if (!expansion) return []
    const out: { insumo: Insumo; real: number; disponible: number }[] = []
    for (const g of expansion.grupos) {
      for (const d of g.insumos) {
        const insumo = insumosPorId.get(d.insumoId)
        if (!insumo) continue
        const real = reales[`${g.recetaId}::${d.insumoId}`] ?? redondear(d.cantidad)
        const disponible = stockDe(stocks, 'insumo', d.insumoId)
        if (real > disponible + 0.0001) out.push({ insumo, real, disponible })
      }
    }
    return out
  }, [expansion, reales, stocks, insumosPorId])

  const costo = useMemo(() => {
    if (!expansion) return 0
    let total = 0
    for (const g of expansion.grupos) {
      for (const d of g.insumos) {
        const insumo = insumosPorId.get(d.insumoId)
        if (!insumo) continue
        const real = reales[`${g.recetaId}::${d.insumoId}`] ?? redondear(d.cantidad)
        total += real * costoUnitario(insumo)
      }
    }
    return total
  }, [expansion, reales, insumosPorId])

  const liberar = async () => {
    if (!receta || !expansion || faltantes.length > 0) return
    const agregar = new Map<string, { teorico: number; real: number }>()
    for (const g of expansion.grupos) {
      for (const d of g.insumos) {
        const prev = agregar.get(d.insumoId) ?? { teorico: 0, real: 0 }
        const real = reales[`${g.recetaId}::${d.insumoId}`] ?? redondear(d.cantidad)
        agregar.set(d.insumoId, {
          teorico: prev.teorico + redondear(d.cantidad),
          real: prev.real + real,
        })
      }
    }
    const consumos = [...agregar.entries()].map(([insumoId, v]) => ({
      insumoId,
      teorico: redondear(v.teorico),
      real: redondear(v.real),
    }))
    const consumosComponente = (expansion.consumosComponente ?? [])
      .filter((c) => c.lotes > 0)
      .map((c) => ({ recetaId: c.recetaId, lotes: redondear(c.lotes) }))
    await liberarProduccion({
      recetaId: receta.id,
      lotes,
      consumos,
      consumosComponente,
      nota,
    })
    setRecetaId(null)
    setLotes(1)
    setNota('')
    setHecho(null)
  }

  // ---------------------------------------------------- completar (paso 2)

  if (completando) {
    return (
      <VistaCompletar
        produccion={completando}
        guardando={guardando}
        alVolver={() => setCompletandoId(null)}
        alCompletar={async (producido, merma, notaCierre) => {
          await cerrarProduccion({
            produccionId: completando.id,
            producido,
            merma,
            nota: notaCierre,
          })
          const r = db.recetas.find((x) => x.id === completando.recetaId)
          setCompletandoId(null)
          setHecho({
            cantidad: producido,
            receta: r?.nombre ?? 'la receta',
            esGalleta: r ? tipoReceta(r) === 'galleta' : true,
          })
        }}
      />
    )
  }

  // ------------------------------------------------------ elegir qué hacer

  if (!receta) {
    return (
      <>
        <Cabecera
          titulo="Producir"
          bajada="Elija qué va a hornear. La app calcula los ingredientes y los descuenta del stock."
        />

        {hecho && (
          <Aviso tono="acento" icono="✅" titulo="Producción completada">
            {hecho.esGalleta
              ? `Entraron ${plural(hecho.cantidad, 'galleta', 'galletas')} de ${hecho.receta} al stock. `
              : `Entraron ${plural(hecho.cantidad, 'lote', 'lotes')} de ${hecho.receta} al stock de preparaciones. `}
            {hecho.esGalleta && (
              <button className="btn btn-chico btn-fantasma" onClick={() => ir('vender')}>
                Ir a vender
              </button>
            )}
          </Aviso>
        )}

        {pendientes.length > 0 && (
          <Tarjeta
            titulo={`Producciones sin completar (${pendientes.length})`}
            extra={<Pildora tono="warn">Faltan registrarse</Pildora>}
          >
            <div className="lista">
              {pendientes.map((p) => {
                const r = db.recetas.find((x) => x.id === p.recetaId)
                const esGalleta = r ? tipoReceta(r) === 'galleta' : true
                return (
                  <div key={p.id} className="fila">
                    <span className="avatar" aria-hidden="true">
                      {r?.emoji ?? '🥣'}
                    </span>
                    <div className="fila-cuerpo">
                      <span className="fila-titulo">{r?.nombre ?? 'Receta borrada'}</span>
                      <span className="fila-sub">
                        {plural(p.lotes, 'lote', 'lotes')} liberados el {fmtFecha(p.fecha)} a las{' '}
                        {fmtHora(p.fecha)} · deberían salir{' '}
                        {plural(p.esperado, esGalleta ? 'galleta' : 'lote', esGalleta ? 'galletas' : 'lotes')}
                      </span>
                    </div>
                    <div className="fila-fin">
                      <button
                        className="btn btn-chico btn-primario"
                        onClick={() => setCompletandoId(p.id)}
                      >
                        Completar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Tarjeta>
        )}

        {recetas.length === 0 ? (
          <Tarjeta>
            <Vacio
              icono="📋"
              titulo="No hay recetas cargadas"
              detalle="Cree una receta con sus ingredientes y vuelva aquí."
              accion={
                <button className="btn btn-primario" onClick={() => ir('recetas')}>
                  Ir a recetas
                </button>
              }
            />
          </Tarjeta>
        ) : (
          <>
            <div className="segmento" role="group" aria-label="Tipo de receta">
              {TIPOS_RECETA.map((t) => {
                const cuantos = recetas.filter((r) => tipoReceta(r) === t.id).length
                if (cuantos === 0) return null
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={!enOtras && t.id === tipoSel}
                    onClick={() => {
                      const viejos = TIPOS_RECETA.map((x) => x.id)
                      setDireccion(
                        viejos.indexOf(t.id) > viejos.indexOf(tipoActivo.id) ? 'der' : 'izq',
                      )
                      setTipoSel(t.id)
                    }}
                  >
                    {t.ico} {t.id === 'galleta' ? 'Galletas' : t.label}
                    {` · ${cuantos}`}
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
                {recetasDeTipo
                  .map((r) => {
                    const esGalleta = !enOtras && tipoReceta(r) === 'galleta'
                    const hechos = stockDe(stocks, 'galleta', r.id)
                    return (
                      <FilaReceta
                        key={r.id}
                        r={r}
                        esGalleta={esGalleta}
                        lotes={lotesPosibles(r, db, stocks)}
                        stockLine={
                          esGalleta
                            ? ` · ${hechos} listas ahora`
                            : hechos > 0
                              ? ` · ${hechos} ${plural(hechos, 'lote hecho', 'lotes hechos')}`
                              : ''
                        }
                        onElegir={() => {
                          setRecetaId(r.id)
                          setHecho(null)
                        }}
                      />
                    )
                  })}
              </div>
              </Tarjeta>
            </div>
          </>
        )}

        <Aviso icono="🧮" titulo="Cómo se lee “lotes”">
          Es cuántas veces alcanza la despensa para hacer la receta completa hoy. Se calcula con el
          ingrediente que menos alcanza, que es el que realmente la frena.
        </Aviso>
      </>
    )
  }

  // ---------------------------------------------------- liberar (paso 1)

  return (
    <>
      <Cabecera
        titulo={`${receta.emoji} ${receta.nombre}`}
        bajada={
          esGalleta
            ? `Un lote rinde ${receta.rinde} galletas.`
            : `Un lote alcanza para ${receta.rinde} galletas de una receta de galleta.`
        }
        accion={
          <button className="btn btn-fantasma btn-chico" onClick={() => setRecetaId(null)}>
            ← Cambiar
          </button>
        }
      />

      <Tarjeta titulo="Cantidad a producir" pad>
        <div className="pila">
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="lotes">Lotes</label>
              <Contador valor={lotes} alCambiar={setLotes} paso={0.5} min={0.5} max={50} decimales={1} />
              <span className="ayuda">Puede hacer medio lote o dos y medio.</span>
            </div>
            <div className="campo">
              <label>Deberían salir</label>
              <div className="input num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {plural(esperado, esGalleta ? 'galleta' : 'lote', esGalleta ? 'galletas' : 'lotes')}
              </div>
              <span className="ayuda">
                {esGalleta
                  ? `${receta.rinde} por lote × ${num(lotes, 2)}`
                  : plural(lotes, 'lote', 'lotes')}
              </span>
            </div>
          </div>

          {receta.notas && (
            <Aviso icono="👩‍🍳" titulo="Nota de la receta">
              {receta.notas}
            </Aviso>
          )}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Ingredientes que se van a descontar"
        extra={
          tocado ? (
            <button
              className="btn btn-chico btn-fantasma"
              onClick={() => {
                if (!expansion) return
                const propuesta: Record<string, number> = {}
                for (const g of expansion.grupos) {
                  for (const d of g.insumos) propuesta[`${g.recetaId}::${d.insumoId}`] = redondear(d.cantidad)
                }
                setReales(propuesta)
                setTocado(false)
              }}
            >
              Volver a la receta
            </button>
          ) : (
            <span className="eyebrow">Editable</span>
          )
        }
      >
        {grupos.length === 0 ? (
          <span className="mini silencio" style={{ padding: '1rem' }}>
            Esta receta no consume ingredientes.
          </span>
        ) : (
          <div className="lista">
            {grupos.map((g) => (
              <div key={g.recetaId}>
                <div className="entre" style={{ padding: '.65rem 1rem .25rem' }}>
                  <span className="eyebrow">
                    {g.tipo === 'galleta'
                      ? 'Ingredientes'
                      : `${etiquetaTipo(g.tipo)} · ${g.nombre}`}
                  </span>
                  {g.desdeStock && g.desdeStock > 0 && (
                    <span className="mini silencio">
                      usa {num(g.desdeStock, 2)} {plural(g.desdeStock, 'lote listo', 'lotes listos')}
                    </span>
                  )}
                </div>
                {g.insumos.length > 0 ? (
                  <div className="lista">
                    {g.insumos.map((d) => {
                      const teorico = redondear(d.cantidad)
                      const real = reales[`${g.recetaId}::${d.insumoId}`] ?? teorico
                      const disponible = stockDe(stocks, 'insumo', d.insumoId)
                      const insuficiente = real > disponible + 0.0001
                      const cambiado = Math.abs(real - teorico) > 0.0001
                      return (
                        <div key={`${g.recetaId}::${d.insumoId}`} className="fila">
                          <div className="fila-cuerpo">
                            <span className="fila-titulo">
                              {d.nombre}
                              {insuficiente && <Pildora tono="critica">No alcanza</Pildora>}
                              {!insuficiente && cambiado && <Pildora tono="warn">Ajustado</Pildora>}
                            </span>
                            <span className="fila-sub">
                              Receta: {fmtCantidad(teorico, d.unidad)} · Hay:{' '}
                              {fmtCantidad(disponible, d.unidad)}
                              {insuficiente && ` · Faltan ${fmtCantidad(real - disponible, d.unidad)}`}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0 }}>
                            <InputNumero
                              className="input num"
                              style={{ width: '92px', minHeight: '38px' }}
                              valor={real}
                              aria-label={`Cantidad real de ${d.nombre}`}
                              alCambiar={(numero) => {
                                setReales((r) => ({
                                  ...r,
                                  [`${g.recetaId}::${d.insumoId}`]: Math.max(0, numero),
                                }))
                                setTocado(true)
                              }}
                            />
                            <span className="mini silencio" style={{ width: '22px' }}>
                              {d.unidad}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : g.desdeStock ? (
                  <span
                    className="mini silencio"
                    style={{ display: 'block', padding: '.25rem 1rem .6rem' }}
                  >
                    Solo se consume de lo ya preparado: no sale materia prima.
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Tarjeta>

      {faltantes.length > 0 && (
        <Aviso tono="crit" icono="⛔" titulo="No alcanzan los insumos">
          {faltantes.map((f) => (
            <span key={f.insumo.id} style={{ display: 'block' }}>
              Faltan {fmtCantidad(f.real - f.disponible, f.insumo.unidad)} de{' '}
              {f.insumo.nombre.toLowerCase()}.
            </span>
          ))}
          Baje la cantidad de lotes, corrija el consumo, o{' '}
          <button className="btn btn-chico btn-fantasma" onClick={() => ir('insumos')}>
            registre la compra
          </button>{' '}
          primero.
        </Aviso>
      )}

      <Tarjeta titulo="Nota del lote" pad>
        <div className="pila">
          <div className="campo">
            <label htmlFor="nota">Nota</label>
            <input
              id="nota"
              className="input"
              placeholder="Opcional: qué se está horneando, para quién"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
          <div className="entre">
            <span className="mini silencio">Costo de los ingredientes que salen ahora</span>
            <span className="n" style={{ fontWeight: 640 }}>
              {bs(costo)}
            </span>
          </div>
        </div>
      </Tarjeta>

      <button
        className="btn btn-primario btn-grande"
        disabled={guardando || faltantes.length > 0 || lotes <= 0}
        onClick={() => void liberar()}
      >
        {guardando ? 'Guardando…' : `Liberar producción de ${plural(lotes, 'lote', 'lotes')}`}
      </button>

      <p className="mini silencio centrado" style={{ marginTop: '-.3rem' }}>
        Ahora solo se descuenta lo de arriba. Al completar la producción,{' '}
        {esGalleta ? 'las galletas entran al stock' : 'lo preparado queda en su propio stock'} y no
        se vuelve a descontar inventario. Costo estimado del lote según receta (con toda la materia
        prima): {bs(costoLote(receta, db) * lotes)}.
      </p>
    </>
  )
}

// ------------------------------------------------------ completar (paso 2)

function FilaReceta({
  r,
  esGalleta,
  lotes,
  stockLine,
  onElegir,
}: {
  r: Receta
  esGalleta: boolean
  /** Cuántos lotes se pueden hacer hoy. */
  lotes: number
  /** Texto corto con el stock actual ("· 12 listas ahora"). */
  stockLine: string
  onElegir: () => void
}) {
  return (
    <button className="fila" onClick={onElegir}>
      <span className="avatar" aria-hidden="true">
        {r.emoji}
      </span>
      <div className="fila-cuerpo">
        <span className="fila-titulo">
          {r.nombre}
          {lotes === 0 && <Pildora tono="critica">Sin insumos</Pildora>}
        </span>
        <span className="fila-sub">
          {esGalleta
            ? `Un lote rinde ${plural(r.rinde, 'galleta', 'galletas')}`
            : `Un lote alcanza para ${plural(r.rinde, 'galleta', 'galletas')}`}
          {stockLine}
        </span>
      </div>
      <div className="fila-fin">
        <span className="n">{lotes}</span>
        <span className="s">lotes</span>
      </div>
    </button>
  )
}

function VistaCompletar({
  produccion,
  guardando,
  alVolver,
  alCompletar,
}: {
  produccion: Produccion
  guardando: boolean
  alVolver: () => void
  alCompletar: (producido: number, merma: number, nota: string) => Promise<void>
}) {
  const { db } = useDatos()
  const receta = db.recetas.find((r) => r.id === produccion.recetaId) ?? null
  const esGalleta = receta ? tipoReceta(receta) === 'galleta' : true

  const [producido, setProducido] = useState(produccion.esperado)
  const [merma, setMerma] = useState(0)
  const [nota, setNota] = useState(produccion.nota)

  // El costo sale de lo que ya se descontó al liberar, no de la receta: si la
  // persona corrigió el consumo, esta es la cifra real de este lote.
  const costo = useMemo(() => {
    const porId = new Map(db.insumos.map((i) => [i.id, i]))
    return produccion.consumos.reduce((s, c) => {
      const insumo = porId.get(c.insumoId)
      return insumo ? s + c.real * costoUnitario(insumo) : s
    }, 0)
  }, [produccion.consumos, db.insumos])

  const esperado = produccion.esperado

  return (
    <>
      <Cabecera
        titulo={`${receta?.emoji ?? '🥣'} ${receta?.nombre ?? 'Producción'}`}
        bajada={`Liberada el ${fmtFecha(produccion.fecha)} a las ${fmtHora(produccion.fecha)} · ${plural(
          produccion.lotes,
          'lote',
          'lotes',
        )}`}
        accion={
          <button className="btn btn-fantasma btn-chico" onClick={alVolver}>
            ← Volver
          </button>
        }
      />

      <Aviso icono="🔥" titulo="Los ingredientes ya se descontaron">
        Salieron de la despensa cuando se liberó esta producción. Aquí solo se registra cuánto
        producto salió, para que entre al stock.
      </Aviso>

      <Tarjeta titulo="Ingredientes que salieron">
        <div className="lista">
          {produccion.consumos.map((c) => {
            const insumo = db.insumos.find((i) => i.id === c.insumoId)
            if (!insumo) return null
            return (
              <div key={c.insumoId} className="fila">
                <div className="fila-cuerpo">
                  <span className="fila-titulo">{insumo.nombre}</span>
                  <span className="fila-sub">
                    {Math.abs(c.real - c.teorico) > 0.0001
                      ? `Receta: ${fmtCantidad(c.teorico, insumo.unidad)} · ajustado al liberar`
                      : 'Según receta'}
                  </span>
                </div>
                <div className="fila-fin">
                  <span className="n">{fmtCantidad(c.real, insumo.unidad)}</span>
                  <span className="s">{bs(c.real * costoUnitario(insumo))}</span>
                </div>
              </div>
            )
          })}
        </div>
        {produccion.consumosComponente && produccion.consumosComponente.length > 0 && (
          <>
            <div className="entre" style={{ padding: '.65rem 1rem .25rem' }}>
              <span className="eyebrow">Preparaciones usadas</span>
            </div>
            <div className="lista">
              {produccion.consumosComponente.map((cc) => {
                const rc = db.recetas.find((x) => x.id === cc.recetaId)
                return (
                  <div key={cc.recetaId} className="fila">
                    <div className="fila-cuerpo">
                      <span className="fila-titulo">{rc?.nombre ?? 'Receta borrada'}</span>
                      <span className="fila-sub">Ya estaba preparado · salió de su propio stock</span>
                    </div>
                    <div className="fila-fin">
                      <span className="n">{num(cc.lotes, 2)}</span>
                      <span className="s">lotes</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Cómo salió" pad>
        <div className="pila">
          <div className="fila-campos">
            <div className="campo">
              <label>{esGalleta ? 'Galletas buenas' : 'Lotes buenos'}</label>
              <Contador valor={producido} alCambiar={setProducido} max={9999} />
              <span className="ayuda">
                {producido === esperado
                  ? 'Igual a lo esperado.'
                  : producido > esperado
                    ? `${producido - esperado} más de lo esperado.`
                    : `${esperado - producido} menos de lo esperado.`}
              </span>
            </div>
            <div className="campo">
              <label>Merma</label>
              <Contador valor={merma} alCambiar={setMerma} max={9999} />
              <span className="ayuda">{esGalleta ? 'Quemadas o rotas.' : 'Estropeada o descartada.'} No entran al stock.</span>
            </div>
          </div>

          <div className="campo">
            <label htmlFor="nota-cierre">Nota</label>
            <input
              id="nota-cierre"
              className="input"
              placeholder="Opcional: qué pasó con este lote"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>

          <div className="entre">
            <span className="mini silencio">Costo de los ingredientes de esta producción</span>
            <span className="n" style={{ fontWeight: 640 }}>
              {bs(costo)}
            </span>
          </div>
          {producido > 0 && (
            <div className="entre">
              <span className="mini silencio">Costo por {esGalleta ? 'galleta' : 'lote'} que salió</span>
              <span className="n" style={{ fontWeight: 640 }}>
                {bs(costo / producido)}
              </span>
            </div>
          )}
          {merma > 0 && (
            <div className="entre">
              <span className="mini" style={{ color: 'var(--warn)' }}>
                Se perdió en merma
              </span>
              <span className="n" style={{ fontWeight: 640, color: 'var(--warn)' }}>
                {bs((costo / Math.max(1, producido + merma)) * merma)}
              </span>
            </div>
          )}
        </div>
      </Tarjeta>

      <button
        className="btn btn-primario btn-grande"
        disabled={guardando || producido + merma === 0}
        onClick={() => void alCompletar(producido, merma, nota)}
      >
        {guardando
          ? 'Guardando…'
          : `Completar con ${plural(
              producido,
              esGalleta ? 'galleta' : 'lote',
              esGalleta ? 'galletas' : 'lotes',
            )}`}
      </button>

      <p className="mini silencio centrado" style={{ marginTop: '-.3rem' }}>
        Entran {plural(producido, esGalleta ? 'galleta' : 'lote', esGalleta ? 'galletas' : 'lotes')}{' '}
        al stock. Los ingredientes no se vuelven a descontar.
      </p>
    </>
  )
}

function redondear(v: number): number {
  return Math.round(v * 100) / 100
}

// Label de título de sección para cada tipo de componente, en mayúsculas.
// Las recetas viejas sin `tipo` se leen como 'galleta' (grupo directo).
function etiquetaTipo(tipo: TipoReceta): string {
  return TIPOS_RECETA.find((t) => t.id === tipo)?.label.toUpperCase() ?? tipo.toUpperCase()
}
