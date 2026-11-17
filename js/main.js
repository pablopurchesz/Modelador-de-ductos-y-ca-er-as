// ============================================================================
// main.js
// Punto de partida del programa, se ejecuta al final cuando todos los demás
// archivos ya están cargados. Aquí se conectan los botones de la barra del
// visor y los atajos de teclado, y se arma la leyenda de colores.
// ============================================================================


// ---------------------------------------------------------------------------
// Botones de la barra del visor
// ---------------------------------------------------------------------------
document.getElementById("btnIso").addEventListener("click", vistaIso);
document.getElementById("btnPlanta").addEventListener("click", vistaPlanta);
document.getElementById("btnElevacion").addEventListener("click", vistaElevacion);

document.getElementById("btnCotas").addEventListener("click", function () {
  mostrarCotas = !mostrarCotas;
  if (mostrarCotas) {
    document.getElementById("btnCotas").className = "activo";
  } else {
    document.getElementById("btnCotas").className = "";
  }
  reconstruirEscena();
});

document.getElementById("btnDeshacer").addEventListener("click", deshacerCambio);

// Al cargar el ejemplo o partir de cero se pasa por modificarRed(), con el fin
// de que la red anterior quede en el historial y se pueda recuperar con Ctrl+Z
document.getElementById("btnEjemplo").addEventListener("click", function () {
  modificarRed(function () {
    crearRedEjemplo();
  }, "Red de ejemplo cargada.");
  redActiva = null;
  creandoEquipo = false;
  seleccion = null;
  reconstruirEscena();
  vistaIso();
});

document.getElementById("btnNuevo").addEventListener("click", function () {
  modificarRed(function () {
    crearRedVacia();
  }, "Modelo vacío, se selecciona N1 para trazar el primer tramo o Ctrl+Z para recuperar el anterior.");
  redActiva = null;
  creandoEquipo = false;
  dejarSeleccionado("nodo", idNodoRaiz());
  vistaIso();
});

// Nuevo equipo: el panel muestra el formulario para ingresar el tipo y la posición
document.getElementById("btnNuevoEquipo").addEventListener("click", function () {
  creandoEquipo = true;
  seleccion = null;
  reconstruirEscena();
});


// ---------------------------------------------------------------------------
// Atajos de teclado
// ---------------------------------------------------------------------------
// Los atajos no se ejecutan si el usuario está escribiendo en un campo del
// panel, ya que, por ejemplo la tecla Supr serviría para borrar un número y no un tramo
window.addEventListener("keydown", function (evento) {
  var etiqueta = evento.target.tagName;
  if (etiqueta == "INPUT" || etiqueta == "SELECT" || etiqueta == "TEXTAREA") {
    return;
  }
  if (evento.ctrlKey && evento.key.toLowerCase() == "z") {
    evento.preventDefault();
    deshacerCambio();
  } else if (evento.key == "Escape") {
    seleccionar(null);
  } else if (evento.key == "Delete" && seleccion != null && seleccion.tipo == "tramo") {
    borrarTramoSeleccionado();
  }
});


// ---------------------------------------------------------------------------
// Leyenda de colores de los accesorios
// ---------------------------------------------------------------------------
// Se arma a partir de la lista ACCESORIOS de datos.js, así si se agrega un
// accesorio nuevo la leyenda se actualiza sola
var leyenda = document.getElementById("leyenda");
var codigosLeyenda = Object.keys(ACCESORIOS);
for (var i = 0; i < codigosLeyenda.length; i++) {
  var acc = ACCESORIOS[codigosLeyenda[i]];
  var color = "#" + acc.color.toString(16).padStart(6, "0");
  leyenda.innerHTML = leyenda.innerHTML + '<span><i class="muestra" style="background:' + color + '"></i>' + acc.nombre + '</span>';
}


// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
// Primeramente se intenta cargar la red guardada en el navegador, si no hay
// ninguna se carga la red de ejemplo
if (!cargarDesdeNavegador()) {
  crearRedEjemplo();
}

document.getElementById("btnCotas").className = "activo";   // las cotas parten encendidas

reconstruirEscena();
vistaIso();

// se parte el bucle de dibujo
animar();
