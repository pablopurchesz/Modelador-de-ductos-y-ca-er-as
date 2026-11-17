// ============================================================================
// panel.js
// En este archivo se encuentra el panel lateral, el cual reemplaza a la barra
// de comandos de la versión anterior. El panel cambia según lo que esté
// seleccionado, es decir, si no hay nada seleccionado se muestran las
// instrucciones, si hay un nodo se muestra el formulario para trazar un tramo
// nuevo y si hay un tramo se muestran sus medidas, la derivación y los
// accesorios. Al igual que antes, el panel no modifica la red directamente,
// sino que llama a las funciones de datos.js a través de modificarRed().
// ============================================================================

var cajaContexto = document.getElementById("contexto");
var cajaMensaje = document.getElementById("mensaje");

// Largo que se propone para el próximo tramo (la sección sale de ultimaSeccion, en datos.js)
var largoBorrador = 3;

// Forma que se está editando en el formulario de un tramo. Se guarda aparte
// porque al apretar "Rectangular" o "Circular" el panel se vuelve a dibujar y
// si no se guardara aquí se perdería la elección antes de apretar "Aplicar".
var formaEnEdicion = null;
var tramoEnEdicion = null;

// Cuando es true el panel muestra el formulario para crear un equipo nuevo
var creandoEquipo = false;


// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

// tipo puede ser "ok", "error" o "" (mensaje normal)
function mostrarMensaje(texto, tipo) {
  cajaMensaje.textContent = texto;
  cajaMensaje.className = tipo;
}


// ---------------------------------------------------------------------------
// Ejecutar una modificación
// ---------------------------------------------------------------------------
// Todas las modificaciones pasan por esta función. Primeramente se guarda una
// copia de la red, luego se intenta hacer el cambio y si algo falla se vuelve
// a la copia, de esta forma la red nunca queda a medio modificar.
function modificarRed(cambio, mensajeOk) {
  var copia = JSON.stringify(red);
  try {
    cambio();
  } catch (error) {
    red = JSON.parse(copia);
    mostrarMensaje(error.message, "error");
    return false;
  }
  historial.push(copia);
  if (historial.length > 50) {
    historial.shift();
  }
  quitarSeleccionSiNoExiste();
  reconstruirEscena();
  mostrarMensaje(mensajeOk, "ok");
  return true;
}

// Si lo que estaba seleccionado ya no existe (por ejemplo se borró) se quita la
// selección, ya que, si no el panel intentaría mostrar un elemento que no está en la red
function quitarSeleccionSiNoExiste() {
  if (seleccion == null) {
    return;
  }
  if (seleccion.tipo == "nodo" && red.nodos[seleccion.id] == undefined) {
    seleccion = null;
  } else if (seleccion.tipo == "tramo" && red.tramos[seleccion.id] == undefined) {
    seleccion = null;
  }
}

// Deja seleccionado un elemento sin pasar por el clic del mouse
function dejarSeleccionado(tipo, id) {
  seleccion = { tipo: tipo, id: id };
  reconstruirEscena();
}

// Deshace el último cambio, se usa desde el botón de la barra y con Ctrl+Z
function deshacerCambio() {
  if (deshacer()) {
    quitarSeleccionSiNoExiste();
    reconstruirEscena();
    mostrarMensaje("Cambio deshecho.", "");
  } else {
    mostrarMensaje("No hay cambios para deshacer.", "");
  }
}


// ---------------------------------------------------------------------------
// Lectura de los campos del formulario
// ---------------------------------------------------------------------------

// Convierte un texto a número aceptando coma o punto (2,5 o 2.5)
function leerNumero(texto) {
  if (texto == undefined) {
    return NaN;
  }
  return parseFloat(String(texto).replace(",", "."));
}

// Lee el valor numérico de un campo del panel a partir de su id
function leerCampo(id) {
  var campo = document.getElementById(id);
  if (campo == null) {
    return NaN;
  }
  return leerNumero(campo.value);
}

