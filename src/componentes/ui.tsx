import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'

// Piezas que se repiten en todas las pantallas.

export function Cabecera({
  titulo,
  bajada,
  accion,
}: {
  titulo: string
  bajada?: string
  accion?: ReactNode
}) {
  return (
    <div className="cabecera">
      <div className="cabecera-fila">
        <h1>{titulo}</h1>
        {accion}
      </div>
      {bajada && <p>{bajada}</p>}
    </div>
  )
}

export function Tarjeta({
  titulo,
  extra,
  children,
  pad = false,
}: {
  titulo?: string
  extra?: ReactNode
  children: ReactNode
  pad?: boolean
}) {
  return (
    <section className="tarjeta">
      {titulo && (
        <header className="tarjeta-cab">
          <h2>{titulo}</h2>
          {extra}
        </header>
      )}
      <div className={pad ? 'tarjeta-pad' : undefined}>{children}</div>
    </section>
  )
}

export function Stat({
  rotulo,
  valor,
  pie,
  acento = false,
}: {
  rotulo: string
  valor: ReactNode
  pie?: ReactNode
  acento?: boolean
}) {
  return (
    <div className={acento ? 'stat acento' : 'stat'}>
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor}</span>
      {pie && <span className="pie">{pie}</span>}
    </div>
  )
}

export function Pildora({
  tono = 'neutro',
  children,
}: {
  tono?: 'neutro' | 'ok' | 'warn' | 'critica' | 'acento'
  children: ReactNode
}) {
  return <span className={`pildora ${tono === 'neutro' ? '' : tono}`}>{children}</span>
}

export function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string
  ayuda?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </label>
  )
}

