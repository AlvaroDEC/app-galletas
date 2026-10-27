import { useRef, useState } from 'react'
import type { PropsPantalla } from '../App'
import { useDatos } from '../lib/store'
import { crearRepo, guardarConfigNube, leerConfigNube } from '../lib/db'
import type { DB } from '../lib/types'
import { Aviso, Cabecera, Campo, Hoja, Stat, Tarjeta } from '../componentes/ui'

const SQL = `-- Ejecutar una sola vez en Supabase → SQL Editor

create table if not exists registros (
  tienda text not null default 'principal',
  tabla  text not null,
  id     text not null,
  datos  jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (tienda, tabla, id)
);

alter table registros enable row level security;

-- Acceso para la app. Cambiar a "to authenticated" si más adelante
-- se agrega inicio de sesión con usuario y contraseña.
create policy "acceso app" on registros
  for all to anon using (true) with check (true);

-- Para que los cambios de un dispositivo lleguen al otro al instante.
alter publication supabase_realtime add table registros;`

export function PantallaAjustes(_props: PropsPantalla) {
  const { db, modo, guardarConfig, reiniciar, guardando, recargar } = useDatos()
  const nube = leerConfigNube()

  const [negocio, setNegocio] = useState(db.config.negocio)
  const [url, setUrl] = useState(nube?.url ?? '')
  const [clave, setClave] = useState(nube?.clave ?? '')
  const [tienda, setTienda] = useState(nube?.tienda ?? 'principal')
  const [verSQL, setVerSQL] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [confirmar, setConfirmar] = useState<'stock' | 'vacia' | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const exportar = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `galletas-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importar = async (archivo: File) => {
    try {
      const texto = await archivo.text()
      const datos = JSON.parse(texto) as DB
      if (!datos.insumos || !datos.recetas || !datos.movimientos) {
        throw new Error('formato')
      }
      await crearRepo().reemplazarTodo(datos)
      await recargar()
    } catch {
      alert('Ese archivo no parece un respaldo válido de la app.')
    }
  }

  const conectar = () => {
    guardarConfigNube({ url: url.trim(), clave: clave.trim(), tienda: tienda.trim() || 'principal' })
    window.location.reload()
  }

  const desconectar = () => {
    guardarConfigNube(null)
    window.location.reload()
  }

  return (
    <>
      <Cabecera titulo="Ajustes" bajada="Nombre del negocio, sincronización entre dispositivos y respaldos." />

      <div className="rejilla rejilla-3">
        <Stat
          rotulo="Dónde están los datos"
          valor={modo === 'nube' ? 'En la nube' : 'Este dispositivo'}
          pie={modo === 'nube' ? 'Compartidos entre laptop y celular' : 'No se comparten todavía'}
          acento={modo === 'nube'}
        />
        <Stat rotulo="Movimientos guardados" valor={db.movimientos.length} pie="Cada entrada y salida" />
        <Stat
          rotulo="Registros"
          valor={db.producciones.length + db.ventas.length + db.compras.length}
          pie="Producciones, ventas y compras"
        />
      </div>

      <Tarjeta titulo="Negocio" pad>
        <Campo
          etiqueta="Nombre"
          ayuda="Aparece en la pestaña del navegador. El logotipo de la barra no cambia con esto."
        >
          <input className="input" value={negocio} onChange={(e) => setNegocio(e.target.value)} />
        </Campo>
        <div className="acciones" style={{ marginTop: '.7rem' }}>
          <button
            className="btn btn-primario"
            disabled={guardando || negocio === db.config.negocio}
            onClick={() => void guardarConfig({ ...db.config, negocio })}
          >
            Guardar
          </button>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Compartir entre laptop y celular" pad>
        {modo === 'local' ? (
          <>
            <Aviso icono="📱" titulo="Ahora mismo los datos viven solo en este dispositivo">
              Sirve perfecto para probar. Para que la laptop y el celular vean lo mismo, hace falta
              un proyecto gratuito de Supabase. Son tres pasos y no cuesta nada.
            </Aviso>

            <ol className="mini" style={{ color: 'var(--ink-2)', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
              <li>
                Crear una cuenta gratis en <b>supabase.com</b> y un proyecto nuevo.
              </li>
              <li>
                Abrir <b>SQL Editor</b>, pegar el bloque de abajo y ejecutarlo una vez.{' '}
                <button className="btn btn-chico btn-fantasma" onClick={() => setVerSQL(true)}>
                  Ver el SQL
                </button>
              </li>
              <li>
                Copiar de <b>Project Settings → API</b> la dirección del proyecto y la clave
                pública, y pegarlas aquí abajo.
              </li>
            </ol>

            <div className="pila" style={{ marginTop: '.8rem' }}>
              <Campo etiqueta="Dirección del proyecto" ayuda="Termina en .supabase.co">
                <input
                  className="input"
                  value={url}
                  placeholder="https://xxxxxxxx.supabase.co"
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Campo>
              <Campo
                etiqueta="Clave pública"
                ayuda="La que dice anon o publishable. Nunca la clave secreta (service_role)."
              >
                <input
                  className="input"
                  value={clave}
                  placeholder="sb_publishable_… o eyJhbGci…"
                  onChange={(e) => setClave(e.target.value)}
                />
              </Campo>
              <Campo
                etiqueta="Nombre de la tienda"
                ayuda="Déjelo como está. Sirve si algún día se usa el mismo proyecto para más de una tienda."
              >
                <input className="input" value={tienda} onChange={(e) => setTienda(e.target.value)} />
              </Campo>
              <button className="btn btn-primario" disabled={!url.trim() || !clave.trim()} onClick={conectar}>
                Conectar y recargar
              </button>
            </div>
          </>
        ) : (
          <>
            <Aviso tono="acento" icono="☁️" titulo="Sincronizado">
              Los datos están en {nube?.url}. Lo que se guarda en la laptop aparece en el celular
              solo, sin recargar.
            </Aviso>
            <div className="acciones" style={{ marginTop: '.7rem' }}>
              <button className="btn" onClick={() => void recargar()}>
                Volver a cargar
              </button>
              <button className="btn btn-peligro" onClick={desconectar}>
                Desconectar de la nube
              </button>
            </div>
            <p className="mini silencio">
              Desconectar no borra nada de Supabase: la app vuelve a trabajar con los datos de este
              dispositivo.
            </p>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Respaldo" pad>
        <p className="mini silencio" style={{ marginTop: 0 }}>
          Descargue un archivo con todo: recetas, insumos, movimientos, ventas y pedidos abiertos.
          Sirve para pasar los datos a otro dispositivo o para quedarse tranquilo.
        </p>
        <div className="acciones">
          <button className="btn" onClick={exportar}>
            ⬇︎ Descargar respaldo
          </button>
          <button className="btn" onClick={() => archivoRef.current?.click()}>
            ⬆︎ Restaurar respaldo
          </button>
          <input
            ref={archivoRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
              e.target.value = ''
            }}
          />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Empezar de nuevo" pad>
        <p className="mini silencio" style={{ marginTop: 0 }}>
          <b>“Solo recetas e insumos”</b> deja las recetas y los insumos con el stock inicial
          propuesto. <b>“Borrar todo el stock”</b> deja lo mismo pero con todo en cero, que es como
          arranca la app.
        </p>
        <div className="acciones">
          <button className="btn" onClick={() => setConfirmar('stock')}>
            Solo recetas e insumos
          </button>
          <button className="btn btn-peligro" onClick={() => setConfirmar('vacia')}>
            Borrar todo el stock
          </button>
        </div>
      </Tarjeta>

      {verSQL && (
        <Hoja
          titulo="SQL para Supabase"
          ancha
          alCerrar={() => setVerSQL(false)}
          pie={
            <>
              <button className="btn" onClick={() => setVerSQL(false)}>
                Cerrar
              </button>
              <button
                className="btn btn-primario"
                onClick={() => {
                  void navigator.clipboard.writeText(SQL)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                }}
              >
                {copiado ? 'Copiado ✓' : 'Copiar'}
              </button>
            </>
          }
        >
          <p className="mini silencio" style={{ marginTop: 0 }}>
            Péguelo en Supabase → SQL Editor y ejecútelo una sola vez. Crea la tabla donde se
            guarda todo y habilita la sincronización entre dispositivos.
          </p>
          <pre
            style={{
              background: 'var(--surface-2)',
              padding: '.9rem',
              borderRadius: '8px',
              fontSize: '.76rem',
              overflowX: 'auto',
              fontFamily: 'var(--mono)',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {SQL}
          </pre>
        </Hoja>
      )}

      {confirmar && (
        <Hoja
          titulo="¿Seguro?"
          alCerrar={() => setConfirmar(null)}
          pie={
            <>
              <button className="btn" onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-peligro"
                disabled={guardando}
                onClick={async () => {
                  await reiniciar(confirmar)
                  setConfirmar(null)
                }}
              >
                Sí, reemplazar
              </button>
            </>
          }
        >
          <Aviso tono="crit" icono="⚠️" titulo="Esto borra el historial actual">
            {confirmar === 'stock' &&
              'Van a quedar las recetas y los insumos con el stock inicial propuesto, sin producciones ni ventas.'}
            {confirmar === 'vacia' &&
              'Van a quedar las recetas y los insumos, pero con todo el stock en cero y sin historial.'}
          </Aviso>
          <p className="mini silencio">
            Si quiere poder volver atrás, descargue antes un respaldo.
          </p>
        </Hoja>
      )}
    </>
  )
}
