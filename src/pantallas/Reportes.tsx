import { useMemo, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import {
  costoDeVenta,
  enRango,
  estaPendiente,
  finDelDia,
  haceDias,
  tipoReceta,
} from '../lib/calc'
import { CANALES } from '../lib/types'
import { bs, bsCorto, fmtFecha, pct } from '../lib/units'
import { GraficoBarras, GraficoLinea } from '../componentes/graficos'
import { Aviso, Cabecera, Segmento, Stat, Tarjeta, Vacio } from '../componentes/ui'

type Periodo = '7' | '30' | '90'

export function PantallaReportes({ ir }: PropsPantalla) {
  const { db } = useDatos()
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const [direccion, setDireccion] = useState<'der' | 'izq' | null>(null)
  const [verTabla, setVerTabla] = useState(false)

  const dias = Number(periodo)

  const datos = useMemo(() => {
    const desde = haceDias(dias - 1)
    const hasta = finDelDia()

    const ventas = db.ventas.filter((v) => enRango(v.fecha, desde, hasta))
    const ingreso = ventas.reduce((s, v) => s + v.total, 0)
    const costo = ventas.reduce((s, v) => s + costoDeVenta(v, db), 0)
    const ganancia = ingreso - costo

    // Ingreso por día, incluyendo los días sin ventas: si no, el gráfico miente.
    const porDia: { etiqueta: string; valor: number }[] = []
    for (let i = dias - 1; i >= 0; i--) {
      const d = haceDias(i)
      const finDia = new Date(d)
      finDia.setHours(23, 59, 59, 999)
      const total = ventas
        .filter((v) => enRango(v.fecha, d, finDia))
        .reduce((s, v) => s + v.total, 0)
      porDia.push({ etiqueta: fmtFecha(d.toISOString()), valor: total })
    }

    // Variedades más vendidas, en galletas.
    const porReceta: Record<string, { unidades: number; ingreso: number }> = {}
    for (const v of ventas) {
      for (const it of v.items) {
        const acc = porReceta[it.recetaId] ?? { unidades: 0, ingreso: 0 }
        acc.unidades += it.unidades
        acc.ingreso += it.cantidad * it.precioUnit
        porReceta[it.recetaId] = acc
      }
    }
    const masVendidas = Object.entries(porReceta)
      .map(([recetaId, x]) => ({
        etiqueta: db.recetas.find((r) => r.id === recetaId)?.nombre ?? 'Galleta',
        valor: x.unidades,
        detalle: `${bs(x.ingreso)} facturados`,
      }))
      .sort((a, b) => b.valor - a.valor)

    // Por canal.
    const porCanal = CANALES.map((c) => {
      const delCanal = ventas.filter((v) => v.canal === c.id)
      return {
        etiqueta: c.label,
        valor: delCanal.reduce((s, v) => s + v.total, 0),
        detalle: `${delCanal.length} venta${delCanal.length === 1 ? '' : 's'}`,
      }
    })
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)

    // Producción y merma.
    const producciones = db.producciones.filter((p) => enRango(p.fecha, desde, hasta))
    // Las pendientes ya descontaron insumos pero todavía no tienen galletas
    // contadas: si entraran acá bajarían el rendimiento sin que nada haya
    // salido mal. Los desvíos de consumo sí las incluyen: esos insumos salieron.
    // Además, "galletas horneadas" cuenta solo recetas de galleta: las
    // preparaciones (masa, relleno…) se cuentan en lotes, no en galletas.
    const galletasSet = new Set(
      db.recetas.filter((r) => tipoReceta(r) === 'galleta').map((r) => r.id),
    )
    const cerradas = producciones.filter(
      (p) => !estaPendiente(p) && galletasSet.has(p.recetaId),
    )
    const horneadas = cerradas.reduce((s, p) => s + p.producido, 0)
    const merma = cerradas.reduce((s, p) => s + p.merma, 0)
    const esperadas = cerradas.reduce((s, p) => s + p.esperado, 0)

    // Diferencia entre lo que decía la receta y lo que se usó de verdad.
    const desvios: Record<string, { teorico: number; real: number }> = {}
    for (const p of producciones) {
      for (const c of p.consumos) {
        const acc = desvios[c.insumoId] ?? { teorico: 0, real: 0 }
        acc.teorico += c.teorico
        acc.real += c.real
        desvios[c.insumoId] = acc
      }
    }
    const ajustes = Object.entries(desvios)
      .map(([insumoId, x]) => {
        const insumo = db.insumos.find((i) => i.id === insumoId)
        const dif = x.real - x.teorico
        return {
          insumo,
          dif,
          parte: x.teorico > 0 ? dif / x.teorico : 0,
          costo: insumo && insumo.contenido ? (dif * insumo.precio) / insumo.contenido : 0,
        }
      })
      .filter((x) => x.insumo && Math.abs(x.parte) > 0.02)
      .sort((a, b) => Math.abs(b.costo) - Math.abs(a.costo))
      .slice(0, 5)

    return {
      ventas,
      ingreso,
      costo,
      ganancia,
      porDia,
      masVendidas,
      porCanal,
      horneadas,
      merma,
      esperadas,
      ajustes,
    }
  }, [db, dias])

  const hayVentas = datos.ventas.length > 0

  return (
    <>
      <Cabecera titulo="Reportes" bajada="Qué pasó en el negocio, sin tener que armar una planilla." />

      <Segmento
        valor={periodo}
        alCambiar={(nuevo) => {
          const viejos = ['7', '30', '90'] as Periodo[]
          setDireccion(viejos.indexOf(nuevo) > viejos.indexOf(periodo) ? 'der' : 'izq')
          setPeriodo(nuevo)
        }}
        opciones={[
          { id: '7' as Periodo, label: 'Últimos 7 días' },
          { id: '30' as Periodo, label: '30 días' },
          { id: '90' as Periodo, label: '90 días' },
        ]}
      />

      <div
        key={periodo}
        className={
          direccion
            ? `insumos-slide ${direccion === 'der' ? 'entra-der' : 'entra-izq'}`
            : 'insumos-slide'
        }
      >
      <div className="rejilla rejilla-4">
        <Stat rotulo="Vendido" valor={bsCorto(datos.ingreso)} pie={`${datos.ventas.length} ventas`} acento />
        <Stat rotulo="Costo de lo vendido" valor={bsCorto(datos.costo)} pie="Ingredientes y empaque" />
        <Stat
          rotulo="Ganancia bruta"
          valor={bsCorto(datos.ganancia)}
          pie={datos.ingreso > 0 ? `margen ${pct(datos.ganancia / datos.ingreso)}` : 'Sin ventas'}
        />
        <Stat
          rotulo="Galletas horneadas"
          valor={datos.horneadas}
          pie={
            datos.esperadas > 0
              ? `${pct(datos.horneadas / datos.esperadas)} de lo esperado`
              : 'Sin producción'
          }
        />
      </div>

      {!hayVentas && datos.horneadas === 0 ? (
        <Tarjeta>
          <Vacio
            icono="📈"
            titulo="Todavía no hay nada que mostrar"
            detalle="Registre producciones y ventas y estos reportes se llenan solos."
            accion={
              <button className="btn btn-primario" onClick={() => ir('producir')}>
                Ir a producir
              </button>
            }
          />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta
            titulo="Ingresos por día"
            extra={
              <button className="btn btn-chico btn-fantasma" onClick={() => setVerTabla(!verTabla)}>
                {verTabla ? 'Ver gráfico' : 'Ver tabla'}
              </button>
            }
          >
            <div className="tarjeta-pad">
              {verTabla ? (
                <div className="scroll-x" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th className="n">Vendido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...datos.porDia].reverse().map((d, i) => (
                        <tr key={i}>
                          <td>{d.etiqueta}</td>
                          <td className="n">{d.valor > 0 ? bs(d.valor) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <GraficoLinea datos={datos.porDia} formato={(v) => bs(v)} />
              )}
            </div>
          </Tarjeta>

          <div className="rejilla rejilla-2">
            <Tarjeta titulo="Variedades más vendidas">
              <div className="tarjeta-pad">
                <GraficoBarras
                  datos={datos.masVendidas}
                  formato={(v) => `${v} galletas`}
                  vacio="No hubo ventas en este período"
                />
              </div>
            </Tarjeta>

            <Tarjeta titulo="Por dónde entra el importe">
              <div className="tarjeta-pad">
                <GraficoBarras
                  datos={datos.porCanal}
                  formato={(v) => bs(v)}
                  vacio="No hubo ventas en este período"
                />
              </div>
            </Tarjeta>
          </div>

          {datos.merma > 0 && (
            <Tarjeta titulo="Merma" pad>
              <div className="entre">
                <div>
                  <div className="eyebrow">Galletas perdidas</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 650 }} className="n">
                    {datos.merma}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="eyebrow">Sobre lo horneado</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 650 }} className="n">
                    {pct(datos.merma / Math.max(1, datos.horneadas + datos.merma))}
                  </div>
                </div>
              </div>
              <p className="mini silencio" style={{ marginBottom: 0 }}>
                Una merma sostenida arriba del 5% suele ser horno, tiempos o tamaño de bolita —
                no mala suerte.
              </p>
            </Tarjeta>
          )}

          {datos.ajustes.length > 0 && (
            <Tarjeta titulo="Recetas que conviene revisar">
              <div className="lista">
                {datos.ajustes.map((a) => (
                  <div key={a.insumo!.id} className="fila">
                    <div className="fila-cuerpo">
                      <span className="fila-titulo">{a.insumo!.nombre}</span>
                      <span className="fila-sub">
                        {a.dif > 0 ? 'Se usó más' : 'Se usó menos'} de lo que dice la receta, en
                        promedio {pct(Math.abs(a.parte))}.
                      </span>
                    </div>
                    <div className="fila-fin">
                      <span className="n" style={{ color: a.dif > 0 ? 'var(--crit)' : 'var(--ok)' }}>
                        {a.dif > 0 ? '+' : '−'}
                        {bs(Math.abs(a.costo))}
                      </span>
                      <span className="s">en el período</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="tarjeta-pad">
                <p className="mini silencio" style={{ margin: 0 }}>
                  Esto sale de comparar lo que propuso la receta con lo que corrigió al cerrar cada
                  lote. Si un insumo aparece siempre aquí, la receta está mal medida y conviene
                  actualizarla.
                </p>
              </div>
            </Tarjeta>
          )}
        </>
      )}
      </div>

      <Aviso icono="📌" titulo="Lo que este reporte no dice">
        La ganancia de arriba es <b>bruta</b>: descuenta ingredientes y empaque, pero no gas, luz,
        alquiler ni su tiempo. Para saber si el negocio realmente gana, reste esos gastos aparte.
      </Aviso>
    </>
  )
}
