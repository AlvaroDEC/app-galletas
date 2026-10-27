# Duna — producción, stock, costos y ventas

App web para **Galletas Artesanales DUNA**, Santa Cruz, Bolivia. Funciona en laptop y
en celular con los mismos datos, y su trabajo principal es descontar solo los
ingredientes cuando se produce.

**Costo de operación: Bs 0 al mes.** Todo corre en planes gratuitos.

---

## Qué hace

| Pantalla | Para qué sirve |
|---|---|
| **Hoy** | Alertas de stock y vencimientos, galletas listas, vendido y ganancia del día |
| **Producir** | Elegir galleta y lotes → la app propone el consumo → se corrige si hace falta → descuenta insumos y suma galletas |
| **Insumos** | Semáforo de stock, carga de compras por presentación real (bolsa, maple, lata) |
| **Recetas** | Editar ingredientes, rendimiento, presentaciones de venta y empaque |
| **Vender** | Venta por unidad, caja de 4 o caja de 6, por canal y medio de pago |
| **Costos y precios** | Costo real por galleta y por lote, margen y precio sugerido |
| **Reportes** | Ventas por día y por canal, más vendidas, ganancia bruta, merma |
| **Conteo** | Conteo físico que corrige el stock y deja registro de la diferencia |
| **Ajustes** | Nombre del negocio, sincronización, respaldos, reinicio de datos |

---

## Cómo funciona por dentro

Tres decisiones sostienen todo lo demás:

**1. Todo el stock se guarda en una unidad base.** Gramos, mililitros o unidades.
Se compra "una bolsa de 1 kg" y la app la convierte a 1000 g. Sin esta capa, el
descuento automático de recetas da números sin sentido.

**2. El stock no se guarda: se calcula.** No existe un campo `stock` en ninguna
tabla. El stock de cualquier cosa es la suma de sus movimientos
(`src/lib/calc.ts` → `calcularStocks`). Cada gramo que entra o sale tiene fecha,
motivo y origen. Si algún día los números no cuadran, se puede ver exactamente
dónde se rompió.

**3. En producción, el sistema propone y la persona confirma.** La app calcula el
consumo según receta y lo muestra editable. Se guarda tanto el valor teórico como
el real, y la diferencia acumulada aparece en Reportes → "Recetas que conviene
revisar".

### Estructura

```
src/
  lib/
    types.ts     modelo de datos
    units.ts     formato de cantidades, Bs, fechas
    calc.ts      stock, costos, márgenes, alertas   ← toda la lógica de negocio
    ops.ts       las 4 operaciones que mueven stock ← nada mueve stock fuera de acá
    seed.ts      insumos, recetas y datos de arranque
    db.ts        repositorio: local (IndexedDB) o nube (Supabase)
    store.tsx    estado de React y acciones
  pantallas/     una por cada sección
  componentes/   piezas compartidas y gráficos
supabase/
  schema.sql     ejecutar una vez en el proyecto de Supabase
```

---

## Ponerla a andar en tu máquina

```bash
npm install
```

```bash
npm run dev
```

Abre en `http://localhost:5180`. Arranca con datos de arranque: 22 insumos, las 4
variedades del menú de Duna y dos semanas de producciones y ventas inventadas,
para que todas las pantallas muestren algo desde el primer momento.

### Qué es real y qué no en esos datos

| | |
|---|---|
| **Real** | Los nombres de las cuatro variedades, sus descripciones y el precio de 15 Bs la unidad, tomados del menú del negocio. |
| **Estimado** | Las cantidades de cada receta, el rendimiento de 12 galletas por lote, los precios de los insumos y los precios de caja de 4 y caja de 6. |

Las recetas son una reconstrucción razonable de galletas rellenas estilo NYC de
unos 130 g. Sirven para que la app calcule desde el primer minuto y para mostrar
el sistema funcionando, pero **hay que reemplazarlas por las verdaderas**, pesando
los ingredientes una vez con el negocio.

---

## Publicarla gratis (Netlify)

El deploy es manual y a mano, a propósito: no hay build en la nube ni repositorio
conectado, así que nada de lo que se publica depende de una cuenta de terceros.