// Lee la sección y el largo de un formulario. El prefijo sirve para diferenciar
// el formulario del tramo nuevo ("nuevo") del formulario de edición ("edicion").
// Si algún valor está fuera de rango se lanza un error con el mensaje para el usuario.
function leerSeccionDelPanel(prefijo, forma) {
  var seccion = { forma: forma };
  var largo = leerCampo(prefijo + "-largo");

  if (forma == "rect") {
    seccion.ancho = Math.round(leerCampo(prefijo + "-ancho"));
    seccion.alto = Math.round(leerCampo(prefijo + "-alto"));
    if (!(seccion.ancho >= 50 && seccion.ancho <= 3000 && seccion.alto >= 50 && seccion.alto <= 3000)) {
      throw new Error("El ancho y el alto deben estar entre 50 y 3000 mm.");
    }
  } else {
    seccion.diametro = Math.round(leerCampo(prefijo + "-diametro"));
    if (!(seccion.diametro >= 50 && seccion.diametro <= 2000)) {
      throw new Error("El diámetro debe estar entre 50 y 2000 mm.");
    }
  }

  if (!(largo >= 0.1 && largo <= 100)) {
    throw new Error("El largo debe estar entre 0,1 y 100 m.");
  }
  return { seccion: seccion, largo: largo };
}


// ---------------------------------------------------------------------------
// HTML de las partes del panel
// ---------------------------------------------------------------------------
// El panel se arma como texto HTML que luego se pone dentro de cajaContexto con
// innerHTML, es la forma más directa de hacerlo sin usar React u otra librería.
// Después de poner el HTML se deben conectar los eventos de los botones, ya que,
// los botones anteriores se borran y los nuevos no tienen ningún evento.

// Botones para elegir la forma de la sección y los campos de medidas
function htmlCamposSeccion(prefijo, forma, ancho, alto, diametro, largo) {
  var claseRect = "";
  var claseCirc = "";
  if (forma == "rect") {
    claseRect = "activo";
  } else {
    claseCirc = "activo";
  }

  var html = "";
  html = html + '<div class="selector-forma">';
  html = html + '<button id="' + prefijo + '-rect" class="' + claseRect + '">Rectangular</button>';
  html = html + '<button id="' + prefijo + '-circ" class="' + claseCirc + '">Circular</button>';
  html = html + '</div>';

  html = html + '<div class="campos">';
  if (forma == "rect") {
    html = html + '<label>Ancho [mm]<input id="' + prefijo + '-ancho" type="number" min="50" max="3000" step="50" value="' + ancho + '"></label>';
    html = html + '<label>Alto [mm]<input id="' + prefijo + '-alto" type="number" min="50" max="3000" step="50" value="' + alto + '"></label>';
  } else {
    html = html + '<label>Diámetro [mm]<input id="' + prefijo + '-diametro" type="number" min="50" max="2000" step="25" value="' + diametro + '"></label>';
    html = html + '<span></span>';   // espacio vacío para que el largo quede en la misma columna
  }
  html = html + '<label>Largo [m]<input id="' + prefijo + '-largo" type="number" min="0.1" max="100" step="0.1" value="' + largo + '"></label>';
  html = html + '</div>';
  return html;
}

// Panel cuando no hay nada seleccionado
function htmlSinSeleccion() {
  var html = "";
  html = html + '<div class="bloque">';
  html = html + '<h2>Cómo modelar</h2>';
  html = html + '<p class="nota">Se selecciona un nodo en el visor (los nodos naranjos son extremos abiertos) para trazar un tramo nuevo con su sección, largo y dirección, por otro lado, al seleccionar un tramo se pueden editar sus medidas, crear un punto de derivación o insertar accesorios.</p>';
  html = html + '<p class="nota">Los fittings se generan solos, es decir, un cambio de dirección produce un codo, un cambio de sección una reducción o ampliación de 30 cm y tres o más tramos en un nodo una derivación, donde los ramales salen con zapato chino (o collarín si son circulares).</p>';
  html = html + '<p class="nota">Con el botón "Nuevo equipo" se agrega otra UMA o caja de ventilación, la cual es el origen de una red independiente, y con el selector "Red" se elige con qué red trabajar, dejando las demás transparentes.</p>';
  html = html + '<button class="boton principal" id="ir-origen">Seleccionar equipo de origen</button>';
  html = html + '</div>';
  return html;
}

