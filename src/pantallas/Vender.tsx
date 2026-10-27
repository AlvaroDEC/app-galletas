import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import { costoPresentacion, esVendible, stockDe, totalVenta } from '../lib/calc'
import {
  CANALES,
  MEDIOS_PAGO,
  type Canal,
  type Insumo,
  type MedioPago,
  type Pedido,
  type VentaItem,
} from '../lib/types'
import { bs, fmtCantidad, fmtHora, plural } from '../lib/units'
import {
  Aviso,
  Cabecera,
  Campo,
  Contador,
  Hoja,
  InputNumero,
  Pildora,
  Segmento,
  Tarjeta,
  Vacio,
} from '../componentes/ui'

/** Cuántas galletas de cada variedad se lleva este pedido. */
function unidadesPorReceta(items: VentaItem[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const it of items) m[it.recetaId] = (m[it.recetaId] ?? 0) + it.unidades
  return m
}

export function PantallaVender({ ir, foco }: PropsPantalla) {
  const { db, stocks, abrirPedido, guardarPedido, descartarPedido, cobrarPedido, guardando } =
    useDatos()
  const [activoId, setActivoId] = useState<string | null>(null)
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  const [nombrando, setNombrando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [direccion, setDireccion] = useState<'der' | 'izq' | null>(null)
  const [ultima, setUltima] = useState<{ cliente: string; total: number; cuando: string } | null>(
    null,
  )

  const recetas = db.recetas.filter(esVendible)

  // El más viejo primero: las pestañas no se reordenan solas mientras se vende.
  const pedidos = useMemo(
    () => [...db.pedidos].sort((a, b) => a.abiertoEl.localeCompare(b.abiertoEl)),
    [db.pedidos],
  )

  // Si el pedido activo se cobró o se descartó, se cae al primero que quede.
  const activo = pedidos.find((p) => p.id === activoId) ?? pedidos[0] ?? null

  /** Guarda el pedido activo con un cambio encima. Cada acción se persiste. */
  const actualizar = (cambio: Partial<Pedido>) => {
    if (!activo) return
    void guardarPedido({ ...activo, ...cambio })
  }

  // Llegar desde Hoy con una receta en la mano abre esa presentación sobre el
  // pedido activo. Si todavía no hay ninguno, se abre uno de mostrador.
  const focoUsado = useRef<string | null>(null)
  useEffect(() => {
    if (!foco || focoUsado.current === foco) return
    focoUsado.current = foco
    if (pedidos.length > 0) {
      setEligiendo(foco)
      return
    }
    void abrirPedido('Mostrador').then((idNuevo) => {
      setActivoId(idNuevo)
      setEligiendo(foco)
    })
    // Se dispara una sola vez por foco; `focoUsado` evita repetirlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco])

  const items = activo?.items ?? []
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnit, 0)
  const total = activo ? Math.max(0, totalVenta(activo)) : 0

  const costo = useMemo(
    () =>
      items.reduce((s, it) => {
        const r = db.recetas.find((x) => x.id === it.recetaId)
        const p = db.presentaciones.find((x) => x.id === it.presentacionId)
        return r && p ? s + it.cantidad * costoPresentacion(p, r, db) : s
      }, 0),
    [items, db],
  )

  // El stock es uno solo. Un pedido abierto no reserva galletas en el almacén,
  // pero sí se las quita a los demás pedidos: si María ya tiene 10 de las 12
  // que hay, la Sra. Rojas puede pedir 2, no 12.
  const enEste = useMemo(() => unidadesPorReceta(items), [items])
  const enOtros = useMemo(() => {
    const otros = pedidos.filter((p) => p.id !== activo?.id).flatMap((p) => p.items)
    return unidadesPorReceta(otros)
  }, [pedidos, activo?.id])

  const libresDe = (recetaId: string) =>
    stockDe(stocks, 'galleta', recetaId) - (enEste[recetaId] ?? 0) - (enOtros[recetaId] ?? 0)

  // Lo que bloquea el cobro: que ESTE pedido pida más galletas de las que hay.
  // Se mide solo contra el stock real, no contra los otros pedidos: cobrar el de
  // María no puede quedar trabado porque el de Rojas se pasó de la raya.
  const excedidas = recetas
    .map((r) => ({ receta: r, faltan: (enEste[r.id] ?? 0) - stockDe(stocks, 'galleta', r.id) }))
    .filter((x) => x.faltan > 0)

  // Lo que solo se avisa: entre todos los pedidos abiertos se prometió más de lo
  // que hay. Pasa si el stock bajó desde otro dispositivo mientras se armaban.
  const sobrecomprometidas = recetas
    .map((r) => ({ receta: r, faltan: -libresDe(r.id) }))
    .filter((x) => x.faltan > 0)

  // El empaque también sale del stock, pero no bloquea la venta: quedarse sin
  // etiquetas en plena feria no puede impedir cobrar. Se avisa y nada más.
  const empaqueCorto = useMemo(() => {
    const necesario: Record<string, number> = {}
    for (const it of items) {
      const p = db.presentaciones.find((x) => x.id === it.presentacionId)
      if (!p) continue
      for (const e of p.empaque) {
        necesario[e.insumoId] = (necesario[e.insumoId] ?? 0) + e.cantidad * it.cantidad
      }
    }
    return Object.entries(necesario)
      .map(([insumoId, cant]) => ({
        insumo: db.insumos.find((i) => i.id === insumoId),
        falta: cant - stockDe(stocks, 'insumo', insumoId),
      }))
      .filter((x): x is { insumo: Insumo; falta: number } => !!x.insumo && x.falta > 0.0001)
  }, [items, db, stocks])

  const cobrar = async () => {
    // La misma condición que apaga el botón, repetida aquí a propósito: es la
    // última puerta antes de escribir movimientos negativos en el stock.
    if (!activo || items.length === 0 || excedidas.length > 0) return
    const cliente = activo.cliente
    await cobrarPedido(activo.id)
    setUltima({ cliente, total, cuando: new Date().toISOString() })
    setActivoId(null)
  }

  const recetaEligiendo = recetas.find((r) => r.id === eligiendo) ?? null

  return (
    <div className="pantalla-vender">
      <Cabecera
        titulo="Vender"
        bajada="Cada cliente lleva su propio pedido. Al cobrar se descuenta del stock de galletas y del empaque."
      />

      {ultima && (
        <Aviso tono="acento" icono="✅" titulo="Venta registrada">
          Cobró {bs(ultima.total)} a {ultima.cliente} a las {fmtHora(ultima.cuando)}. El stock ya
          quedó actualizado.
        </Aviso>
      )}

      {pedidos.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="🧾"
            titulo="No hay pedidos abiertos"
            detalle="Abra un pedido a nombre del cliente y vaya cargando lo que se lleva."
            accion={
              <button className="btn btn-primario btn-grande" onClick={() => setNombrando(true)}>
                Nuevo pedido
              </button>
            }
          />
        </Tarjeta>
      ) : (
        <Tarjeta
          titulo={
            pedidos.length === 1 ? 'Pedido abierto' : `Pedidos abiertos (${pedidos.length})`
          }
          extra={
            activo && (
              <button
                className="btn btn-chico btn-fantasma"
                onClick={() => {
                  // Un pedido vacío no tiene nada que perder: se cierra y ya.
                  if (activo.items.length === 0) void descartarPedido(activo.id)
                  else setDescartando(true)
                }}
              >
                Descartar
              </button>
            )
          }
          pad
        >
          <div className="segmento" role="group" aria-label="Pedidos abiertos">
            {pedidos.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === activo?.id}
                onClick={() => {
                  if (activo && p.id !== activo.id) {
                    setDireccion(
                      pedidos.findIndex((x) => x.id === p.id) > pedidos.findIndex((x) => x.id === activo.id)
                        ? 'der'
                        : 'izq',
                    )
                  }
                  setActivoId(p.id)
                  setUltima(null)
                }}
              >
                {p.cliente}
                {p.items.length > 0 ? ` · ${bs(Math.max(0, totalVenta(p)))}` : ''}
              </button>
            ))}
            <button type="button" aria-label="Abrir otro pedido" onClick={() => setNombrando(true)}>
              + Otro pedido
            </button>
          </div>
        </Tarjeta>
      )}

      {activo && (
        <div
          key={activo.id}
          className={
            direccion
              ? `insumos-slide ${direccion === 'der' ? 'entra-der' : 'entra-izq'}`
              : 'insumos-slide'
          }
        >
          <Tarjeta titulo="Galletas disponibles">
            {recetas.length === 0 ? (
              <Vacio icono="📋" titulo="No hay recetas" detalle="Registre una receta primero." />
            ) : (
              <div className="lista">
                {recetas.map((r) => {
                  const disponible = stockDe(stocks, 'galleta', r.id)
                  const aqui = enEste[r.id] ?? 0
                  const otros = enOtros[r.id] ?? 0
                  const libres = libresDe(r.id)
                  return (
                    <button
                      key={r.id}
                      className="fila"
                      disabled={libres <= 0 && aqui === 0}
                      style={libres <= 0 && aqui === 0 ? { opacity: 0.5 } : undefined}
                      onClick={() => setEligiendo(r.id)}
                    >
                      <span className="avatar" aria-hidden="true">
                        {r.emoji}
                      </span>
                      <div className="fila-cuerpo">
                        <span className="fila-titulo">
                          {r.nombre}
                          {aqui > 0 && <Pildora tono="acento">{aqui} en este pedido</Pildora>}
                        </span>
                        <span className="fila-sub">
                          {disponible <= 0
                            ? 'Sin stock — hay que producir'
                            : otros > 0
                              ? `${disponible} listas · ${otros} en otros pedidos · ${Math.max(0, libres)} libres`
                              : plural(disponible, 'lista para vender', 'listas para vender')}
                        </span>
                      </div>
                      <div className="fila-fin">
                        <span className="n">{Math.max(0, libres)}</span>
                        <span className="s">libres</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Tarjeta>

          {items.length > 0 && (
            <Tarjeta
              titulo={`Lo que se lleva ${activo.cliente}`}
              extra={
                <button className="btn btn-chico btn-fantasma" onClick={() => actualizar({ items: [] })}>
                  Vaciar
                </button>
              }
            >
              <div className="lista">
                {items.map((it, idx) => {
                  const r = db.recetas.find((x) => x.id === it.recetaId)
                  const p = db.presentaciones.find((x) => x.id === it.presentacionId)
                  return (
                    <div key={`${it.presentacionId}_${idx}`} className="fila">
                      <div className="fila-cuerpo">
                        <span className="fila-titulo">
                          {r?.emoji} {r?.nombre} · {p?.nombre}
                        </span>
                        <span className="fila-sub">
                          {it.cantidad} × {bs(it.precioUnit)} ·{' '}
                          {plural(it.unidades, 'galleta', 'galletas')}
                        </span>
                      </div>
                      <div className="fila-fin">
                        <span className="n">{bs(it.cantidad * it.precioUnit)}</span>
                        <button
                          className="btn btn-chico btn-fantasma"
                          onClick={() => actualizar({ items: items.filter((_, i) => i !== idx) })}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="tarjeta-pad pila">
                <div className="fila-campos">
                  <Campo etiqueta="Canal">
                    <select
                      className="select"
                      value={activo.canal}
                      onChange={(e) => actualizar({ canal: e.target.value as Canal })}
                    >
                      {CANALES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Cómo paga">
                    <Segmento
                      valor={activo.medioPago}
                      alCambiar={(v: MedioPago) => actualizar({ medioPago: v })}
                      opciones={MEDIOS_PAGO}
                    />
                  </Campo>
                  <CampoDescuento pedido={activo} subtotal={subtotal} alGuardar={actualizar} />
                </div>

                <div className="entre">
                  <span className="silencio">Subtotal</span>
                  <span className="n">{bs(subtotal)}</span>
                </div>
                {activo.descuento > 0 && (
                  <div className="entre">
                    <span className="silencio">Descuento</span>
                    <span className="n" style={{ color: 'var(--crit)' }}>
                      −{bs(activo.descuento)}
                    </span>
                  </div>
                )}
                <div className="entre" style={{ fontSize: '1.15rem', fontWeight: 660 }}>
                  <span>Total</span>
                  <span className="n">{bs(total)}</span>
                </div>
                <div className="entre mini silencio">
                  <span>Le queda después de ingredientes y empaque</span>
                  <span className="n">{bs(total - costo)}</span>
                </div>
              </div>
            </Tarjeta>
          )}

          {excedidas.length > 0 && (
            <Aviso tono="crit" icono="⛔" titulo="La cantidad supera el stock disponible">
              {excedidas.map((x) => (
                <span key={x.receta.id} style={{ display: 'block' }}>
                  {x.receta.nombre}: {plural(x.faltan, 'galleta de más', 'galletas de más')}.
                </span>
              ))}
              Quite esas unidades del pedido o complete la producción antes de cobrar.
            </Aviso>
          )}

          {excedidas.length === 0 && sobrecomprometidas.length > 0 && (
            <Aviso tono="warn" icono="⚠️" titulo="Los pedidos abiertos suman más de lo que hay">
              {sobrecomprometidas
                .map((x) => `${x.receta.nombre}: faltan ${x.faltan}`)
                .join(' · ')}
              . Este pedido se puede cobrar igual, pero alguno de los otros va a quedar sin
              galletas.
            </Aviso>
          )}

          {empaqueCorto.length > 0 && (
            <Aviso tono="warn" icono="⚠️" titulo="Falta empaque para esta venta">
              {empaqueCorto
                .map((x) => `${x.insumo.nombre}: faltan ${fmtCantidad(x.falta, x.insumo.unidad)}`)
                .join(' · ')}
              . La venta se puede cobrar igual; el stock de empaque va a quedar en negativo hasta
              que registre la compra.
            </Aviso>
          )}

          {items.length > 0 && (
            <button
              className="btn btn-primario btn-grande"
              disabled={guardando || excedidas.length > 0}
              onClick={() => void cobrar()}
            >
              {guardando
                ? 'Guardando…'
                : excedidas.length > 0
                  ? 'No alcanzan las galletas'
                  : `Cobrar a ${activo.cliente} · ${bs(total)}`}
            </button>
          )}

          {items.length === 0 && (
            <Aviso icono="🧾" titulo="Sin factura, a propósito">
              La app registra la venta para su control interno: cuánto entró, por qué canal y con
              qué margen. No emite factura ni maneja impuestos.{' '}
              <button className="btn btn-chico btn-fantasma" onClick={() => ir('reportes')}>
                Ver reportes
              </button>
            </Aviso>
          )}
        </div>
      )}

      {descartando && activo && (
        <Hoja
          titulo="¿Seguro?"
          alCerrar={() => setDescartando(false)}
          pie={
            <>
              <button className="btn" onClick={() => setDescartando(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-peligro"
                disabled={guardando}
                onClick={async () => {
                  await descartarPedido(activo.id)
                  setDescartando(false)
                }}
              >
                Sí, descartar
              </button>
            </>
          }
        >
          <Aviso tono="crit" icono="⚠️" titulo={`Se pierde el pedido de ${activo.cliente}`}>
            Tiene {plural(activo.items.length, 'línea cargada', 'líneas cargadas')} por{' '}
            {bs(total)}. El stock no se toca: el pedido nunca lo descontó.
          </Aviso>
        </Hoja>
      )}

      {nombrando && (
        <HojaNuevoPedido
          alCerrar={() => setNombrando(false)}
          alAbrir={(cliente) => {
            setNombrando(false)
            setUltima(null)
            void abrirPedido(cliente).then(setActivoId)
          }}
        />
      )}

      {recetaEligiendo && activo && (
        <HojaPresentacion
          recetaId={recetaEligiendo.id}
          enEstePedido={enEste[recetaEligiendo.id] ?? 0}
          enOtrosPedidos={enOtros[recetaEligiendo.id] ?? 0}
          alCerrar={() => setEligiendo(null)}
          alAgregar={(item) => {
            actualizar({ items: [...items, item] })
            setEligiendo(null)
            setUltima(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * El descuento se escribe dígito a dígito, así que no se persiste por tecla:
 * se guarda al salir del campo. El estado local arranca del pedido y se
 * rearma solo cuando se cambia de pestaña.
 */
function CampoDescuento({
  pedido,
  subtotal,
  alGuardar,
}: {
  pedido: Pedido
  subtotal: number
  alGuardar: (cambio: Partial<Pedido>) => void
}) {
  const [valor, setValor] = useState(pedido.descuento)
  useEffect(() => {
    setValor(pedido.descuento)
    // Solo al cambiar de pedido: si dependiera del monto, borraría lo tecleado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id])

  const confirmar = () => {
    const limpio = Math.min(subtotal, Math.max(0, valor))
    setValor(limpio)
    if (Math.abs(limpio - pedido.descuento) > 0.0001) alGuardar({ descuento: limpio })
  }

  return (
    <Campo etiqueta="Descuento (Bs)">
      <InputNumero
        className="input num"
        valor={valor}
        alCambiar={(numero) => setValor(numero)}
        onBlur={confirmar}
      />
    </Campo>
  )
}

function HojaNuevoPedido({
  alCerrar,
  alAbrir,
}: {
  alCerrar: () => void
  alAbrir: (cliente: string) => void
}) {
  // Precargado con "Mostrador": en plena feria, abrir un pedido es un toque.
  const [cliente, setCliente] = useState('Mostrador')

  return (
    <Hoja
      titulo="Nuevo pedido"
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={() => alAbrir(cliente)}>
            Abrir pedido
          </button>
        </>
      }
    >
      <Campo
        etiqueta="A nombre de quién"
        ayuda="Como lo reconoce en el momento: un nombre, un apodo, o déjelo en Mostrador."
      >
        <input
          className="input"
          value={cliente}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setCliente(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') alAbrir(cliente)
          }}
        />
      </Campo>
    </Hoja>
  )
}

function HojaPresentacion({
  recetaId,
  enEstePedido,
  enOtrosPedidos,
  alCerrar,
  alAgregar,
}: {
  recetaId: string
  /** Galletas de esta variedad ya cargadas en el pedido activo. */
  enEstePedido: number
  /** Galletas de esta variedad comprometidas en los demás pedidos abiertos. */
  enOtrosPedidos: number
  alCerrar: () => void
  alAgregar: (i: VentaItem) => void
}) {
  const { db, stocks } = useDatos()
  const receta = db.recetas.find((r) => r.id === recetaId)!
  const presentaciones = db.presentaciones.filter((p) => p.recetaId === recetaId)
  const [presId, setPresId] = useState(presentaciones[0]?.id ?? '')
  const [cantidad, setCantidad] = useState(1)
  const pres = presentaciones.find((p) => p.id === presId)
  const [precio, setPrecio] = useState(pres?.precio ?? 0)
  const disponible = stockDe(stocks, 'galleta', recetaId)
  // El stock es uno solo: lo que ya prometió otro pedido no se puede volver a vender.
  const restante = Math.max(0, disponible - enEstePedido - enOtrosPedidos)

  const elegir = (id: string) => {
    setPresId(id)
    const p = presentaciones.find((x) => x.id === id)
    if (p) setPrecio(p.precio)
  }

  if (!pres) {
    return (
      <Hoja titulo={receta.nombre} alCerrar={alCerrar}>
        <Vacio
          icono="🏷️"
          titulo="Esta receta no tiene presentaciones"
          detalle="Edite la receta y agregue al menos una forma de venderla."
        />
      </Hoja>
    )
  }

  const galletas = pres.unidades * cantidad
  const excede = galletas > restante

  const reparto = [
    `${disponible} ${disponible === 1 ? 'lista' : 'listas'}`,
    enOtrosPedidos > 0 ? `${enOtrosPedidos} en otros pedidos` : null,
    enEstePedido > 0 ? `${enEstePedido} en este pedido` : null,
    `${restante} ${restante === 1 ? 'libre' : 'libres'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Hoja
      titulo={`${receta.emoji} ${receta.nombre}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            className="btn btn-primario"
            disabled={cantidad <= 0 || excede}
            onClick={() =>
              alAgregar({
                recetaId,
                presentacionId: pres.id,
                cantidad,
                precioUnit: precio,
                unidades: galletas,
              })
            }
          >
            Agregar {bs(cantidad * precio)}
          </button>
        </>
      }
    >
      <Campo etiqueta="Presentación">
        <div className="segmento">
          {presentaciones.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === presId} onClick={() => elegir(p.id)}>
              {p.nombre} · {bs(p.precio)}
            </button>
          ))}
        </div>
      </Campo>

      <Campo etiqueta="Cuántas" ayuda={`Son ${plural(galletas, 'galleta', 'galletas')}. ${reparto}.`}>
        <Contador valor={cantidad} alCambiar={setCantidad} min={1} max={999} />
      </Campo>

      <Campo
        etiqueta="Precio por unidad (Bs)"
        ayuda={
          Math.abs(precio - pres.precio) > 0.005
            ? `El precio de lista es ${bs(pres.precio)}. Este cambio vale solo para esta venta.`
            : 'Puede cambiarlo si hace un precio especial.'
        }
      >
        <InputNumero
          className="input num"
          valor={precio}
          alCambiar={(numero) => setPrecio(Math.max(0, numero))}
        />
      </Campo>

      {excede && (
        <Aviso tono="crit" icono="⛔" titulo="La cantidad supera el stock disponible">
          {restante === 0
            ? disponible === 0
              ? 'No quedan galletas de esta variedad. Complete una producción primero.'
              : enOtrosPedidos > 0
                ? `Las ${disponible} galletas de esta variedad ya están repartidas entre los pedidos abiertos.`
                : `Las ${disponible} galletas de esta variedad ya están en este pedido.`
            : `Solo hay ${restante} ${restante === 1 ? 'galleta libre' : 'galletas libres'} de esta variedad. Baje la cantidad o elija una presentación más chica.`}
        </Aviso>
      )}
    </Hoja>
  )
}
