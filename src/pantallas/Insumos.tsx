import { useEffect, useMemo, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import { costoUnitario, estadoInsumo, stockDe } from '../lib/calc'
import { CATEGORIAS, type CategoriaInsumo, type Insumo } from '../lib/types'
import { bs, diasHasta, fmtCantidad, id as nuevoId, num } from '../lib/units'
import {
  Aviso,
  Cabecera,
  Campo,
  Hoja,
  InputNumero,
  Nivel,
  Pildora,
  Segmento,
  Stat,
  Tarjeta,
  Vacio,
} from '../componentes/ui'

type Filtro = 'todos' | CategoriaInsumo

const FILTROS: Filtro[] = ['todos', ...CATEGORIAS.map((c) => c.id as CategoriaInsumo)]

export function PantallaInsumos({ foco }: PropsPantalla) {
  const { db, stocks, registrarCompra, guardarInsumo, borrarInsumo, guardando } = useDatos()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  // Hacia dónde se va moviendo el filtro: el contenido entra deslizándose
  // desde el lado hacia el que se avanza. Nulo en la primera carga.
  const [direccion, setDireccion] = useState<'der' | 'izq' | null>(null)
  const [abierto, setAbierto] = useState<string | null>(foco)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    if (foco) setAbierto(foco)
  }, [foco])

  const activos = db.insumos.filter((i) => i.activo)

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return activos
      .filter((i) => filtro === 'todos' || i.categoria === filtro)
      .filter((i) => !q || i.nombre.toLowerCase().includes(q))
      .map((i) => ({ insumo: i, stock: stockDe(stocks, 'insumo', i.id) }))
      .sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre))
  }, [activos, filtro, busqueda, stocks])

  // Los que hay que reponer van en su propia tarjeta, arriba: es lo único que
  // obliga a hacer algo hoy. El resto queda abajo, en la lista completa.
  const reponer = lista.filter(({ insumo, stock }) => estadoInsumo(insumo, stock) !== 'ok')
  const resto = lista.filter(({ insumo, stock }) => estadoInsumo(insumo, stock) === 'ok')

  // El filtro de categoría no puede esconder un faltante sin avisar: si hay
  // insumos por reponer fuera de la categoría elegida, se dice cuántos.
  const reponerEnOtras = useMemo(() => {
    if (filtro === 'todos') return 0
    const q = busqueda.trim().toLowerCase()
    return activos.filter(
      (i) =>
        i.categoria !== filtro &&
        (!q || i.nombre.toLowerCase().includes(q)) &&
        estadoInsumo(i, stockDe(stocks, 'insumo', i.id)) !== 'ok',
    ).length
  }, [activos, filtro, busqueda, stocks])

  const valorInventario = activos.reduce(
    (s, i) => s + stockDe(stocks, 'insumo', i.id) * costoUnitario(i),
    0,
  )
  const enFalta = activos.filter(
    (i) => estadoInsumo(i, stockDe(stocks, 'insumo', i.id)) !== 'ok',
  ).length

  const insumoAbierto = db.insumos.find((i) => i.id === abierto) ?? null

  // Una sola definición de fila para las dos tarjetas: si cambia el diseño,
  // cambia en los dos lugares a la vez.
  const filaInsumo = ({ insumo, stock }: { insumo: Insumo; stock: number }) => {
    const estado = estadoInsumo(insumo, stock)
    const tope = Math.max(insumo.stockMinimo * 3, insumo.contenido, 1)
    const dias = insumo.venceEl ? diasHasta(insumo.venceEl) : null
    return (
      <button key={insumo.id} className="fila" onClick={() => setAbierto(insumo.id)}>
        <div className="fila-cuerpo">
          <span className="fila-titulo">
            {insumo.nombre}
            {estado === 'agotado' && <Pildora tono="critica">Agotado</Pildora>}
            {estado === 'bajo' && <Pildora tono="warn">Queda poco</Pildora>}
            {dias !== null && dias <= 7 && (
              <Pildora tono={dias < 0 ? 'critica' : 'warn'}>
                {dias < 0 ? 'Vencido' : dias === 0 ? 'Vence hoy' : `Vence en ${dias} d`}
              </Pildora>
            )}
          </span>
          <span className="fila-sub">
            {insumo.presentacion} · {bs(insumo.precio)} · mínimo{' '}
            {fmtCantidad(insumo.stockMinimo, insumo.unidad)}
          </span>
          <Nivel
            porcentaje={(stock / tope) * 100}
            tono={estado === 'agotado' ? 'critica' : estado === 'bajo' ? 'aviso' : 'ok'}
          />
        </div>
        <div className="fila-fin">
          <span className="n">{fmtCantidad(stock, insumo.unidad)}</span>
          <span className="s">{bs(stock * costoUnitario(insumo))}</span>
        </div>
      </button>
    )
  }

  return (
    <>
      <Cabecera
        titulo="Insumos"
        bajada="Todo lo que entra a la despensa. Se compra por presentación y la app lo convierte."
        accion={
          <button className="btn btn-chico" onClick={() => setCreando(true)}>
            + Nuevo
          </button>
        }
      />

      <div className="rejilla rejilla-3">
        <Stat rotulo="Valor en despensa" valor={bs(valorInventario)} pie="Al precio de compra" acento />
        <Stat
          rotulo="Hay que reponer"
          valor={enFalta}
          pie={enFalta === 0 ? 'Todo por encima del mínimo' : 'Insumos bajos o agotados'}
        />
        <Stat rotulo="Insumos activos" valor={activos.length} pie={`${db.insumos.length - activos.length} desactivados`} />
      </div>

      <div className="pila-chica">
        <input
          className="input"
          type="search"
          placeholder="Buscar insumo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Segmento
          valor={filtro}
          alCambiar={(nuevo) => {
            const viejo = FILTROS.indexOf(filtro)
            const siguiente = FILTROS.indexOf(nuevo)
            if (viejo !== -1 && siguiente !== -1 && siguiente !== viejo) {
              setDireccion(siguiente > viejo ? 'der' : 'izq')
            }
            setFiltro(nuevo)
          }}
          opciones={[{ id: 'todos' as Filtro, label: 'Todos' }, ...CATEGORIAS.map((c) => ({ id: c.id as Filtro, label: c.label }))]}
        />
      </div>

      <div
        key={filtro}
        className={
          direccion
            ? `insumos-slide ${direccion === 'der' ? 'entra-der' : 'entra-izq'}`
            : 'insumos-slide'
        }
      >
        {(reponer.length > 0 || reponerEnOtras > 0) && (
          <Tarjeta key={`reponer-${filtro}-${busqueda}`} titulo={`Hay que reponer (${reponer.length + reponerEnOtras})`}>
            <div className="lista">
              {reponer.map(filaInsumo)}
              {reponerEnOtras > 0 && (
                <div className="fila">
                  <div className="fila-cuerpo">
                    <span className="fila-sub">
                      Hay {reponerEnOtras} más para reponer en otras categorías.
                    </span>
                  </div>
                  <div className="fila-fin">
                    <button className="btn btn-chico btn-fantasma" onClick={() => setFiltro('todos')}>
                      Ver todos
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Tarjeta>
        )}

        {lista.length === 0 ? (
          <Tarjeta key={`vacio-${filtro}-${busqueda}`}>
            <Vacio
              icono="🧺"
              titulo="No hay insumos aquí"
              detalle="Pruebe con otro filtro o registre uno nuevo."
            />
          </Tarjeta>
        ) : resto.length > 0 ? (
          <Tarjeta
            key={`resto-${filtro}-${busqueda}`}
            titulo={
              reponer.length > 0
                ? 'El resto de los insumos'
                : filtro === 'todos'
                  ? 'Todos los insumos'
                  : CATEGORIAS.find((c) => c.id === filtro)?.label ?? 'Insumos'
            }
          >
            <div className="lista">{resto.map(filaInsumo)}</div>
          </Tarjeta>
        ) : null}
      </div>

      <Aviso icono="📦" titulo="Por qué se compra “por presentación”">
        Nadie compra 1.000 gramos de harina: compra una bolsa. Usted registra la bolsa y la app la
        traduce a gramos para poder descontarla de las recetas. Si cambia el tamaño de la bolsa,
        se corrige en la ficha del insumo.
      </Aviso>

      {insumoAbierto && (
        <HojaInsumo
          insumo={insumoAbierto}
          stock={stockDe(stocks, 'insumo', insumoAbierto.id)}
          guardando={guardando}
          alCerrar={() => setAbierto(null)}
          alComprar={async (cantidad, precioTotal, venceEl) => {
            await registrarCompra({ insumoId: insumoAbierto.id, cantidad, precioTotal, venceEl })
            setAbierto(null)
          }}
          alGuardar={async (i) => {
            await guardarInsumo(i)
            setAbierto(null)
          }}
          alDesactivar={async () => {
            await borrarInsumo(insumoAbierto.id)
            setAbierto(null)
          }}
        />
      )}

      {creando && (
        <HojaInsumo
          insumo={{
            id: nuevoId('ins'),
            nombre: '',
            categoria: 'seco',
            unidad: 'g',
            presentacion: 'Bolsa 1 kg',
            contenido: 1000,
            precio: 0,
            stockMinimo: 0,
            perecedero: false,
            venceEl: null,
            activo: true,
          }}
          stock={0}
          esNuevo
          guardando={guardando}
          alCerrar={() => setCreando(false)}
          alComprar={async () => {}}
          alGuardar={async (i) => {
            await guardarInsumo(i)
            setCreando(false)
          }}
          alDesactivar={async () => {}}
        />
      )}
    </>
  )
}

function HojaInsumo({
  insumo,
  stock,
  esNuevo = false,
  guardando,
  alCerrar,
  alComprar,
  alGuardar,
  alDesactivar,
}: {
  insumo: Insumo
  stock: number
  esNuevo?: boolean
  guardando: boolean
  alCerrar: () => void
  alComprar: (cantidad: number, precioTotal: number, venceEl: string | null) => Promise<void>
  alGuardar: (i: Insumo) => Promise<void>
  alDesactivar: () => Promise<void>
}) {
  const [pestana, setPestana] = useState<'comprar' | 'editar'>(esNuevo ? 'editar' : 'comprar')
  const [borrador, setBorrador] = useState<Insumo>(insumo)
  const [cantidad, setCantidad] = useState(1)
  const [precioTotal, setPrecioTotal] = useState(insumo.precio)
  const [vence, setVence] = useState<string>(insumo.venceEl ?? '')

  const precioUnitarioNuevo = cantidad > 0 ? precioTotal / cantidad : 0
  const cambioPrecio = Math.abs(precioUnitarioNuevo - insumo.precio) > 0.005

  return (
    <Hoja
      titulo={esNuevo ? 'Nuevo insumo' : insumo.nombre}
      alCerrar={alCerrar}
      pie={
        pestana === 'comprar' ? (
          <>
            <button className="btn" onClick={alCerrar}>
              Cancelar
            </button>
            <button
              className="btn btn-primario"
              disabled={guardando || cantidad <= 0}
              onClick={() => void alComprar(cantidad, precioTotal, vence || null)}
            >
              Guardar entrada
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={alCerrar}>
              Cancelar
            </button>
            <button
              className="btn btn-primario"
              disabled={guardando || !borrador.nombre.trim() || borrador.contenido <= 0}
              onClick={() => void alGuardar({ ...borrador, venceEl: borrador.venceEl || null })}
            >
              Guardar
            </button>
          </>
        )
      }
    >
      {!esNuevo && (
        <>
          <div className="entre">
            <div>
              <div className="eyebrow">En despensa</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 650 }} className="n">
                {fmtCantidad(stock, insumo.unidad)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow">Vale</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 650 }} className="n">
                {bs(stock * costoUnitario(insumo))}
              </div>
            </div>
          </div>
          <Segmento
            valor={pestana}
            alCambiar={setPestana}
            opciones={[
              { id: 'comprar' as const, label: 'Cargar compra' },
              { id: 'editar' as const, label: 'Editar ficha' },
            ]}
          />
        </>
      )}

      {pestana === 'comprar' && !esNuevo && (
        <>
          <Campo
            etiqueta={`¿Cuántas veces "${insumo.presentacion}"?`}
            ayuda={`Entran ${fmtCantidad(cantidad * insumo.contenido, insumo.unidad)} a la despensa.`}
          >
            <InputNumero
              className="input num"
              valor={cantidad}
              alCambiar={(numero) => {
                const v = Math.max(0, numero)
                setCantidad(v)
                setPrecioTotal(Math.round(v * insumo.precio * 100) / 100)
              }}
            />
          </Campo>

          <Campo etiqueta="Monto total pagado (Bs)" ayuda={`Sale a ${bs(precioUnitarioNuevo)} cada ${insumo.presentacion.toLowerCase()}.`}>
            <InputNumero
              className="input num"
              valor={precioTotal}
              alCambiar={(numero) => setPrecioTotal(Math.max(0, numero))}
            />
          </Campo>

          {cambioPrecio && cantidad > 0 && (
            <Aviso tono="warn" icono="💰" titulo="El precio cambió">
              Antes pagaba {bs(insumo.precio)} y ahora {bs(precioUnitarioNuevo)}. Esta entrada se
              guarda igual, pero el costo de las galletas sigue usando {bs(insumo.precio)} hasta que
              lo actualice en “Editar ficha”.
            </Aviso>
          )}

          {insumo.perecedero && (
            <Campo etiqueta="Vence el" ayuda="Opcional. La app avisa una semana antes.">
              <input
                className="input"
                type="date"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
              />
            </Campo>
          )}
        </>
      )}

      {pestana === 'editar' && (
        <>
          <Campo etiqueta="Nombre">
            <input
              className="input"
              value={borrador.nombre}
              placeholder="Harina de trigo"
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            />
          </Campo>

          <Campo etiqueta="Categoría">
            <select
              className="select"
              value={borrador.categoria}
              onChange={(e) =>
                setBorrador({
                  ...borrador,
                  categoria: e.target.value as CategoriaInsumo,
                  perecedero: e.target.value === 'perecedero',
                })
              }
            >
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Se mide en"
            ayuda="Gramos para sólidos, mililitros para líquidos, unidades para huevos o bolsitas."
          >
            <select
              className="select"
              value={borrador.unidad}
              onChange={(e) => setBorrador({ ...borrador, unidad: e.target.value as Insumo['unidad'] })}
            >
              <option value="g">Gramos (g)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="u">Unidades (u)</option>
            </select>
          </Campo>

          <Campo etiqueta="Cómo lo compra" ayuda="Escríbalo como lo pide en el mercado.">
            <input
              className="input"
              value={borrador.presentacion}
              placeholder="Bolsa 1 kg, Maple 30 u, Barra 200 g"
              onChange={(e) => setBorrador({ ...borrador, presentacion: e.target.value })}
            />
          </Campo>

          <div className="fila-campos">
            <Campo etiqueta={`Cuánto trae (${borrador.unidad})`}>
              <InputNumero
                className="input num"
                valor={borrador.contenido}
                alCambiar={(numero) => setBorrador({ ...borrador, contenido: Math.max(0, numero) })}
              />
            </Campo>
            <Campo etiqueta="Cuánto cuesta (Bs)">
              <InputNumero
                className="input num"
                valor={borrador.precio}
                alCambiar={(numero) => setBorrador({ ...borrador, precio: Math.max(0, numero) })}
              />
            </Campo>
          </div>

          <Campo
            etiqueta={`Avisarme cuando baje de (${borrador.unidad})`}
            ayuda={
              borrador.contenido > 0
                ? `Equivale a ${num(borrador.stockMinimo / borrador.contenido, 1)} × ${borrador.presentacion.toLowerCase()}.`
                : undefined
            }
          >
            <InputNumero
              className="input num"
              valor={borrador.stockMinimo}
              alCambiar={(numero) => setBorrador({ ...borrador, stockMinimo: Math.max(0, numero) })}
            />
          </Campo>

          {borrador.contenido > 0 && borrador.precio > 0 && (
            <Aviso tono="acento" icono="🧮">
              Cada {borrador.unidad} sale a {bs(borrador.precio / borrador.contenido)}. Con esto se
              calcula el costo de cada galleta.
            </Aviso>
          )}

          {!esNuevo && (
            <button className="btn btn-peligro" onClick={() => void alDesactivar()}>
              Desactivar insumo
            </button>
          )}
        </>
      )}
    </Hoja>
  )
}