// Panel cuando hay un nodo seleccionado
function htmlNodo(nodo) {
  var tramos = tramosDelNodo(nodo.id);
  var ocupadas = direccionesOcupadas(nodo.id);

  var textoConexiones = tramos.length + " conexiones";
  if (tramos.length == 1) {
    textoConexiones = "1 conexión";
  }

  var html = "";

  // encabezado con el id del nodo y sus datos
  html = html + '<div class="bloque">';
  var textoEtiqueta = "Nodo";
  if (nodo.origen) {
    textoEtiqueta = "Equipo";
  }
  html = html + '<div class="encabezado"><span class="etiqueta">' + textoEtiqueta + '</span><strong>' + nodo.id + '</strong>';
  html = html + '<span class="dato">' + textoConexiones + ' · ' + tipoDeNodo(nodo.id) + ' · cota ' + formatoNumero(nodo.y) + ' m</span></div>';
  html = html + '</div>';

  // si es un equipo se muestra su bloque, y si ya tiene su ducto de descarga
  // no se muestra el formulario de tramo nuevo, ya que, del equipo sale un solo ducto
  if (nodo.origen) {
    html = html + htmlBloqueEquipo(nodo);
    if (tramos.length >= 1) {
      return html;
    }
  }

  // formulario para el tramo nuevo
  html = html + '<div class="bloque">';
  html = html + '<h2>Nuevo tramo desde ' + nodo.id + '</h2>';
  html = html + htmlCamposSeccion("nuevo", ultimaSeccion.forma, ultimaSeccion.ancho, ultimaSeccion.alto, ultimaSeccion.diametro, largoBorrador);

  // Botonera de direcciones: es una grilla de 3x3 donde el centro es el nodo.
  // En planta se ubican los ejes X y Z, y en la columna derecha subir y bajar.
  var orden = ["", "-Z", "+Y", "-X", "centro", "+X", "", "+Z", "-Y"];
  html = html + '<div class="direcciones">';
  for (var i = 0; i < orden.length; i++) {
    var codigo = orden[i];
    if (codigo == "") {
      html = html + '<span></span>';
    } else if (codigo == "centro") {
      html = html + '<span class="centro">' + nodo.id + '</span>';
    } else {
      var texto = codigo;
      if (codigo == "+Y") { texto = "Sube"; }
      if (codigo == "-Y") { texto = "Baja"; }
      var deshabilitado = "";
      if (ocupadas.indexOf(codigo) != -1) {
        deshabilitado = " disabled";
      }
      html = html + '<button class="boton-direccion" data-direccion="' + codigo + '"' + deshabilitado + '>' + texto + '</button>';
    }
  }
  html = html + '</div>';
  html = html + '<p class="nota">Se mueve el mouse en el visor hacia donde debe ir el tramo, el cual se muestra como vista previa, y luego se hace clic en el visor o se aprieta Enter en las medidas para crearlo. También se pueden usar los botones, las direcciones tachadas ya están ocupadas en este nodo.</p>';
  html = html + '</div>';

  // los equipos no llevan terminal
  if (nodo.origen) {
    return html;
  }

  // terminal, solo para los extremos de la red
  var esExtremo = (tramos.length <= 1);
  html = html + '<div class="bloque">';
  html = html + '<h2>Terminal</h2>';
  var deshabilitarSelector = "";
  if (!esExtremo) {
    deshabilitarSelector = " disabled";
  }
  html = html + '<select id="terminal"' + deshabilitarSelector + '>';
  html = html + '<option value="">Sin terminal</option>';
  var codigosTerm = Object.keys(TERMINALES);
  for (var j = 0; j < codigosTerm.length; j++) {
    var elegido = "";
    if (nodo.terminal == codigosTerm[j]) {
      elegido = " selected";
    }
    html = html + '<option value="' + codigosTerm[j] + '"' + elegido + '>' + TERMINALES[codigosTerm[j]] + '</option>';
  }
  html = html + '</select>';
  if (!esExtremo) {
    html = html + '<p class="nota">Solo los extremos de la red admiten terminales.</p>';
  }
  html = html + '</div>';
  return html;
}

