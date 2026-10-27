import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import {
  costoDeVenta,
  enRango,
  esVendible,
  finDelDia,
  haceDias,
  inicioDelDia,
  lotesPosibles,
  stockDe,
  tipoReceta,
} from '../lib/calc'
import { bs, fmtFechaLarga, fmtHora } from '../lib/units'
import { Aviso, Cabecera, Stat, Tarjeta, Vacio } from '../componentes/ui'

export function PantallaHoy({ ir, alertas }: PropsPantalla) {
  const { db, stocks } = useDatos()
  const [floresAbiertas, setFloresAbiertas] = useState(false)
  const floresRef = useRef<HTMLIFrameElement>(null)

  const intentarReproducir = () => {
    try {
      const audio = floresRef.current?.contentDocument?.querySelector('audio')
      audio && (audio.play() as Promise<void>).catch(() => {})
    } catch {
      // La página de flores ya intenta reproducir sola con <audio autoplay>.
    }
  }

  useEffect(() => {
    if (!floresAbiertas) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [floresAbiertas])

  const hoy = useMemo(() => {
    const desde = inicioDelDia()
    const hasta = finDelDia()
    const ventasHoy = db.ventas.filter((v) => enRango(v.fecha, desde, hasta))
    const ingreso = ventasHoy.reduce((s, v) => s + v.total, 0)
    const costo = ventasHoy.reduce((s, v) => s + costoDeVenta(v, db), 0)

    const desde7 = haceDias(6)
    // El "horneado" cuenta solo galletas: las preparaciones (masa, relleno…)
    // son lotes, no galletas, y no van mezcladas en este número.
    const galletasSet = new Set(
      db.recetas.filter((r) => tipoReceta(r) === 'galleta').map((r) => r.id),
    )
    const prodSemana = db.producciones.filter(
      (p) => enRango(p.fecha, desde7, hasta) && galletasSet.has(p.recetaId),
    )
    const galletasSemana = prodSemana.reduce((s, p) => s + p.producido, 0)
    const mermaSemana = prodSemana.reduce((s, p) => s + p.merma, 0)

    const listas = db.recetas
      .filter(esVendible)
      .map((r) => ({ receta: r, stock: stockDe(stocks, 'galleta', r.id) }))
      .sort((a, b) => b.stock - a.stock)
    const totalListas = listas.reduce((s, x) => s + x.stock, 0)

    return { ventasHoy, ingreso, costo, galletasSemana, mermaSemana, listas, totalListas }
  }, [db, stocks])

  const movimientosRecientes = useMemo(
    () => [...db.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8),
    [db.movimientos],
  )

  const nombreDe = (tipo: 'insumo' | 'galleta', id: string) =>
    tipo === 'insumo'
      ? (db.insumos.find((i) => i.id === id)?.nombre ?? 'Insumo')
      : (db.recetas.find((r) => r.id === id)?.nombre ?? 'Galleta')

  return (
    <div className="pantalla-hoy">
      <Cabecera
        titulo="Hoy"
        bajada={fmtFechaLarga(new Date().toISOString())}
        accion={
          <button
            className="btn btn-chico btn-fantasma flores-boton"
            onClick={() => setFloresAbiertas(true)}
          >
            🌻 hoy es 21?
          </button>
        }
      />

      {alertas.length > 0 && (
        <div className="pila-chica">
          {alertas.slice(0, 4).map((a) => (
            <button
              key={a.id}
              className={a.severidad === 'critica' ? 'aviso aviso-crit' : 'aviso aviso-warn'}
              style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => a.ir && ir(a.ir.pantalla as never, a.ir.foco)}
            >
              <span className="ico">{a.severidad === 'critica' ? '⛔' : '⚠️'}</span>
              <div className="aviso-cuerpo">
                <b>{a.titulo}</b>
                <span>{a.detalle}</span>
              </div>
            </button>
          ))}
          {alertas.length > 4 && (
            <button className="btn btn-chico btn-fantasma" onClick={() => ir('insumos')}>
              Ver las {alertas.length - 4} alertas restantes
            </button>
          )}
        </div>
      )}

      <div className="rejilla rejilla-4">
        <Stat
          rotulo="Galletas listas"
          valor={hoy.totalListas}
          pie={`${hoy.listas.filter((l) => l.stock > 0).length} variedades con stock`}
          acento
        />
        <Stat
          rotulo="Vendido hoy"
          valor={bs(hoy.ingreso)}
          pie={`${hoy.ventasHoy.length} venta${hoy.ventasHoy.length === 1 ? '' : 's'}`}
        />
        <Stat
          rotulo="Ganancia hoy"
          valor={bs(hoy.ingreso - hoy.costo)}
          pie="Sin gastos fijos"
        />
        <Stat
          rotulo="Horneado 7 días"
          valor={hoy.galletasSemana}
          pie={hoy.mermaSemana > 0 ? `${hoy.mermaSemana} de merma` : 'Sin merma'}
        />
      </div>

      <div className="acciones">
        <button className="btn btn-primario" onClick={() => ir('producir')}>
          🥣 Producir
        </button>
        <button className="btn" onClick={() => ir('vender')}>
          🛒 Registrar venta
        </button>
        <button className="btn" onClick={() => ir('insumos')}>
          🧺 Cargar compra
        </button>
      </div>

      <Tarjeta titulo="Galletas listas para vender">
        {hoy.totalListas === 0 ? (
          <Vacio
            icono="🥣"
            titulo="No hay galletas terminadas"
            detalle="Complete una producción y aparecerán aquí listas para vender."
            accion={
              <button className="btn btn-primario" onClick={() => ir('producir')}>
                Producir ahora
              </button>
            }
          />
        ) : (
          <div className="lista">
            {hoy.listas.map(({ receta, stock }) => {
              const lotes = lotesPosibles(receta, db, stocks)
              return (
                <button key={receta.id} className="fila" onClick={() => ir('vender', receta.id)}>
                  <span className="avatar" aria-hidden="true">
                    {receta.emoji}
                  </span>
                  <div className="fila-cuerpo">
                    <span className="fila-titulo">{receta.nombre}</span>
                    <span className="fila-sub">
                      {lotes > 0
                        ? `Alcanza para ${lotes} lote${lotes === 1 ? '' : 's'} más`
                        : 'Faltan insumos para otro lote'}
                    </span>
                  </div>
                  <div className="fila-fin">
                    <span className="n">{stock}</span>
                    <span className="s">listas</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Últimos movimientos">
        {movimientosRecientes.length === 0 ? (
          <Vacio icono="📭" titulo="Todavía no hay movimientos" detalle="Aquí aparece todo lo que entra y sale." />
        ) : (
          <div className="lista">
            {movimientosRecientes.map((m) => (
              <div key={m.id} className="fila">
                <div className="fila-cuerpo">
                  <span className="fila-titulo">{nombreDe(m.itemTipo, m.itemId)}</span>
                  <span className="fila-sub">
                    {ETIQUETA_MOV[m.tipo]}
                    {m.nota ? ` · ${m.nota}` : ''} · {fmtHora(m.fecha)}
                  </span>
                </div>
                <div className="fila-fin">
                  <span className="n" style={{ color: m.cantidad < 0 ? 'var(--crit)' : 'var(--ok)' }}>
                    {m.cantidad > 0 ? '+' : '−'}
                    {Math.abs(Math.round(m.cantidad * 10) / 10)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>

      <Aviso tono="acento" icono="💡" titulo="Para que los números sirvan">
        Registre la producción el mismo día que hornea y la venta el mismo día que cobra. Si pasa
        una semana, el stock deja de reflejar la realidad y hay que volver a contar todo a mano.
      </Aviso>

      {floresAbiertas && (
        <div className="flores-telon" role="dialog" aria-modal="true" aria-label="Flores amarillas">
          <button
            className="cerrar flores-cerrar"
            onClick={() => setFloresAbiertas(false)}
            aria-label="Cerrar"
          >
            ✕
          </button>
          <iframe
            ref={floresRef}
            src="/flores/flower.html"
            title="Flores amarillas"
            className="flores-marco"
            onLoad={intentarReproducir}
          />
        </div>
      )}
    </div>
  )
}

const ETIQUETA_MOV: Record<string, string> = {
  inicial: 'Stock inicial',
  compra: 'Compra',
  consumo: 'Usado en producción',
  produccion: 'Producción',
  venta: 'Venta',
  merma: 'Merma',
  ajuste: 'Ajuste por conteo',
}