1. `npm run build` desde `app-galletas/`. Queda la carpeta `dist/`.
2. Entrar a **app.netlify.com**, pestaña **Sites**.
3. **Arrastrar la carpeta `dist/` entera** a la zona de "Deploy manually".
4. Queda una dirección tipo `https://galletas-duna.netlify.app`. Para actualizar,
   se vuelve a arrastrar el `dist/` nuevo sobre el mismo sitio.

No hace falta configurar redirecciones: la app no usa router, la navegación entre
pantallas es estado de React y todo vive en un solo `index.html`.

En el celular, abrir esa dirección y usar **"Agregar a pantalla de inicio"**: queda
como una app normal, con su ícono, sin pasar por ninguna tienda de aplicaciones.

---

## Compartir los datos entre laptop y celular

Mientras no se configure nada, los datos viven solo en el dispositivo donde se
cargaron. Para que las dos pantallas vean lo mismo:

1. Crear una cuenta gratis en **supabase.com** y un proyecto nuevo.
2. Abrir **SQL Editor**, pegar el contenido de `supabase/schema.sql` y ejecutarlo
   una sola vez.
3. En **Project Settings → API**, copiar la *Project URL* y la clave **pública**
   (`anon` / `publishable`).
4. En la app: **Ajustes → Compartir entre laptop y celular**, pegar ambos valores
   y darle "Conectar y recargar".

Desde ahí, lo que se guarda en un dispositivo aparece en el otro sin recargar.

**Sobre la seguridad:** la política de acceso del SQL deja entrar a cualquiera que
tenga la dirección del proyecto y la clave pública. Es lo adecuado para 2 o 3
personas que comparten el mismo enlace y no quieren pantallas de inicio de sesión.
No hay que publicar esa clave en redes ni en un sitio web. Cuando el negocio
crezca y haga falta que cada persona entre con su usuario, se cambia `to anon` por
`to authenticated` en la política y se activa el inicio de sesión por correo en
Supabase; la app no necesita cambios de estructura.

---

## El día de la entrega al cliente

En este orden:

1. **No hace falta borrar nada.** La app arranca en blanco: 22 insumos, 4 recetas y
   12 presentaciones cargadas, con el stock en cero y sin historial.
2. **Insumos:** corregir los precios reales con las últimas boletas de compra, y
   ajustar las presentaciones si compran en otro tamaño.
3. **Recetas:** corregir las cantidades de las cuatro variedades con las recetas
   verdaderas, y confirmar cuántas galletas salen de verdad de un lote.
   *Pesar los ingredientes una vez* en lugar de calcularlos de memoria: una receta
   cargada "más o menos" hace que el stock y los costos estén mal para siempre, y
   el sistema no tiene forma de detectarlo solo.
4. **Conteo:** contar la despensa y cargar las cantidades reales.
5. **Costos y precios:** revisar los precios de venta contra el margen sugerido.
6. **Ajustes → Descargar respaldo**, para tener el punto de partida guardado.

---

## Qué quedó deliberadamente fuera

- Pedidos y clientes con fecha de entrega
- Sugerencia automática de compras
- Gastos fijos y mano de obra en el costo (la app avisa que no los incluye)
- Preparaciones intermedias compartidas entre recetas
- Registrar ventas sin internet (la app abre offline, pero para guardar necesita conexión)
- Facturación e impuestos

Ninguna obliga a rehacer lo que ya está.

---

## Notas técnicas

- **Sin librería de gráficos.** Los tres gráficos son SVG y CSS escritos a mano
  (`src/componentes/graficos.tsx`): menos peso para el celular y control del color
  en modo claro y oscuro.
- **Una sola tabla en Supabase.** La app carga todo en memoria y calcula del lado
  del navegador, así que no necesita consultas SQL complejas. El motivo completo
  está comentado en `supabase/schema.sql`.
- **Modo oscuro** siguiendo la preferencia del sistema.
- **Los insumos y recetas no se borran, se desactivan**, para que el historial
  siga cuadrando.