// Panel cuando hay un tramo seleccionado
function htmlTramo(tramo) {
  var largo = largoTramo(tramo);
  var direccion = codigoDireccion(direccionTramo(tramo));

  // si se cambió de tramo se olvida la forma que se estaba editando
  if (tramoEnEdicion != tramo.id) {
    tramoEnEdicion = tramo.id;
    formaEnEdicion = tramo.forma;
  }

  // valores por defecto para los campos que el tramo no tiene (por ejemplo el
  // diámetro de un tramo rectangular), así al cambiar de forma no aparece un 0
  var ancho = tramo.ancho || 400;
  var alto = tramo.alto || 300;
  var diametro = tramo.diametro || 250;

  var html = "";
  html = html + '<div class="bloque">';
  html = html + '<div class="encabezado"><span class="etiqueta">Tramo</span><strong>' + tramo.id + '</strong>';
  html = html + '<span class="dato">' + textoSeccion(tramo) + ' mm · ' + formatoNumero(largo) + ' m · ' + tramo.a + ' → ' + tramo.b + ' · ' + NOMBRE_DIRECCION[direccion] + '</span></div>';
  html = html + '</div>';

  // sección y largo
  html = html + '<div class="bloque">';
  html = html + '<h2>Sección y largo</h2>';
  html = html + htmlCamposSeccion("edicion", formaEnEdicion, ancho, alto, diametro, redondear(largo));
  html = html + '<div class="fila"><button class="boton principal" id="aplicar">Aplicar cambios</button></div>';
  html = html + '<p class="nota">Al cambiar el largo, todo lo que está aguas abajo de ' + tramo.b + ' se desplaza junto con el tramo.</p>';
  html = html + '</div>';

  // derivación
  html = html + '<div class="bloque">';
  html = html + '<h2>Derivación</h2>';
  html = html + '<div class="fila">';
  html = html + '<label>Distancia desde ' + tramo.a + ' [m]<input id="derivacion-distancia" type="number" step="0.1" min="0.1" value="' + redondear(largo / 2) + '"></label>';
  html = html + '<button class="boton" id="crear-derivacion">Crear punto</button>';
  html = html + '</div>';
  html = html + '<p class="nota">Se pasa el mouse sobre el tramo en el visor y se hace clic en el punto donde va la derivación, la distancia se ajusta cada 5 cm y también se puede escribir aquí. Se divide el tramo y queda seleccionado el nodo nuevo para trazar el ramal desde ahí.</p>';
  html = html + '</div>';

  // accesorios
  html = html + '<div class="bloque">';
  html = html + '<h2>Accesorios</h2>';
  html = html + '<label>Tipo<select id="accesorio-tipo">';
  var codigosAcc = Object.keys(ACCESORIOS);
  for (var i = 0; i < codigosAcc.length; i++) {
    html = html + '<option value="' + codigosAcc[i] + '">' + ACCESORIOS[codigosAcc[i]].nombre + '</option>';
  }
  html = html + '</select></label>';
  html = html + '<div class="fila">';
  html = html + '<label>Distancia desde ' + tramo.a + ' [m]<input id="accesorio-distancia" type="number" step="0.1" min="0.1" value="' + redondear(Math.min(0.6, largo / 2)) + '"></label>';
  html = html + '<button class="boton" id="insertar-accesorio">Insertar</button>';
  html = html + '</div>';

  // lista de accesorios que ya tiene el tramo
  var lista = accesoriosDelTramo(tramo.id);
  if (lista.length == 0) {
    html = html + '<p class="nota">Este tramo no tiene accesorios.</p>';
  } else {
    html = html + '<ul class="lista-accesorios">';
    for (var j = 0; j < lista.length; j++) {
      var acc = lista[j];
      var color = "#" + ACCESORIOS[acc.tipo].color.toString(16).padStart(6, "0");
      html = html + '<li><i class="muestra" style="background:' + color + '"></i>' + ACCESORIOS[acc.tipo].nombre;
      html = html + '<span class="posicion">' + formatoNumero(acc.posicion) + ' m</span>';
      html = html + '<button data-quitar="' + acc.id + '" title="Quitar accesorio">×</button></li>';
    }
    html = html + '</ul>';
  }
  html = html + '</div>';

  html = html + '<button class="boton peligro" id="borrar-tramo">Eliminar tramo y lo que cuelga de él</button>';
  return html;
}


