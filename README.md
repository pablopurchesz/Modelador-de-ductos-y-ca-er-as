# Modelador de ductos y cañerías

Proyecto del curso Computación Gráfica (USACH), el cual consiste en un modelador web interactivo de redes de ductos de climatización, desarrollado con Three.js, en el que la red se construye ingresando las medidas de cada tramo mediante una barra de comandos y los codos, transiciones y derivaciones se generan de forma automática. En una etapa posterior se planea extender el modelador a redes hidráulicas (cañerías) utilizando la misma base.

## Cómo ejecutarlo

No se necesita instalar nada, basta con descargar el repositorio y abrir el archivo `index.html` en el navegador (Chrome, Edge o Firefox). Es importante tener conexión a internet, ya que, la librería Three.js se carga desde un CDN.

## Comandos

Primeramente se selecciona un nodo con clic (o con `sel N1`) y luego se escriben los tramos, el nodo nuevo queda seleccionado por lo que se puede seguir escribiendo uno tras otro.

| Comando | Ejemplo | Qué hace |
|---|---|---|
| dirección largo [sección] | `+X 3 600x400` / `-Y 0.6 D315` | Crea un tramo desde el nodo seleccionado, si no se escribe la sección se repite la anterior |
| der distancia | `der 2.5` | Divide el tramo seleccionado y crea un punto de derivación |
| acc tipo distancia | `acc CR 0.7` | Inserta un accesorio (CR, CCF, SIL, FIL o VAV) |
| term tipo | `term difusor` | Asigna un terminal (difusor, rejilla, tapa, uma o ninguno) a un nodo extremo |
| sel id | `sel N3` / `sel T2` | Selecciona un nodo o un tramo |
| borrar | `borrar` | Borra el tramo seleccionado y lo que cuelga de él |
| deshacer | `deshacer` | Deshace la última acción (también Ctrl+Z) |
| ejemplo / nuevo | `ejemplo` | Carga la red de ejemplo o parte con una red vacía |

Las direcciones son +X, -X, +Y, -Y, +Z y -Z, donde +Y es subir y -Y es bajar, los largos van en metros y las secciones en milímetros.

## Estructura del proyecto

```
index.html        página principal
css/estilos.css   estilos de la página
js/datos.js       datos de la red (nodos, tramos y accesorios) y funciones que la modifican
js/geometria.js   creación de las mallas: tramos, codos, transiciones, derivaciones, accesorios y terminales
js/escena.js      escena de Three.js, reconstrucción de la red, cotas y selección con el mouse
js/comandos.js    intérprete de comandos de la barra
js/main.js        punto de partida del programa
docs/             informes del curso
```

Los archivos de la carpeta `js` se cargan en ese orden en `index.html`, ya que, cada uno utiliza funciones de los anteriores.

## Estado del proyecto

- Evaluación N°3: prototipo con barra de comandos, generación automática de fittings, accesorios y terminales de aire.
- Evaluación N°4: panel de edición, cubicación de plancha y vista en planta con cámara ortográfica.
- Entrega final: cálculo de caudal y velocidad por tramo con escala de colores.
- Etapa siguiente: redes hidráulicas (cañerías) sobre la misma base, con cálculo mediante epanet-js.

## Autor

Pablo Purches Zapata, Ingeniería de Ejecución en Computación e Informática, USACH.