export function Segmento<T extends string>({
  opciones,
  valor,
  alCambiar,
}: {
  opciones: { id: T; label: string }[]
  valor: T
  alCambiar: (v: T) => void
}) {
  return (
    <div className="segmento" role="group">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => alCambiar(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * En Bolivia el separador decimal es la coma, y toda la app muestra los números
 * así. Un <input type="number"> nativo, en cambio, la descarta sin avisar: "0,5"
 * entra como 5 y un descuento de "2,50" como 250. Por eso los campos numéricos
 * son de texto y la conversión pasa siempre por acá.
 */
export function aNumero(texto: string): number {
  const n = Number(texto.replace(/,/g, '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Campo numérico. Mientras la persona escribe se respeta lo que tecleó — hace
 * falta para poder llegar a "0,5", que como número intermedio es 0 — y se avisa
 * el valor ya convertido. Si el valor llega cambiado desde afuera (un tope, los
 * botones de +/−, un recálculo), el texto a medio escribir se descarta.
 */
export function InputNumero({
  valor,
  alCambiar,
  onBlur,
  inputMode = 'decimal',
  ...resto
}: {
  valor: number | ''
  alCambiar: (numero: number, texto: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [texto, setTexto] = useState<string | null>(null)
  // Sin separador de miles: el campo se vuelve a leer con aNumero() y un
  // "5.000" volvería como 5.
  const comoNumero = valor === '' ? '' : String(valor).replace('.', ',')
  const sigueValiendo =
    texto !== null && (texto === '' || aNumero(texto) === (valor === '' ? 0 : valor))

  return (
    <input
      {...resto}
      type="text"
      inputMode={inputMode}
      value={sigueValiendo ? (texto as string) : comoNumero}
      onChange={(e) => {
        const crudo = e.target.value.replace(/[^\d.,]/g, '')
        setTexto(crudo)
        alCambiar(aNumero(crudo), crudo)
      }}
      onBlur={(e) => {
        setTexto(null)
        onBlur?.(e)
      }}
    />
  )
}

export function Contador({
  valor,
  alCambiar,
  paso = 1,
  min = 0,
  max = 9999,
  decimales = 0,
}: {
  valor: number
  alCambiar: (v: number) => void
  paso?: number
  min?: number
  max?: number
  decimales?: number
}) {
  const acotar = (v: number) => Math.min(max, Math.max(min, v))
  const redondear = (v: number) => Math.round(v * 10 ** decimales) / 10 ** decimales
  return (
    <div className="contador">
      <button
        type="button"
        aria-label="Restar"
        disabled={valor <= min}
        onClick={() => alCambiar(redondear(acotar(valor - paso)))}
      >
        −
      </button>
      <InputNumero
        valor={Number.isFinite(valor) ? valor : ''}
        alCambiar={(n, texto) => {
          // El tope de abajo se aplica recién al salir del campo: si se acotara
          // en cada tecla, escribir "0,5" quedaría atrapado en el mínimo.
          if (texto !== '') alCambiar(Math.min(max, n))
        }}
        onBlur={() => alCambiar(redondear(acotar(Number.isFinite(valor) ? valor : min)))}
      />
      <button
        type="button"
        aria-label="Sumar"
        disabled={valor >= max}
        onClick={() => alCambiar(redondear(acotar(valor + paso)))}
      >
        +
      </button>
    </div>
  )
}

/**
 * Selector de una lista larga (ingredientes, componentes, toppings) con
 * escritura y búsqueda mientras se teclea. Las opciones se muestran siempre en
 * orden alfabético, aunque lleguen desordenadas.
 */
export function BuscadorAgregar<T extends string>({
  opciones,
  placeholder,
  alElegir,
}: {
  opciones: { id: T; label: string }[]
  placeholder: string
  alElegir: (id: T) => void
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [indice, setIndice] = useState(0)
  const listaId = useId()

  const ordenadas = [...opciones].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  const q = texto.trim().toLowerCase()
  const filtradas = q ? ordenadas.filter((o) => o.label.toLowerCase().includes(q)) : ordenadas

  const cerrar = () => {
    setTexto('')
    setAbierto(false)
    setIndice(0)
  }

  const elegir = (id: T) => {
    alElegir(id)
    cerrar()
  }

  return (
    <div className="buscador">
      <input
        className="input"
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        placeholder={placeholder}
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          setIndice(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAbierto(true)
            setIndice((i) => Math.min(filtradas.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndice((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const opcion = filtradas[indice]
            if (opcion) elegir(opcion.id)
          } else if (e.key === 'Escape') {
            setAbierto(false)
          }
        }}
        onBlur={() => setAbierto(false)}
      />
      {abierto && (
        <ul id={listaId} className="buscador-opciones" role="listbox">
          {filtradas.length === 0 ? (
            <li className="buscador-vacio">
              <span>Nada coincide con «{texto.trim()}»</span>
            </li>
          ) : (
            filtradas.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === indice}
                  className={i === indice ? 'activo' : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o.id)}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export function Hoja({
  titulo,
  children,
  pie,
  alCerrar,
  ancha = false,
}: {
  titulo: string
  children: ReactNode
  pie?: ReactNode
  alCerrar: () => void
  ancha?: boolean
}) {
  const [saliendo, setSaliendo] = useState(false)

  const solicitarCerrar = () => {
    if (saliendo) return
    // Primero se pliega la hoja; el cierre real llega con la animación.
    setSaliendo(true)
    window.setTimeout(alCerrar, 180)
  }

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') solicitarCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = previo
    }
  }, [alCerrar, solicitarCerrar])

  return (
    <div
      className={saliendo ? 'telon telon-fuera' : 'telon'}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) solicitarCerrar()
      }}
    >
      <div className={saliendo ? `hoja hoja-ancha hoja-fuera` : ancha ? 'hoja hoja-ancha' : 'hoja'}>
        <header className="hoja-cab">
          <h2>{titulo}</h2>
          <button type="button" className="cerrar" onClick={solicitarCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="hoja-cuerpo">{children}</div>
        {pie && <footer className="hoja-pie">{pie}</footer>}
      </div>
    </div>
  )
}

export function Vacio({
  icono,
  titulo,
  detalle,
  accion,
}: {
  icono: string
  titulo: string
  detalle: string
  accion?: ReactNode
}) {
  return (
    <div className="vacio">
      <span className="ico">{icono}</span>
      <b>{titulo}</b>
      <p>{detalle}</p>
      {accion}
    </div>
  )
}

export function Aviso({
  tono = 'neutro',
  icono,
  titulo,
  children,
}: {
  tono?: 'neutro' | 'acento' | 'warn' | 'crit'
  icono: string
  titulo?: string
  children: ReactNode
}) {
  const clase =
    tono === 'acento'
      ? 'aviso acento'
      : tono === 'warn'
        ? 'aviso aviso-warn'
        : tono === 'crit'
          ? 'aviso aviso-crit'
          : 'aviso'
  return (
    <div className={clase}>
      <span className="ico">{icono}</span>
      <div className="aviso-cuerpo">
        {titulo && <b>{titulo}</b>}
        <span>{children}</span>
      </div>
    </div>
  )
}

export function Nivel({ porcentaje, tono }: { porcentaje: number; tono: 'ok' | 'aviso' | 'critica' }) {
  return (
    <div className={`nivel${tono === 'ok' ? '' : ` nivel--${tono}`}`}>
      <i style={{ width: `${Math.min(100, Math.max(2, porcentaje))}%` }} />
    </div>
  )
}