// ---------------------------------------------------------------------------
// actualizarPanel(): se llama al final de cada reconstruirEscena()
// ---------------------------------------------------------------------------
function actualizarPanel() {
  actualizarSelectorRed();
  if (creandoEquipo) {
    cajaContexto.innerHTML = htmlNuevoEquipo();
    conectarEventosNuevoEquipo();
  } else if (seleccion == null) {
    cajaContexto.innerHTML = htmlSinSeleccion();
    conectarEventosSinSeleccion();
  } else if (seleccion.tipo == "nodo") {
    cajaContexto.innerHTML = htmlNodo(red.nodos[seleccion.id]);
    conectarEventosNodo();
  } else {
    cajaContexto.innerHTML = htmlTramo(red.tramos[seleccion.id]);
    conectarEventosTramo();
  }
  actualizarPrevia();   // está en trazado.js
}


// ---------------------------------------------------------------------------
// Eventos de los botones del panel
// ---------------------------------------------------------------------------

function conectarEventosSinSeleccion() {
  document.getElementById("ir-origen").addEventListener("click", function () {
    // se selecciona el equipo de la red activa, o el primero si se ven todas
    if (redActiva != null) {
      dejarSeleccionado("nodo", redActiva);
    } else {
      dejarSeleccionado("nodo", idNodoRaiz());
    }
  });
}

// Antes de redibujar el panel se guardan las medidas escritas, con el fin de
// que no se pierdan al cambiar de rectangular a circular o al revés
function guardarBorradorNuevo() {
  try {
    var leido = leerSeccionDelPanel("nuevo", ultimaSeccion.forma);
    if (leido.seccion.forma == "rect") {
      ultimaSeccion.ancho = leido.seccion.ancho;
      ultimaSeccion.alto = leido.seccion.alto;
    } else {
      ultimaSeccion.diametro = leido.seccion.diametro;
    }
    largoBorrador = leido.largo;
  } catch (error) {
    // si hay un valor mal escrito simplemente no se guarda
  }
}

// Crea un tramo desde el nodo seleccionado hacia la dirección indicada, con la
// sección y el largo escritos en el panel. La usan los botones de dirección y
// el trazado con el mouse (trazado.js).
function crearTramoHacia(codigo) {
  var leido;
  try {
    leido = leerSeccionDelPanel("nuevo", ultimaSeccion.forma);
  } catch (error) {
    mostrarMensaje(error.message, "error");
    return;
  }
  guardarBorradorNuevo();

  var idNodoNuevo = null;
  var ok = modificarRed(function () {
    idNodoNuevo = agregarTramo(seleccion.id, codigo, leido.seccion, leido.largo);
  }, "Tramo agregado hacia " + NOMBRE_DIRECCION[codigo] + ".");

  // el nodo nuevo queda seleccionado para seguir trazando desde ahí
  if (ok) {
    dejarSeleccionado("nodo", idNodoNuevo);
  }
}

