import { useMemo, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import {
  costoEmpaque,
  costoGalleta,
  costoLote,
  costoUnitario,
  desgloseLote,
  esVendible,
  margen,
  precioSugerido,
} from '../lib/calc'
import { bs, fmtCantidad, pct } from '../lib/units'
import { Aviso, Cabecera, Campo, InputNumero, Pildora, Stat, Tarjeta, Vacio } from '../componentes/ui'

export function PantallaCostos({ ir }: PropsPantalla) {
  const { db, guardarReceta, guardarConfig, guardando } = useDatos()
  const recetas = db.recetas.filter(esVendible)
  const [abierta, setAbierta] = useState<string | null>(recetas[0]?.id ?? null)

  const objetivo = db.config.margenObjetivo

  const resumen = useMemo(
    () =>
      recetas.map((r) => {
        const lote = costoLote(r, db)
        const unidad = costoGalleta(r, db)
        const pres = db.presentaciones.filter((p) => p.recetaId === r.id)
        const margenes = pres.map((p) => {
          const costo = p.unidades * unidad + costoEmpaque(p, db.insumos)
          return { pres: p, costo, m: margen(p.precio, costo) }
        })
        const peor = margenes.reduce<number | null>(
          (min, x) => (min === null || x.m < min ? x.m : min),
          null,
        )
        return { receta: r, lote, unidad, margenes, peor }
      }),
    [recetas, db.insumos, db.presentaciones],
  )

  const enRiesgo = resumen.filter((x) => x.peor !== null && x.peor < 0.3)

  // Qué insumos se llevan la plata, sumando todas las recetas.
  const pesoInsumos = useMemo(() => {
    const acumulado: Record<string, number> = {}
    for (const r of recetas) {
      for (const d of desgloseLote(r, db)) {
        acumulado[d.insumoId] = (acumulado[d.insumoId] ?? 0) + d.costo
      }
    }
    const total = Object.values(acumulado).reduce((s, v) => s + v, 0)
    return Object.entries(acumulado)
      .map(([insumoId, costo]) => ({
        insumo: db.insumos.find((i) => i.id === insumoId),
        costo,
        parte: total > 0 ? costo / total : 0,
      }))
      .filter((x) => x.insumo)
      .sort((a, b) => b.costo - a.costo)
      .slice(0, 8)
  }, [recetas, db.insumos])

  const detalle = resumen.find((x) => x.receta.id === abierta) ?? null

  return (
    <>
      <Cabecera
        titulo="Costos y precios"
        bajada="Cuánto cuesta cada galleta de verdad, y a cuánto habría que venderla."
      />

      <Aviso tono="warn" icono="⚠️" titulo="Lo que este número todavía no incluye">
        Aquí está el costo de <b>ingredientes y empaque</b>. No incluye el gas del horno, la luz,
        el alquiler ni su tiempo de trabajo. La ganancia real es menor a la que muestra esta
        pantalla. Cuando quiera medir eso en serio, se agrega en una etapa siguiente.
      </Aviso>

      {recetas.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="🏷️"
            titulo="No hay recetas para costear"
            detalle="Registre una receta con sus ingredientes y aquí verá el costo real."
            accion={
              <button className="btn btn-primario" onClick={() => ir('recetas')}>
                Ir a recetas
              </button>
            }
          />
        </Tarjeta>
      ) : (
        <>
          <div className="rejilla rejilla-3">
            <Stat
              rotulo="Galleta más barata"
              valor={bs(Math.min(...resumen.map((x) => x.unidad)))}
              pie={resumen.reduce((a, b) => (a.unidad <= b.unidad ? a : b)).receta.nombre}
              acento
            />
            <Stat
              rotulo="Galleta más cara"
              valor={bs(Math.max(...resumen.map((x) => x.unidad)))}
              pie={resumen.reduce((a, b) => (a.unidad >= b.unidad ? a : b)).receta.nombre}
            />
            <Stat
              rotulo="Presentaciones flojas"
              valor={enRiesgo.length}
              pie={enRiesgo.length === 0 ? 'Todas por encima del 30%' : 'Con margen bajo 30%'}
            />
          </div>

          <Tarjeta titulo="Margen que quiere ganar" pad>
            <div className="fila-campos" style={{ maxWidth: '320px' }}>
              <Campo
                etiqueta="Margen objetivo"
                ayuda="Es la parte de cada Bs cobrado que quiere que le quede después de ingredientes y empaque. La app usa esto para sugerir precios."
              >
                <InputNumero
                  className="input num"
                  valor={Math.round(objetivo * 100)}
                  alCambiar={(numero) => {
                    const v = Math.min(90, Math.max(0, numero))
                    void guardarConfig({ ...db.config, margenObjetivo: v / 100 })
                  }}
                />
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Por variedad">
            <div className="lista">
              {resumen.map((x) => (
                <button
                  key={x.receta.id}
                  className="fila"
                  onClick={() => setAbierta(abierta === x.receta.id ? null : x.receta.id)}
                >
                  <span className="avatar" aria-hidden="true">
                    {x.receta.emoji}
                  </span>
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">
                      {x.receta.nombre}
                      {x.peor !== null && x.peor < 0.3 && <Pildora tono="warn">Margen bajo</Pildora>}
                    </span>
                    <span className="fila-sub">
                      Lote {bs(x.lote)} · rinde {x.receta.rinde}
                    </span>
                  </div>
                  <div className="fila-fin">
                    <span className="n">{bs(x.unidad)}</span>
                    <span className="s">por galleta</span>
                  </div>
                </button>
              ))}
            </div>
          </Tarjeta>

          {detalle && (
            <Tarjeta titulo={`${detalle.receta.emoji} ${detalle.receta.nombre} — precios`}>
              <div className="scroll-x">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Presentación</th>
                      <th className="n">Cuesta</th>
                      <th className="n">Cobra</th>
                      <th className="n">Le queda</th>
                      <th className="n">Margen</th>
                      <th className="n">Sugerido</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.margenes.map(({ pres, costo, m }) => {
                      const sugerido = precioSugerido(costo, objetivo)
                      return (
                        <tr key={pres.id}>
                          <td>{pres.nombre}</td>
                          <td className="n">{bs(costo)}</td>
                          <td className="n">{bs(pres.precio)}</td>
                          <td className="n">{bs(pres.precio - costo)}</td>
                          <td className="n">
                            <Pildora tono={m < 0.2 ? 'critica' : m < 0.4 ? 'warn' : 'ok'}>{pct(m)}</Pildora>
                          </td>
                          <td className="n">{bs(sugerido)}</td>
                          <td className="n">
                            {Math.abs(sugerido - pres.precio) > 0.005 && (
                              <button
                                className="btn btn-chico"
                                disabled={guardando}
                                onClick={() =>
                                  void guardarReceta(
                                    detalle.receta,
                                    db.presentaciones
                                      .filter((p) => p.recetaId === detalle.receta.id)
                                      .map((p) => (p.id === pres.id ? { ...p, precio: sugerido } : p)),
                                  )
                                }
                              >
                                Usar
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tarjeta-pad">
                <span className="eyebrow">De dónde sale el costo del lote</span>
                <div className="scroll-x" style={{ marginTop: '.5rem' }}>
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Ingrediente</th>
                        <th className="n">Cantidad</th>
                        <th className="n">Costo</th>
                        <th className="n">Parte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desgloseLote(detalle.receta, db).map((d) => (
                        <tr key={d.insumoId}>
                          <td>{d.nombre}</td>
                          <td className="n">{fmtCantidad(d.cantidad, d.unidad)}</td>
                          <td className="n">{bs(d.costo)}</td>
                          <td className="n">{pct(detalle.lote > 0 ? d.costo / detalle.lote : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Lote completo</td>
                        <td className="n">{detalle.receta.rinde} galletas</td>
                        <td className="n">{bs(detalle.lote)}</td>
                        <td className="n">{bs(detalle.unidad)} c/u</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </Tarjeta>
          )}

          <Tarjeta titulo="Los insumos que se llevan el importe">
            <div className="lista">
              {pesoInsumos.map((x) => (
                <div key={x.insumo!.id} className="fila">
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">{x.insumo!.nombre}</span>
                    <span className="fila-sub">
                      {bs(costoUnitario(x.insumo!))} por {x.insumo!.unidad} ·{' '}
                      {x.insumo!.presentacion} a {bs(x.insumo!.precio)}
                    </span>
                    <div className="nivel">
                      <i style={{ width: `${Math.max(3, x.parte * 100)}%` }} />
                    </div>
                  </div>
                  <div className="fila-fin">
                    <span className="n">{pct(x.parte)}</span>
                    <span className="s">del costo</span>
                  </div>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Aviso icono="💡" titulo="Cómo usar esta pantalla">
            Si un insumo sube de precio, corríjalo en su ficha y vuelva aquí: verá al instante qué
            presentaciones quedaron con margen bajo. Es la diferencia entre enterarse hoy y
            enterarse dentro de seis meses.
          </Aviso>
        </>
      )}
    </>
  )
}
