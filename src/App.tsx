import { useEffect, useMemo, useState } from 'react'
import { useDatos } from './lib/store'
import { alertas } from './lib/calc'
import { ocultarSplash } from './lib/splash'
import { Hoja } from './componentes/ui'
import { PantallaHoy } from './pantallas/Hoy'
import { PantallaProducir } from './pantallas/Producir'
import { PantallaVender } from './pantallas/Vender'
import { PantallaInsumos } from './pantallas/Insumos'
import { PantallaRecetas } from './pantallas/Recetas'
import { PantallaCostos } from './pantallas/Costos'
import { PantallaReportes } from './pantallas/Reportes'
import { PantallaConteo } from './pantallas/Conteo'
import { PantallaAjustes } from './pantallas/Ajustes'

export type Pantalla =
  | 'hoy'
  | 'producir'
  | 'vender'
  | 'insumos'
  | 'recetas'
  | 'costos'
  | 'reportes'
  | 'conteo'
  | 'ajustes'

const MENU: { id: Pantalla; label: string; ico: string; grupo: 1 | 2 }[] = [
  { id: 'hoy', label: 'Hoy', ico: '🏠', grupo: 1 },
  { id: 'producir', label: 'Producir', ico: '🥣', grupo: 1 },
  { id: 'vender', label: 'Vender', ico: '🛒', grupo: 1 },
  { id: 'insumos', label: 'Insumos', ico: '🧺', grupo: 1 },
  { id: 'recetas', label: 'Recetas', ico: '📋', grupo: 2 },
  { id: 'costos', label: 'Costos y precios', ico: '🏷️', grupo: 2 },
  { id: 'reportes', label: 'Reportes', ico: '📈', grupo: 2 },
  { id: 'conteo', label: 'Conteo', ico: '🔍', grupo: 2 },
  { id: 'ajustes', label: 'Ajustes', ico: '⚙️', grupo: 2 },
]

const EN_BARRA: Pantalla[] = ['hoy', 'producir', 'vender', 'insumos']