function conectarEventosNodo() {
  // los botones del equipo solo existen si el nodo es un equipo
  if (document.getElementById("tipo-equipo") != null) {
    conectarEventosEquipo();
  }

  // el formulario de tramo nuevo no existe si es un equipo que ya tiene su ducto
  if (document.getElementById("nuevo-rect") == null) {
    return;
  }

  document.getElementById("nuevo-rect").addEventListener("click", function () {
    guardarBorradorNuevo();
    ultimaSeccion.forma = "rect";
    actualizarPanel();
  });
  document.getElementById("nuevo-circ").addEventListener("click", function () {
    guardarBorradorNuevo();
    ultimaSeccion.forma = "circ";
    actualizarPanel();
  });

  // botones de dirección: cada uno agrega un tramo hacia su dirección
  var botones = document.querySelectorAll(".boton-direccion");
  for (var i = 0; i < botones.length; i++) {
    botones[i].addEventListener("click", function (evento) {
      crearTramoHacia(evento.currentTarget.getAttribute("data-direccion"));
    });
  }

  // Al escribir en los campos de medidas se actualiza la vista previa del
  // visor, y con Enter se crea el tramo hacia la dirección que marca el mouse
  var campos = ["nuevo-ancho", "nuevo-alto", "nuevo-diametro", "nuevo-largo"];
  for (var c = 0; c < campos.length; c++) {
    var campo = document.getElementById(campos[c]);
    if (campo == null) {
      continue;
    }
    campo.addEventListener("input", function () {
      actualizarPrevia();   // está en trazado.js
    });
    campo.addEventListener("keydown", function (evento) {
      if (evento.key == "Enter") {
        if (direccionPrevia == null) {
          mostrarMensaje("Primero se mueve el mouse en el visor para elegir la dirección del tramo.", "error");
        } else {
          crearTramoHacia(direccionPrevia);
        }
      }
    });
  }

  if (document.getElementById("terminal") == null) {
    return;
  }
  document.getElementById("terminal").addEventListener("change", function (evento) {
    var valor = evento.currentTarget.value;
    if (valor == "") {
      valor = null;
    }
    modificarRed(function () {
      red.nodos[seleccion.id].terminal = valor;
    }, "Terminal actualizado.");
  });
}

// Divide un tramo a la distancia indicada (medida desde su nodo a) y deja
// seleccionado el nodo nuevo para trazar el ramal. La usan el botón del panel
// y el clic sobre el tramo en el visor (trazado.js).
function crearDerivacionEn(idTramo, distancia) {
  var tramo = red.tramos[idTramo];
  var idNodoMedio = null;
  var ok = modificarRed(function () {
    idNodoMedio = dividirTramo(idTramo, distancia);
  }, "Punto de derivación creado a " + formatoNumero(distancia) + " m de " + tramo.a + ", ahora se traza el ramal con el mouse.");

  if (ok) {
    // la sección del ramal parte igual a la del tramo que se dividió
    ultimaSeccion = { forma: tramo.forma, ancho: tramo.ancho, alto: tramo.alto, diametro: tramo.diametro };
    dejarSeleccionado("nodo", idNodoMedio);
  }
}

