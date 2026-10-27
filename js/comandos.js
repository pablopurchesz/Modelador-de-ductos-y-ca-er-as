// ============================================================================
// comandos.js
// En este archivo se encuentra el intérprete de comandos, es decir, la función
// que lee lo que el usuario escribe en la barra, revisa que esté bien escrito
// y llama a las funciones de datos.js para modificar la red. También están el
// indicador de selección y los mensajes que se muestran abajo de la barra.
// ============================================================================

var campoComando = document.getElementById("comando");
var cajaMensaje = document.getElementById("mensaje");
var cajaIndicador = document.getElementById("indicador");
var cajaAyuda = document.getElementById("ayuda");

// lista de comandos escritos, para poder repetirlos con las flechas arriba y abajo
var comandosAnteriores = [];
var posicionHistorial = 0;


// ---------------------------------------------------------------------------
// Mensajes e indicador
// ---------------------------------------------------------------------------

// tipo puede ser "ok", "error" o "" (mensaje normal)
function mostrarMensaje(texto, tipo) {
  cajaMensaje.textContent = texto;
  cajaMensaje.className = tipo;
}

// Muestra arriba a la izquierda qué está seleccionado
function actualizarIndicador() {
  if (seleccion == null) {
    cajaIndicador.innerHTML = "Sin selección · haz clic en un nodo o escribe sel N1";
    return;
  }

  if (seleccion.tipo == "nodo") {
    var nodo = red.nodos[seleccion.id];
    var tramos = tramosDelNodo(nodo.id);

    // se revisa qué direcciones quedan libres en el nodo
    var libres = [];
    var codigos = Object.keys(DIRECCIONES);
    for (var i = 0; i < codigos.length; i++) {
      var ocupada = false;
      for (var j = 0; j < tramos.length; j++) {
        if (codigoDireccion(direccionSaliendo(tramos[j], nodo.id)) == codigos[i]) {
          ocupada = true;
        }
      }
      if (!ocupada) {
        libres.push(codigos[i]);
      }
    }

    var texto = "Nodo <b>" + nodo.id + "</b> · cota " + formatoNumero(nodo.y) + " m · " + tramos.length + " tramo(s)";
    if (nodo.terminal != null) {
      texto = texto + " · " + TERMINALES[nodo.terminal];
    }
    texto = texto + "<br>Direcciones libres: " + libres.join(" ");
    cajaIndicador.innerHTML = texto;
  } else {
    var tramo = red.tramos[seleccion.id];
    cajaIndicador.innerHTML = "Tramo <b>" + tramo.id + "</b> · " + textoSeccion(tramo) + " mm · "
      + formatoNumero(largoTramo(tramo)) + " m · " + tramo.a + " → " + tramo.b;
  }
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

// Si lo que estaba seleccionado ya no existe (por ejemplo se borró) se quita la selección,
// ya que, si no el indicador intentaría mostrar un elemento que no está en la red
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

// Revisa que lo seleccionado sea del tipo que necesita el comando
function revisarSeleccion(tipo) {
  if (seleccion == null || seleccion.tipo != tipo) {
    if (tipo == "nodo") {
      throw new Error("Primero selecciona un nodo (clic o sel N1).");
    } else {
      throw new Error("Primero selecciona un tramo (clic o sel T1).");
    }
  }
}

// Convierte un texto a número aceptando coma o punto (2,5 o 2.5)
function leerNumero(texto) {
  if (texto == undefined) {
    return NaN;
  }
  return parseFloat(texto.replace(",", "."));
}

// Lee la sección escrita: "600x400" es rectangular y "D315" es circular.
// Devuelve null si no se entiende lo escrito.
function leerSeccion(texto) {
  texto = texto.toLowerCase();

  if (texto.charAt(0) == "d" || texto.charAt(0) == "ø") {
    var diametro = Math.round(leerNumero(texto.substring(1)));
    if (isNaN(diametro)) {
      return null;
    }
    return { forma: "circ", diametro: diametro };
  }

  var partes = texto.split("x");
  if (partes.length == 2) {
    var ancho = Math.round(leerNumero(partes[0]));
    var alto = Math.round(leerNumero(partes[1]));
    if (isNaN(ancho) || isNaN(alto)) {
      return null;
    }
    return { forma: "rect", ancho: ancho, alto: alto };
  }
  return null;
}


// ---------------------------------------------------------------------------
// Intérprete de comandos
// ---------------------------------------------------------------------------
// Se separa la línea en palabras y según la primera palabra se decide qué hacer.
function ejecutarComando(linea) {
  var palabras = linea.trim().split(/\s+/);
  if (palabras.length == 0 || palabras[0] == "") {
    return;
  }
  var primera = palabras[0].toUpperCase();

  // ----- tramo nuevo: dirección largo [sección] -----
  if (DIRECCIONES[primera] != undefined) {
    revisarSeleccion("nodo");

    var largo = leerNumero(palabras[1]);
    if (isNaN(largo) || largo < 0.1 || largo > 100) {
      throw new Error("Largo inválido. Ejemplo: +X 3 600x400 (largo entre 0,1 y 100 m).");
    }

    var seccion;
    if (palabras.length >= 3) {
      seccion = leerSeccion(palabras[2]);
      if (seccion == null) {
        throw new Error("Sección \"" + palabras[2] + "\" no reconocida. Usa 600x400 o D315.");
      }
    } else {
      // si no se escribe sección se usa la última
      seccion = {
        forma: ultimaSeccion.forma,
        ancho: ultimaSeccion.ancho,
        alto: ultimaSeccion.alto,
        diametro: ultimaSeccion.diametro
      };
    }

    if (seccion.forma == "rect" && (seccion.ancho < 50 || seccion.ancho > 3000 || seccion.alto < 50 || seccion.alto > 3000)) {
      throw new Error("Ancho y alto deben estar entre 50 y 3000 mm.");
    }
    if (seccion.forma == "circ" && (seccion.diametro < 50 || seccion.diametro > 2000)) {
      throw new Error("El diámetro debe estar entre 50 y 2000 mm.");
    }

    var nodoInicio = seleccion.id;
    var nodoNuevo = null;
    var textoSec = textoSeccion(seccion);
    var ok = modificarRed(function () {
      nodoNuevo = agregarTramo(nodoInicio, primera, seccion, largo);
    }, "Tramo " + textoSec + " de " + formatoNumero(largo) + " m hacia " + NOMBRE_DIRECCION[primera] + ".");

    if (ok) {
      // el nodo nuevo queda seleccionado para seguir escribiendo
      ultimaSeccion = seccion;
      seleccion = { tipo: "nodo", id: nodoNuevo };
      reconstruirEscena();
    }
    return;
  }

  // ----- derivación: der distancia -----
  if (primera == "DER") {
    revisarSeleccion("tramo");
    var distancia = leerNumero(palabras[1]);
    if (isNaN(distancia)) {
      throw new Error("Indica la distancia desde el inicio del tramo. Ejemplo: der 2.5");
    }
    var tramo = red.tramos[seleccion.id];
    var nodoMedio = null;
    var ok2 = modificarRed(function () {
      nodoMedio = dividirTramo(tramo.id, distancia);
    }, "Punto de derivación creado, ahora escribe la dirección del ramal.");

    if (ok2) {
      ultimaSeccion = { forma: tramo.forma, ancho: tramo.ancho, alto: tramo.alto, diametro: tramo.diametro };
      seleccion = { tipo: "nodo", id: nodoMedio };
      reconstruirEscena();
    }
    return;
  }

  // ----- accesorio: acc tipo distancia -----
  if (primera == "ACC") {
    revisarSeleccion("tramo");
    var codigoAcc = (palabras[1] || "").toUpperCase();
    if (ACCESORIOS[codigoAcc] == undefined) {
      throw new Error("Tipo de accesorio no reconocido. Usa CR, CCF, SIL, FIL o VAV.");
    }
    var tramoAcc = red.tramos[seleccion.id];
    var largoT = largoTramo(tramoAcc);
    var posicion = leerNumero(palabras[2]);
    if (isNaN(posicion) || posicion < 0.05 || posicion > largoT - 0.05) {
      throw new Error("La posición debe estar entre 0,05 y " + formatoNumero(largoT - 0.05) + " m.");
    }
    modificarRed(function () {
      agregarAccesorio(tramoAcc.id, codigoAcc, redondear(posicion));
    }, "Se insertó " + ACCESORIOS[codigoAcc].nombre + " en " + tramoAcc.id + ".");
    return;
  }

  // ----- terminal: term tipo -----
  if (primera == "TERM") {
    revisarSeleccion("nodo");
    var tipoTerm = (palabras[1] || "").toLowerCase();
    if (TERMINALES[tipoTerm] == undefined && tipoTerm != "ninguno") {
      throw new Error("Terminal no reconocido. Usa difusor, rejilla, tapa, uma o ninguno.");
    }
    if (tramosDelNodo(seleccion.id).length != 1) {
      throw new Error("Solo los nodos extremos (con un solo tramo) pueden tener terminal.");
    }
    var idNodo = seleccion.id;
    var mensajeTerm = "Se quitó el terminal.";
    if (tipoTerm != "ninguno") {
      mensajeTerm = "Se asignó " + TERMINALES[tipoTerm] + " a " + idNodo + ".";
    }
    modificarRed(function () {
      if (tipoTerm == "ninguno") {
        red.nodos[idNodo].terminal = null;
      } else {
        red.nodos[idNodo].terminal = tipoTerm;
      }
    }, mensajeTerm);
    return;
  }

  // ----- seleccionar: sel N3 o sel T2 -----
  if (primera == "SEL") {
    var id = (palabras[1] || "").toUpperCase();
    if (red.nodos[id] != undefined) {
      seleccionar({ tipo: "nodo", id: id });
    } else if (red.tramos[id] != undefined) {
      seleccionar({ tipo: "tramo", id: id });
    } else {
      throw new Error("No existe el elemento " + id + ".");
    }
    return;
  }

  // ----- borrar el tramo seleccionado -----
  if (primera == "BORRAR") {
    revisarSeleccion("tramo");
    var idTramo = seleccion.id;
    var nodoQueQueda = null;
    var ok3 = modificarRed(function () {
      nodoQueQueda = borrarTramo(idTramo);
    }, "Tramo borrado, escribe deshacer para recuperarlo.");
    if (ok3) {
      seleccion = { tipo: "nodo", id: nodoQueQueda };
      reconstruirEscena();
    }
    return;
  }

  // ----- deshacer -----
  if (primera == "DESHACER") {
    if (deshacer()) {
      quitarSeleccionSiNoExiste();
      reconstruirEscena();
      mostrarMensaje("Cambio deshecho.", "");
    } else {
      mostrarMensaje("No hay cambios para deshacer.", "");
    }
    return;
  }

  // ----- red de ejemplo o red nueva -----
  if (primera == "EJEMPLO") {
    modificarRed(function () { crearRedEjemplo(); }, "Red de ejemplo cargada.");
    seleccion = null;
    reconstruirEscena();
    vistaIso();
    return;
  }
  if (primera == "NUEVO") {
    modificarRed(function () { crearRedVacia(); }, "Red vacía, N1 es la UMA. Escribe por ejemplo +X 5 600x400.");
    seleccion = { tipo: "nodo", id: idNodoRaiz() };
    reconstruirEscena();
    vistaIso();
    return;
  }

  if (primera == "AYUDA") {
    alternarAyuda();
    return;
  }

  throw new Error("Comando \"" + palabras[0] + "\" no reconocido. Escribe ayuda para ver la lista.");
}


// ---------------------------------------------------------------------------
// Eventos de la barra, botones y teclado
// ---------------------------------------------------------------------------

function alternarAyuda() {
  if (cajaAyuda.className == "oculto") {
    cajaAyuda.className = "";
    document.getElementById("btnAyuda").className = "activo";
  } else {
    cajaAyuda.className = "oculto";
    document.getElementById("btnAyuda").className = "";
  }
}

// Al apretar Enter se ejecuta el comando, con las flechas se recorren los anteriores
campoComando.addEventListener("keydown", function (evento) {
  if (evento.key == "Enter") {
    var linea = campoComando.value;
    if (linea.trim() == "") {
      return;
    }
    comandosAnteriores.push(linea);
    posicionHistorial = comandosAnteriores.length;
    try {
      ejecutarComando(linea);
      campoComando.value = "";
    } catch (error) {
      mostrarMensaje(error.message, "error");
    }
  } else if (evento.key == "ArrowUp") {
    if (posicionHistorial > 0) {
      posicionHistorial = posicionHistorial - 1;
      campoComando.value = comandosAnteriores[posicionHistorial];
    }
    evento.preventDefault();
  } else if (evento.key == "ArrowDown") {
    if (posicionHistorial < comandosAnteriores.length) {
      posicionHistorial = posicionHistorial + 1;
      campoComando.value = comandosAnteriores[posicionHistorial] || "";
    }
    evento.preventDefault();
  }
});

// Atajos de teclado cuando no se está escribiendo en la barra
window.addEventListener("keydown", function (evento) {
  if (evento.target == campoComando) {
    return;
  }
  if (evento.ctrlKey && evento.key.toLowerCase() == "z") {
    evento.preventDefault();
    ejecutarComando("deshacer");
  } else if (evento.key == "Escape") {
    seleccionar(null);
  } else if (evento.key == "Delete" && seleccion != null && seleccion.tipo == "tramo") {
    try {
      ejecutarComando("borrar");
    } catch (error) {
      mostrarMensaje(error.message, "error");
    }
  }
});

document.getElementById("btnIso").addEventListener("click", vistaIso);
document.getElementById("btnPlanta").addEventListener("click", vistaPlanta);
document.getElementById("btnElevacion").addEventListener("click", vistaElevacion);
document.getElementById("btnAyuda").addEventListener("click", alternarAyuda);
document.getElementById("btnCotas").addEventListener("click", function () {
  mostrarCotas = !mostrarCotas;
  if (mostrarCotas) {
    document.getElementById("btnCotas").className = "activo";
  } else {
    document.getElementById("btnCotas").className = "";
  }
  reconstruirEscena();
});
