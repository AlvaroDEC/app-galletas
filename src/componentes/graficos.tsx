import { useEffect, useId, useMemo, useRef, useState } from 'react'

// Gráficos hechos a mano, sin librerías: menos peso para el celular y control
// total del color en modo claro y oscuro.
//
// Todos usan UNA sola serie y un único tono de acento. No hay paleta de
// categorías que pueda confundirse: la identidad la lleva siempre la etiqueta
// escrita, nunca el color solo.

export interface PuntoSerie {
  etiqueta: string
  valor: number
  /** Texto que aparece al pasar el dedo o el mouse. */
  detalle?: string
}

/** Evolución en el tiempo: área tenue, línea de 2 px y el último punto marcado. */
export function GraficoLinea({
  datos,
  formato,
  alto = 150,
}: {
  datos: PuntoSerie[]
  formato: (v: number) => string
  alto?: number
}) {
  const idGrad = useId().replace(/:/g, '')
  const [activo, setActivo] = useState<number | null>(null)

  // El SVG se dibuja a la medida real del contenedor, en píxeles 1:1. Estirar
  // un viewBox fijo era más corto de escribir, pero convertía los puntos en
  // óvalos y engordaba las líneas de forma distinta en cada pantalla.
  const contenedor = useRef<HTMLDivElement>(null)
  const [anchoCaja, setAnchoCaja] = useState(600)
  useEffect(() => {
    const el = contenedor.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width ?? 0
      if (w > 0) setAnchoCaja(Math.max(220, w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { ancho, puntos, areaD, lineaD, max, pasoX, base, tope } = useMemo(() => {
    const ancho = anchoCaja
    const base = alto - 22
    const tope = 12
    const max = Math.max(1, ...datos.map((d) => d.valor))
    const pasoX = datos.length > 1 ? ancho / (datos.length - 1) : ancho
    const y = (v: number) => base - (v / max) * (base - tope)
    const puntos = datos.map((d, i) => ({ x: i * pasoX, y: y(d.valor), d }))
    const lineaD = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const areaD =
      puntos.length > 0
        ? `${lineaD} L${puntos[puntos.length - 1].x.toFixed(1)},${base} L${puntos[0].x.toFixed(1)},${base} Z`
        : ''
    return { ancho, puntos, areaD, lineaD, max, pasoX, base, tope }
  }, [datos, alto, anchoCaja])

  const ultimo = puntos[puntos.length - 1]
  const marcado = activo !== null ? puntos[activo] : null

  if (datos.length === 0) return <div ref={contenedor} />

  return (
    <div ref={contenedor} style={{ position: 'relative' }}>
      <svg
        className="grafico"
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={`Evolución: máximo ${formato(max)}`}
        onMouseLeave={() => setActivo(null)}
      >
        <defs>
          <linearGradient id={`g${idGrad}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grilla discreta: sólo tres referencias */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            className="g-grilla"
            x1={0}
            x2={ancho}
            y1={base - f * (base - tope)}
            y2={base - f * (base - tope)}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={areaD} fill={`url(#g${idGrad})`} />
        <path className="g-linea" d={lineaD} vectorEffect="non-scaling-stroke" />

        <circle className="g-punto" cx={ultimo.x} cy={ultimo.y} r={4} vectorEffect="non-scaling-stroke" />
        {marcado && (
          <>
            <line
              className="g-grilla"
              x1={marcado.x}
              x2={marcado.x}
              y1={tope}
              y2={base}
              stroke="var(--accent-line)"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={marcado.x}
              cy={marcado.y}
              r={5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* zonas de contacto anchas, para que se pueda tocar con el dedo */}
        {puntos.map((p, i) => (
          <rect
            key={i}
            x={p.x - pasoX / 2}
            y={0}
            width={pasoX}
            height={alto}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
            onTouchStart={() => setActivo(i)}
          >
            <title>{`${p.d.etiqueta}: ${formato(p.d.valor)}`}</title>
          </rect>
        ))}
      </svg>

      <div className="entre mini silencio" style={{ marginTop: '.15rem' }}>
        <span>{datos[0].etiqueta}</span>
        <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
          {marcado
            ? `${marcado.d.etiqueta}: ${formato(marcado.d.valor)}`
            : `${datos[datos.length - 1].etiqueta}: ${formato(datos[datos.length - 1].valor)}`}
        </span>
      </div>
    </div>
  )
}

/** Ranking: barras horizontales, un solo tono, valor siempre escrito al lado. */
export function GraficoBarras({
  datos,
  formato,
  vacio = 'Sin datos en este período',
}: {
  datos: PuntoSerie[]
  formato: (v: number) => string
  vacio?: string
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  if (datos.length === 0) {
    return <p className="mini silencio centrado" style={{ padding: '1.2rem 0' }}>{vacio}</p>
  }
  return (
    <div className="pila-chica" style={{ gap: '.7rem' }}>
      {datos.map((d) => (
        <div key={d.etiqueta} className="pila-chica" style={{ gap: '.25rem' }}>
          <div className="entre">
            <span className="mini" style={{ fontWeight: 560 }}>
              {d.etiqueta}
            </span>
            <span className="mini n" style={{ fontWeight: 620 }}>
              {formato(d.valor)}
            </span>
          </div>
          <div
            style={{
              height: '8px',
              background: 'var(--surface-2)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
            title={d.detalle ?? `${d.etiqueta}: ${formato(d.valor)}`}
          >
            <i
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.max(2, (d.valor / max) * 100)}%`,
                background: 'var(--accent)',
                borderRadius: '4px',
              }}
            />
          </div>
          {d.detalle && <span className="mini silencio">{d.detalle}</span>}
        </div>
      ))}
    </div>
  )
}