function conectarEventosTramo() {
  var idTramo = seleccion.id;

  document.getElementById("edicion-rect").addEventListener("click", function () {
    formaEnEdicion = "rect";
    actualizarPanel();
  });
  document.getElementById("edicion-circ").addEventListener("click", function () {
    formaEnEdicion = "circ";
    actualizarPanel();
  });

  // aplicar cambios de sección y largo
  document.getElementById("aplicar").addEventListener("click", function () {
    var leido;
    try {
      leido = leerSeccionDelPanel("edicion", formaEnEdicion);
    } catch (error) {
      mostrarMensaje(error.message, "error");
      return;
    }
    modificarRed(function () {
      cambiarSeccionTramo(idTramo, leido.seccion);
      // el largo solo se cambia si es distinto, ya que, mover los nodos sin
      // necesidad podría acumular pequeños errores de redondeo
      if (Math.abs(leido.largo - largoTramo(red.tramos[idTramo])) > 0.0001) {
        cambiarLargoTramo(idTramo, leido.largo);
      }
    }, "Tramo " + idTramo + " actualizado.");
  });

  // crear punto de derivación
  document.getElementById("crear-derivacion").addEventListener("click", function () {
    crearDerivacionEn(idTramo, leerCampo("derivacion-distancia"));
  });
  // con Enter en el campo de distancia también se crea el punto
  document.getElementById("derivacion-distancia").addEventListener("keydown", function (evento) {
    if (evento.key == "Enter") {
      crearDerivacionEn(idTramo, leerCampo("derivacion-distancia"));
    }
  });

  // insertar accesorio
  document.getElementById("insertar-accesorio").addEventListener("click", function () {
    var distancia = leerCampo("accesorio-distancia");
    var tipo = document.getElementById("accesorio-tipo").value;
    var largo = largoTramo(red.tramos[idTramo]);
    if (!(distancia >= 0.05 && distancia <= largo - 0.05)) {
      mostrarMensaje("La posición debe estar entre 0,05 y " + formatoNumero(largo - 0.05) + " m.", "error");
      return;
    }
    modificarRed(function () {
      agregarAccesorio(idTramo, tipo, redondear(distancia));
    }, "Se insertó " + ACCESORIOS[tipo].nombre.toLowerCase() + " en el tramo " + idTramo + ".");
  });

  // botones × para quitar accesorios
  var botonesQuitar = document.querySelectorAll("[data-quitar]");
  for (var i = 0; i < botonesQuitar.length; i++) {
    botonesQuitar[i].addEventListener("click", function (evento) {
      var idAcc = evento.currentTarget.getAttribute("data-quitar");
      modificarRed(function () {
        quitarAccesorio(idAcc);
      }, "Accesorio quitado.");
    });
  }

  document.getElementById("borrar-tramo").addEventListener("click", function () {
    borrarTramoSeleccionado();
  });
}

// Borra el tramo seleccionado, se usa desde el botón del panel y con la tecla Supr
function borrarTramoSeleccionado() {
  var idNodoQueQueda = null;
  var ok = modificarRed(function () {
    idNodoQueQueda = borrarTramo(seleccion.id);
  }, "Tramo eliminado, con Ctrl+Z se puede deshacer.");

  if (ok && red.nodos[idNodoQueQueda]) {
    dejarSeleccionado("nodo", idNodoQueQueda);
  }
}


// ---------------------------------------------------------------------------
// Equipos y redes
// ---------------------------------------------------------------------------

// Bloque del panel cuando el nodo seleccionado es un equipo de origen
function htmlBloqueEquipo(nodo) {
  var html = "";
  html = html + '<div class="bloque">';
  html = html + '<h2>Equipo</h2>';
  html = html + '<select id="tipo-equipo">';
  var tipos = Object.keys(EQUIPOS);
  for (var i = 0; i < tipos.length; i++) {
    var elegido = "";
    if (nodo.terminal == tipos[i]) {
      elegido = " selected";
    }
    html = html + '<option value="' + tipos[i] + '"' + elegido + '>' + EQUIPOS[tipos[i]] + '</option>';
  }
  html = html + '</select>';
  html = html + '<p class="nota">Desde el equipo sale un solo ducto de descarga, el cual se conecta mediante una junta flexible y una transición de 30 cm.</p>';

  // solo se puede eliminar un equipo si queda al menos otro en el modelo
  if (listaDeOrigenes().length > 1) {
    html = html + '<button class="boton peligro" id="eliminar-red">Eliminar equipo y toda su red</button>';
  }
  html = html + '</div>';
  return html;
}

function conectarEventosEquipo() {
  var idEquipo = seleccion.id;

  document.getElementById("tipo-equipo").addEventListener("change", function (evento) {
    var tipo = evento.currentTarget.value;
    modificarRed(function () {
      red.nodos[idEquipo].terminal = tipo;
    }, "Equipo cambiado a " + EQUIPOS[tipo] + ".");
  });

  var botonEliminar = document.getElementById("eliminar-red");
  if (botonEliminar != null) {
    botonEliminar.addEventListener("click", function () {
      var ok = modificarRed(function () {
        eliminarRedCompleta(idEquipo);
      }, "Se eliminó el equipo " + idEquipo + " con toda su red, con Ctrl+Z se puede deshacer.");
      if (ok && redActiva == idEquipo) {
        redActiva = null;
        reconstruirEscena();
      }
    });
  }
}

