# Modelador de ductos y cañerías

Proyecto del curso Computación Gráfica (USACH), el cual consiste en un modelador web interactivo de redes de ductos de climatización, desarrollado con Three.js, en el que la red se construye desde un panel lateral ingresando la sección, el largo y la dirección de cada tramo, y los codos, transiciones y derivaciones se generan de forma automática. Esta versión recupera la interfaz con panel de la versión del 20/10, reescrita en archivos separados y con el mismo estilo de código de la versión de la EV3.

## Cómo ejecutarlo

No se necesita instalar nada, basta con abrir el archivo `index.html` en el navegador (Chrome, Edge o Firefox). Es importante tener conexión a internet, ya que, la librería Three.js y las fuentes se cargan desde la web.

## Uso

Primeramente se selecciona un nodo con clic en el visor (los nodos naranjos son extremos abiertos) y en el panel se elige la forma de la sección y se escriben las medidas, luego al mover el mouse por el visor aparece una vista previa del tramo en la dirección ortogonal más cercana al mouse (nunca hacia atrás) y con un clic se crea, también se puede apretar Enter en las medidas o usar los botones de dirección. El nodo nuevo queda seleccionado por lo que se puede seguir trazando uno tras otro, y para seleccionar un tramo mientras hay un nodo seleccionado primero se aprieta Esc. Al seleccionar un tramo se pueden cambiar su sección y su largo, crear un punto de derivación en cualquier punto del tramo (pasando el mouse sobre él y haciendo clic, con ajuste cada 5 cm), insertar o quitar accesorios y eliminarlo junto con lo que cuelga de él.

Con el botón "Nuevo equipo" se agrega otra UMA o caja de ventilación en las coordenadas que se indiquen, la cual es el origen de una red independiente, y con el selector de red de la barra del visor se elige con qué red trabajar, quedando las demás transparentes y sin poder seleccionarse. Cada equipo se conecta a su ducto de descarga mediante una junta flexible y una transición de 30 cm.

| Atajo | Qué hace |
|---|---|
| Ctrl+Z | Deshace la última acción |
| Supr | Borra el tramo seleccionado y lo que cuelga de él |
| Esc | Quita la selección |

## Estructura del proyecto

```
index.html          página principal (panel a la izquierda y visor a la derecha)
css/estilos.css     estilos de la página
js/datos.js         datos de la red (nodos, tramos y accesorios) y funciones que la modifican
js/geometria.js     creación de las mallas: tramos, codos, transiciones, derivaciones, accesorios y terminales
js/escena.js        escena de Three.js, reconstrucción de la red, cotas y selección con el mouse
js/panel.js         panel lateral: formularios, botones y mensajes
js/trazado.js       trazado de tramos con el mouse y vista previa
js/main.js          botones de la barra del visor, atajos de teclado y arranque del programa
docs/               informes del curso
```

Los archivos de la carpeta `js` se cargan en ese orden en `index.html`, ya que, cada uno utiliza funciones de los anteriores.

## Estado del proyecto

- Evaluación N°3: prototipo con barra de comandos, generación automática de fittings, accesorios y terminales de aire (etiqueta `ev3`).
- Evaluación N°4: panel lateral de edición, trazado de tramos con el mouse, derivaciones en cualquier punto del tramo con zapato chino o collarín, reducciones y ampliaciones de 30 cm, varias redes independientes con red activa, y equipos de origen (UMA por módulos y caja de ventilación) conectados con junta flexible (etiqueta `ev4`).
- Entrega final: cálculo de caudal y velocidad por tramo con escala de colores.
- Etapa siguiente: redes hidráulicas (cañerías) sobre la misma base, con cálculo mediante epanet-js.

## Autor

Pablo Purches Zapata, Ingeniería de Ejecución en Computación e Informática, USACH.
