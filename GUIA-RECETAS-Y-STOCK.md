# Cómo se arma una galleta y qué pasa con el stock

Guía del flujo completo: registrar ingredientes, crear toppings, armar la
galleta y entender cómo la app descuenta los ingredientes según lo que se
produce y se vende.

---

## 1. Los ingredientes (materia prima)

Todo empieza en la pantalla **Insumos**. Ahí se registra cada ingrediente tal
como se compra en el mercado:

| Campo | Qué significa | Ejemplo |
| --- | --- | --- |
| Nombre | Cómo lo conocés vos | `Harina de trigo` |
| Categoría | Secos / Húmedos / Perecederos / Empaque | `Secos` |
| Se mide en | `g` (sólidos), `ml` (líquidos), `u` (unidades) | `g` |
| Cómo lo compra | La presentación real | `Bolsa 1 kg` |
| Cuánto trae | Lo que trae esa presentación, en la unidad base | `1000` |
| Cuánto cuesta | Precio de esa presentación (Bs) | `8,50` |
| Avisarme cuando baje de | Mínimo para alertar faltante | `500` |

- La lista se muestra **en orden alfabético** y se filtra **escribiendo**.
- Los filtros (Todos / Secos / Húmedos / Perecederos / Empaque) tienen
  animación direccional: avanzar hacia la derecha entra desde la derecha.
- "Hay que reponer" agrupa lo que está bajo o agotado.

> Regla de la app: el stock nunca se guarda como un número suelto. Se suma
> desde los movimientos (compras, producciones, ventas...). Así siempre se
> puede auditar de dónde salió cada unidad.

---

## 2. Los toppings (y otros componentes)

Un **topping** es una receta con nombre propio y sus propios ingredientes.
Ejemplo típico:

- **Granas de chocolate** (tipo **🍬 Topping**)
  - `Chispas de chocolate de leche`: `300 g` por lote de topping
  - **Rinde (a cuántas galletas)**: `30` → un lote de topping alcanza para
    cubrir 30 galletas.

**Cómo crear un topping:**
1. `Recetas` → **+ Nueva**.
2. En **Tipo de receta** elegir **🍬 Topping**.
3. Nombre, ícono e ingredientes (cantidades por **un lote de topping**).
4. En **Rinde (a cuántas galletas)** escribir a cuántas galletas alcanza ese
   lote. **Guardar.**

Lo mismo aplica a **🌾 Masa**, **🍯 Relleno** y **✨ Extra**: son sub-recetas
que se fabrican aparte y después se incorporan a la galleta.

> El "+ Agregar topping…" de una galleta solo muestra toppings que **ya fueron
> creados** como receta de tipo Topping.

---

## 3. Armar la galleta

En `Recetas` → **+ Nueva** (o abrir una existente), con **Tipo Galleta**:

1. **Nombre** e **ícono**.
2. **Rinde por lote**: cuántas galletas salen de un lote completo.
3. **Ingredientes de un lote**: se agregan con **+ Agregar ingrediente…**
   (buscable escribiendo, en orden alfabético). La cantidad es por **lote**.
4. **Componentes** (masa/relleno/extra): **+ Agregar componente…** con la
   cantidad en *lotes del componente por lote de galletas*.
5. **Topping por galleta**: sección propia, **+ Agregar topping…**. Para cada
   topping se ajusta cuántos *lotes del topping entran por lote de galletas*
   y la app muestra:
   - cuánto **cuesta por galleta** (Bs),
   - cuántos **gramos/ml/piezas de cada insumo entran por galleta**,
   - y el total de toppings por galleta en el encabezado de la sección.

   *Ejemplo:* `Granas de chocolate` (1 lote = 300 g, cubre 30 galletas),
   agregado con 1 lote a una galleta que rinde 30 gallettas →
   **10 g de chispas por galleta** y el costo por galleta de ese topping =
   (costo del lote) ÷ 30.

6. **Cómo se vende** (solo galletas): presentaciones (Unidad, Caja de 4,
   Caja de 6...) con cantidad de galletas, precio de venta y empaque
   (bolsita, etiqueta, caja). Acá se ve el margen y el precio sugerido en
   vivo.

> Los íconos de tipo en la lista de Recetas permiten distinguir de un vistazo
> qué es galleta, masa, relleno, extra o topping.

---

## 4. Cómo descuenta la app los ingredientes

### Al producir (baja la materia prima)

En la pantalla **Producir** se elige la **galleta** y la **cantidad de lotes**
(puede ser 0,5 o 2,5 — la receta escala).

Al liberar la producción la app **descuenta del stock de cada insumo** todo lo
que necesitan los lotes, expandiendo la receta completa:

- ingredientes directos del lote,
- ingredientes de los componentes (masa/relleno/extra), y
- **ingredientes de los toppings** — según los lotes de topping cargados y los
  lotes de galletas que se hacen.

*Ejemplo:* 1 lote de "Chocochip" que lleva 1 lote de "Granas de chocolate"
descuenta los 300 g de chispas + el resto de los ingredientes de la galleta.

El resto ya disponible en la despensa se valida antes: la pantalla muestra
**cuántos lotes se pueden hacer** y qué falta.

### Al cerrar el lote (entran las galletas)

Cuando se cuentan las galletas que salieron:

- **Galletas buenas** → entran al stock de galletas (`rinde × lotes`).
- **Merma** (quemadas, rotas, deformes) → se registra aparte.

Las galletas son "producidas", no "compradas": **vender no vuelve a descontar
ingredientes**, porque los ingredientes ya se descontaron al producir.

### Al vender (sale la galleta y el empaque)

En **Vender** se cobra por presentación:

- baja el **stock de galletas** de esa receta (unidades vendidas),
- baja el **empaque** (bolsita, etiqueta, caja) que lleva cada presentación,
- el ingredient y el topping ya están reflejados en el **costo** de la galleta,
  que se usó en el margen y el precio sugerido.

---

## 5. El costo por galleta (de dónde sale)

- **Costo del lote** = suma del costo de todos los insumos expandidos
  (ingredientes + componentes + toppings), a precio de compra.
  El costo unitario de cada insumo es `precio de la presentación ÷ contenido`.
- **Costo por galleta** = costo del lote ÷ **rinde**.
- **Costo por presentación** = (galletas de la presentación × costo por
  galleta) + costo del **empaque**.

Eso alimenta la pantalla **Costos y precios** y el **margen / precio
sugerido** que se ve en la ficha de la receta.

---

## Resumen del flujo en una imagen

```
Insumos          → ingredientes a precio de compra (g / ml / u)
Recetas (topping) → sub-receta con sus ingredientes + rinde (a cuántas galletas)
Recetas (galleta) → ingredientes + componentes + topping por galleta + presentaciones
Producir         → descuenta TODOS los insumos al liberar lotes; entran galletas al cerrar
Vender           → descuenta galletas y empaque; el costo ya incluye toppings
Costos y precios → margen y precio sugerido a partir del costo real
```

> Si un día el stock no cuadra, se revisa por movimientos: cada baja lleva su
> motivo (compra, producción, venta, merma, ajuste) y su fecha.