// Formulario para crear un equipo nuevo. Se propone una posición 6 m más allá
// del nodo con mayor coordenada z, con el fin de que no quede encima de la red existente.
function htmlNuevoEquipo() {
  var zMaximo = 0;
  var ids = Object.keys(red.nodos);
  for (var i = 0; i < ids.length; i++) {
    if (red.nodos[ids[i]].z > zMaximo) {
      zMaximo = red.nodos[ids[i]].z;
    }
  }
  var zPropuesto = Math.ceil(zMaximo + 6);

  var html = "";
  html = html + '<div class="bloque">';
  html = html + '<h2>Nuevo equipo</h2>';
  html = html + '<label>Tipo<select id="nuevo-equipo-tipo">';
  var tipos = Object.keys(EQUIPOS);
  for (var j = 0; j < tipos.length; j++) {
    html = html + '<option value="' + tipos[j] + '">' + EQUIPOS[tipos[j]] + '</option>';
  }
  html = html + '</select></label>';
  html = html + '<div class="campos">';
  html = html + '<label>X [m]<input id="nuevo-equipo-x" type="number" step="0.5" value="0"></label>';
  html = html + '<label>Cota Y [m]<input id="nuevo-equipo-y" type="number" step="0.1" value="2.8"></label>';
  html = html + '<label>Z [m]<input id="nuevo-equipo-z" type="number" step="0.5" value="' + zPropuesto + '"></label>';
  html = html + '</div>';
  html = html + '<p class="nota">La posición corresponde al punto donde sale el ducto de descarga del equipo, el equipo se dibuja hacia atrás de ese punto.</p>';
  html = html + '<div class="fila">';
  html = html + '<button class="boton principal" id="crear-equipo">Crear equipo</button>';
  html = html + '<button class="boton" id="cancelar-equipo">Cancelar</button>';
  html = html + '</div>';
  html = html + '</div>';
  return html;
}

function conectarEventosNuevoEquipo() {
  document.getElementById("cancelar-equipo").addEventListener("click", function () {
    creandoEquipo = false;
    actualizarPanel();
  });

  document.getElementById("crear-equipo").addEventListener("click", function () {
    var tipo = document.getElementById("nuevo-equipo-tipo").value;
    var x = leerCampo("nuevo-equipo-x");
    var y = leerCampo("nuevo-equipo-y");
    var z = leerCampo("nuevo-equipo-z");
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      mostrarMensaje("Se deben escribir las tres coordenadas del equipo.", "error");
      return;
    }

    var idNuevo = null;
    var ok = modificarRed(function () {
      idNuevo = crearEquipoNuevo(tipo, x, y, z);
    }, EQUIPOS[tipo] + " creada en el nodo nuevo, ahora se traza su ducto de descarga.");

    if (ok) {
      creandoEquipo = false;
      // si se estaba trabajando con una red activa, se pasa a la red nueva
      if (redActiva != null) {
        redActiva = idNuevo;
      }
      dejarSeleccionado("nodo", idNuevo);
    }
  });
}

// Llena el selector de red activa de la barra del visor con un elemento por
// cada equipo, más la opción de ver todas las redes
var selectorRed = document.getElementById("selectorRed");

function actualizarSelectorRed() {
  var html = '<option value="">Todas las redes</option>';
  var origenes = listaDeOrigenes();
  for (var i = 0; i < origenes.length; i++) {
    var nodo = red.nodos[origenes[i]];
    var nombre = "UMA";
    if (nodo.terminal == "ventilador") {
      nombre = "Caja de ventilación";
    }
    var elegido = "";
    if (redActiva == nodo.id) {
      elegido = " selected";
    }
    html = html + '<option value="' + nodo.id + '"' + elegido + '>Red ' + nodo.id + ' · ' + nombre + '</option>';
  }
  selectorRed.innerHTML = html;
}

selectorRed.addEventListener("change", function () {
  if (selectorRed.value == "") {
    redActiva = null;
  } else {
    redActiva = selectorRed.value;
  }
  reconstruirEscena();
});
