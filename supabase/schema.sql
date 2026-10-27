-- ===========================================================================
-- Galletas — estructura de la base de datos
-- Ejecutar UNA SOLA VEZ en Supabase → SQL Editor → New query → Run
-- ===========================================================================
--
-- Por qué una sola tabla y no diez:
--
-- La app carga todos los datos del negocio en el navegador y hace las cuentas
-- ahí (son unos pocos miles de filas, incluso después de años de uso). No
-- necesita consultas SQL complejas del lado del servidor. A cambio de eso,
-- la puesta en marcha es pegar este bloque una vez, y agregar un campo nuevo
-- a una receta no obliga a migrar nada.
--
-- Cada fila guarda un registro completo en JSON. La columna `tabla` dice de
-- qué se trata: insumos, recetas, presentaciones, movimientos, producciones,
-- ventas, compras, conteos o config.
--
-- Si algún día el negocio crece y hacen falta tablas relacionales de verdad,
-- el JSON guardado ya tiene exactamente la forma del modelo, así que migrar
-- es un script de lectura, no un rediseño.

create table if not exists registros (
  tienda      text not null default 'principal',
  tabla       text not null,
  id          text not null,
  datos       jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (tienda, tabla, id)
);

-- Buscar por tienda y tipo de registro es lo único que hace la app al abrir.
create index if not exists registros_tienda_tabla_idx on registros (tienda, tabla);

alter table registros enable row level security;

-- ---------------------------------------------------------------------------
-- Acceso
-- ---------------------------------------------------------------------------
-- Esta política deja entrar a cualquiera que tenga la dirección del proyecto
-- y la clave pública. Es lo adecuado para un negocio de 2 o 3 personas que
-- comparten el mismo enlace y no quieren pantallas de inicio de sesión.
--
-- IMPORTANTE: la clave pública no debe publicarse en redes ni en un sitio web.
-- Quien la tenga puede ver y modificar los datos de la tienda.
--
-- Cuando el negocio crezca y haga falta que cada persona entre con su usuario,
-- se reemplaza `to anon` por `to authenticated` y se activa el inicio de sesión
-- por correo en Supabase. La app no necesita cambios de estructura.

drop policy if exists "acceso app" on registros;
create policy "acceso app" on registros
  for all
  to anon
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Sincronización en vivo
-- ---------------------------------------------------------------------------
-- Hace que un cambio hecho en la laptop aparezca en el celular sin recargar.
-- Si da error porque ya está agregada, se puede ignorar sin problema.

alter publication supabase_realtime add table registros;
