import { useMemo, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import { costoUnitario, esVendible, stockDe } from '../lib/calc'
import type { ItemTipo } from '../lib/types'
import { bs, fmtCantidad, fmtFecha } from '../lib/units'
import { Aviso, Cabecera, Campo, InputNumero, Segmento, Stat, Tarjeta, Vacio } from '../componentes/ui'

// El conteo físico es lo que mantiene honesto al sistema. Sin esto, los errores
// chicos se acumulan durante meses hasta que los números dejan de servir.

export function PantallaConteo(_props: PropsPantalla) {
  const { db, stocks, registrarConteo, guardando } = useDatos()
  const [tipo, setTipo] = useState<ItemTipo>('insumo')
  const [direccion, setDireccion] = useState<'der' | 'izq' | null>(null)
  const [contados, setContados] = useState<Record<string, number>>({})
  const [motivo, setMotivo] = useState('Conteo físico')
  const [aplicado, setAplicado] = useState<number | null>(null)

  const filas = useMemo(() => {
    if (tipo === 'insumo') {
      return db.insumos
        .filter((i) => i.activo)
        .map((i) => ({
          id: i.id,
          nombre: i.nombre,
          unidad: i.unidad,
          sistema: stockDe(stocks, 'insumo', i.id),
          valorUnitario: costoUnitario(i),
          sufijo: i.presentacion,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    }
    return db.recetas
      .filter(esVendible)
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        unidad: 'u' as const,
        sistema: stockDe(stocks, 'galleta', r.id),
        valorUnitario: 0,
        sufijo: 'galletas terminadas',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [tipo, db, stocks])

  const cambios = filas
    .map((f) => ({ f, contado: contados[f.id] }))
    .filter((x) => x.contado !== undefined && Math.abs(x.contado! - x.f.sistema) > 0.0001)

  const impacto = cambios.reduce(
    (s, x) => s + (x.contado! - x.f.sistema) * x.f.valorUnitario,
    0,
  )

  const aplicar = async () => {
    for (const x of cambios) {
      await registrarConteo({
        itemTipo: tipo,
        itemId: x.f.id,
        anterior: x.f.sistema,
        contado: x.contado!,
        motivo,
      })
    }
    setAplicado(cambios.length)
    setContados({})
  }

  const historial = [...db.conteos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10)

  return (
    <>
      <Cabecera
        titulo="Conteo"
        bajada="Anote lo que hay de verdad. La app corrige el stock y guarda la diferencia."
      />

      <Aviso icono="🔍" titulo="Conviene hacerlo una vez al mes">
        Cuente la despensa con la app abierta y escriba lo que ve, aunque no coincida. Las
        diferencias no son un error suyo: son merma, cucharadas de más y cosas que se rompieron.
        Verlas es lo que permite corregirlas.
      </Aviso>

      <Segmento
        valor={tipo}
        alCambiar={(t) => {
          const opciones = ['insumo', 'galleta']
          const viejos = opciones as ItemTipo[]
          setDireccion(viejos.indexOf(t) > viejos.indexOf(tipo) ? 'der' : 'izq')
          setTipo(t)
          setContados({})
          setAplicado(null)
        }}
        opciones={[
          { id: 'insumo' as ItemTipo, label: 'Insumos' },
          { id: 'galleta' as ItemTipo, label: 'Galletas terminadas' },
        ]}
      />

      {aplicado !== null && (
        <Aviso tono="acento" icono="✅" titulo="Conteo aplicado">
          Se corrigieron {aplicado} {aplicado === 1 ? 'ítem' : 'ítems'}. El stock ya refleja lo que
          contó.
        </Aviso>
      )}

      {cambios.length > 0 && (
        <div className="rejilla rejilla-2">
          <Stat rotulo="Ítems a corregir" valor={cambios.length} pie="Solo se guardan los que cambió" acento />
          {tipo === 'insumo' && (
            <Stat
              rotulo="Diferencia en importe"
              valor={bs(impacto)}
              pie={impacto < 0 ? 'Falta stock respecto al sistema' : 'Hay más de lo que decía'}
            />
          )}
        </div>
      )}

      <div
        key={tipo}
        className={
          direccion
            ? `insumos-slide ${direccion === 'der' ? 'entra-der' : 'entra-izq'}`
            : 'insumos-slide'
        }
      >
        <Tarjeta titulo={tipo === 'insumo' ? 'Qué hay en la despensa' : 'Qué hay en la vitrina'}>
        {filas.length === 0 ? (
          <Vacio icono="🔍" titulo="No hay nada que contar" detalle="Registre primero los insumos o las recetas." />
        ) : (
          <div className="lista">
            {filas.map((f) => {
              const contado = contados[f.id]
              const dif = contado === undefined ? 0 : contado - f.sistema
              return (
                <div key={f.id} className="fila">
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">{f.nombre}</span>
                    <span className="fila-sub">
                      El sistema dice {fmtCantidad(f.sistema, f.unidad)} · {f.sufijo}
                      {contado !== undefined && Math.abs(dif) > 0.0001 && (
                        <>
                          {' '}
                          ·{' '}
                          <b style={{ color: dif < 0 ? 'var(--crit)' : 'var(--ok)' }}>
                            {dif > 0 ? '+' : '−'}
                            {fmtCantidad(Math.abs(dif), f.unidad)}
                          </b>
                        </>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexShrink: 0 }}>
                    <InputNumero
                      className="input num"
                      style={{ width: '96px', minHeight: '38px' }}
                      placeholder="¿cuánto hay?"
                      valor={contado ?? ''}
                      aria-label={`Cantidad contada de ${f.nombre}`}
                      alCambiar={(numero, texto) => {
                        setContados((c) => {
                          const n = { ...c }
                          if (texto === '') delete n[f.id]
                          else n[f.id] = Math.max(0, numero)
                          return n
                        })
                      }}
                    />
                    <span className="mini silencio" style={{ width: '20px' }}>
                      {f.unidad}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </Tarjeta>
      </div>

      {cambios.length > 0 && (
        <>
          <Campo etiqueta="Motivo" ayuda="Queda guardado junto al ajuste, para saber después qué pasó.">
            <input
              className="input"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Conteo físico de fin de mes"
            />
          </Campo>
          <button className="btn btn-primario btn-grande" disabled={guardando} onClick={() => void aplicar()}>
            {guardando
              ? 'Guardando…'
              : `Aplicar conteo · ${cambios.length} ${cambios.length === 1 ? 'ítem' : 'ítems'}`}
          </button>
        </>
      )}

      {historial.length > 0 && (
        <Tarjeta titulo="Ajustes anteriores">
          <div className="lista">
            {historial.map((c) => {
              const nombre =
                c.itemTipo === 'insumo'
                  ? db.insumos.find((i) => i.id === c.itemId)?.nombre
                  : db.recetas.find((r) => r.id === c.itemId)?.nombre
              const unidad =
                c.itemTipo === 'insumo'
                  ? (db.insumos.find((i) => i.id === c.itemId)?.unidad ?? 'u')
                  : 'u'
              return (
                <div key={c.id} className="fila">
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">{nombre ?? 'Ítem'}</span>
                    <span className="fila-sub">
                      {fmtFecha(c.fecha)} · decía {fmtCantidad(c.anterior, unidad)}, había{' '}
                      {fmtCantidad(c.contado, unidad)}
                      {c.motivo ? ` · ${c.motivo}` : ''}
                    </span>
                  </div>
                  <div className="fila-fin">
                    <span className="n" style={{ color: c.diferencia < 0 ? 'var(--crit)' : 'var(--ok)' }}>
                      {c.diferencia > 0 ? '+' : '−'}
                      {fmtCantidad(Math.abs(c.diferencia), unidad)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Tarjeta>
      )}
    </>
  )
}