export function App() {
  const { db, stocks, cargando, error, limpiarError, modo } = useDatos()
  const [pantalla, setPantalla] = useState<Pantalla>('hoy')
  const [foco, setFoco] = useState<string | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)

  const listaAlertas = useMemo(() => alertas(db, stocks), [db, stocks])
  const criticas = listaAlertas.filter((a) => a.severidad === 'critica').length

  const ir = (p: Pantalla, f?: string) => {
    // Tocar la misma pantalla no reinicia nada: sólo sube al inicio.
    if (p === pantalla) {
      setFoco(f ?? null)
      setMenuAbierto(false)
      window.scrollTo({ top: 0 })
      return
    }
    const sinMovimiento =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const aplicar = () => {
      setPantalla(p)
      setFoco(f ?? null)
      setMenuAbierto(false)
      setSaliendo(false)
      window.scrollTo({ top: 0 })
    }
    if (sinMovimiento) {
      aplicar()
      return
    }
    // Primero se pliega la pantalla actual; luego entra la nueva.
    setSaliendo(true)
    window.setTimeout(aplicar, 150)
  }

  // La pantalla de inicio se retira recién cuando hay datos para mostrar.
  useEffect(() => {
    if (!cargando) ocultarSplash()
  }, [cargando])

  // El nombre del negocio es lo que se ve en la pestaña del navegador.
  useEffect(() => {
    document.title = db.config.negocio
      ? `${db.config.negocio} — Producción y stock`
      : 'Duna — Producción y stock'
  }, [db.config.negocio])

  // Mientras carga no se dibuja nada: la pantalla de inicio del HTML sigue
  // cubriendo todo, así no hay dos indicadores de carga distintos.
  if (cargando) return null

  const props = { ir, foco, alertas: listaAlertas }

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Menú principal">
        <div className="marca">
          <span className="logotipo" role="img" aria-label="Duna — Galletas Artesanales" />
          <span className="marca-estado">
            {modo === 'nube' ? 'Sincronizado' : 'En este equipo'}
          </span>
        </div>
        {MENU.filter((m) => m.grupo === 1).map((m) => (
          <button
            key={m.id}
            className="nav-item"
            aria-current={pantalla === m.id ? 'page' : undefined}
            onClick={() => ir(m.id)}
          >
            <span className="ico" aria-hidden="true">
              {m.ico}
            </span>
            {m.label}
            {m.id === 'insumos' && criticas > 0 && <span className="globo">{criticas}</span>}
          </button>
        ))}
        <div className="nav-sep" />
        {MENU.filter((m) => m.grupo === 2).map((m) => (
          <button
            key={m.id}
            className="nav-item"
            aria-current={pantalla === m.id ? 'page' : undefined}
            onClick={() => ir(m.id)}
          >
            <span className="ico" aria-hidden="true">
              {m.ico}
            </span>
            {m.label}
          </button>
        ))}
      </nav>

      <div className="main">
        {/* En el celular no hay barra lateral, así que la marca vive acá. */}
        <header className="barra-marca">
          <span className="logotipo" role="img" aria-label="Duna — Galletas Artesanales" />
          <span className="marca-estado">
            {modo === 'nube' ? 'Sincronizado' : 'En este equipo'}
          </span>
        </header>

        <main className="contenido">
          {error && (
            <div className="aviso aviso-crit">
              <span className="ico">⚠️</span>
              <div className="aviso-cuerpo">
                <b>No se pudo guardar</b>
                <span>{error}</span>
              </div>
              <button className="btn btn-chico btn-fantasma" onClick={limpiarError}>
                Cerrar
              </button>
            </div>
          )}

          <div
            key={pantalla}
            className={`pantalla-animada${saliendo ? ' salir' : ''}`}
          >
            {pantalla === 'hoy' && <PantallaHoy {...props} />}
            {pantalla === 'producir' && <PantallaProducir {...props} />}
            {pantalla === 'vender' && <PantallaVender {...props} />}
            {pantalla === 'insumos' && <PantallaInsumos {...props} />}
            {pantalla === 'recetas' && <PantallaRecetas {...props} />}
            {pantalla === 'costos' && <PantallaCostos {...props} />}
            {pantalla === 'reportes' && <PantallaReportes {...props} />}
            {pantalla === 'conteo' && <PantallaConteo {...props} />}
            {pantalla === 'ajustes' && <PantallaAjustes {...props} />}
          </div>
        </main>
      </div>

      <nav className="barra-inferior" aria-label="Menú">
        {EN_BARRA.map((id) => {
          const m = MENU.find((x) => x.id === id)!
          return (
            <button
              key={id}
              className="tab"
              aria-current={pantalla === id ? 'page' : undefined}
              onClick={() => ir(id)}
            >
              <span className="ico" aria-hidden="true">
                {m.ico}
              </span>
              {m.label}
              {id === 'insumos' && criticas > 0 && <span className="punto" />}
            </button>
          )
        })}
        <button
          className="tab"
          aria-current={!EN_BARRA.includes(pantalla) ? 'page' : undefined}
          onClick={() => setMenuAbierto(true)}
        >
          <span className="ico" aria-hidden="true">
            ☰
          </span>
          Más
        </button>
      </nav>

      {menuAbierto && (
        <Hoja titulo="Más" alCerrar={() => setMenuAbierto(false)}>
          <div className="pila-chica">
            {MENU.filter((m) => m.grupo === 2).map((m) => (
              <button
                key={m.id}
                className="nav-item"
                aria-current={pantalla === m.id ? 'page' : undefined}
                onClick={() => ir(m.id)}
              >
                <span className="ico" aria-hidden="true">
                  {m.ico}
                </span>
                {m.label}
              </button>
            ))}
          </div>
        </Hoja>
      )}
    </div>
  )
}

export interface PropsPantalla {
  ir: (p: Pantalla, foco?: string) => void
  foco: string | null
  alertas: ReturnType<typeof alertas>
}
