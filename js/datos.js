// ============================================================================
// datos.js
// En este archivo se guarda la información de la red (nodos, tramos y
// accesorios) y las funciones que la modifican. Aquí NO se dibuja nada, la
// escena 3D se arma después en escena.js leyendo estos datos, es por esto que
// cualquier cambio en la red se debe hacer siempre con las funciones de este
// archivo y no directamente sobre los objetos de Three.js.
// ============================================================================


// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Direcciones en las que se puede dibujar un tramo, cada una es un vector [x, y, z].
// En Three.js el eje Y es el vertical, por lo que +Y es subir y -Y es bajar.
var DIRECCIONES = {
  "+X": [1, 0, 0],
  "-X": [-1, 0, 0],
  "+Y": [0, 1, 0],
  "-Y": [0, -1, 0],
  "+Z": [0, 0, 1],
  "-Z": [0, 0, -1]
};

// Nombres que se muestran en los mensajes para cada dirección
var NOMBRE_DIRECCION = {
  "+X": "+X",
  "-X": "-X",
  "+Y": "arriba",
  "-Y": "abajo",
  "+Z": "+Z",
  "-Z": "-Z"
};

// Accesorios que se pueden poner sobre un tramo, el código es el que se guarda en cada accesorio.
// La caja VAV se quitó de la lista, ya que, la regulación de caudal se hace con
// compuertas de regulación (templadores).
var ACCESORIOS = {
  CR:  { nombre: "Compuerta de regulación", color: 0xd39a1f },
  CCF: { nombre: "Compuerta cortafuego",    color: 0xc4362b },
  SIL: { nombre: "Silenciador",             color: 0x6c7883 },
  FIL: { nombre: "Filtro",                  color: 0x7d9a5a }
};

// Terminales que se pueden poner en los extremos de la red
var TERMINALES = {
  difusor: "Difusor de techo 4 vías",
  rejilla: "Rejilla de retorno",
  tapa:    "Tapa ciega"
};

// Equipos que pueden ser el origen de una red. Cada red tiene un solo equipo y
// es el nodo desde donde se empieza a trazar, por lo que estos ya no se
// mezclan con los terminales de los extremos.
var EQUIPOS = {
  uma:        "Unidad manejadora de aire (UMA)",
  ventilador: "Caja de ventilación"
};

// Nombre con el que se guarda la red en el navegador (localStorage)
var NOMBRE_GUARDADO = "modelador-ductos";


// ---------------------------------------------------------------------------
// Variables globales
// ---------------------------------------------------------------------------

// La red completa. Se usan objetos en vez de arreglos para poder buscar
// cada elemento por su id, por ejemplo red.nodos["N3"].
var red = null;

// Elemento seleccionado, es null o un objeto del tipo { tipo: "nodo", id: "N3" }
var seleccion = null;

// Lista de copias de la red para poder deshacer
var historial = [];

// Última sección que se usó, sirve para cuando el usuario no escribe la sección
var ultimaSeccion = { forma: "rect", ancho: 400, alto: 300, diametro: 250 };


// ---------------------------------------------------------------------------
// Funciones para crear la red
// ---------------------------------------------------------------------------

// Crea una red vacía con un solo nodo, el cual corresponde a la UMA
function crearRedVacia() {
  red = {
    nodos: {},
    tramos: {},
    accesorios: {},
    contadorNodos: 1,
    contadorTramos: 1,
    contadorAccesorios: 1
  };
  var idUma = crearNodo(0, 2.8, 0);   // la red parte a 2,8 m de altura
  red.nodos[idUma].terminal = "uma";
  red.nodos[idUma].origen = true;
}

// Crea un nodo en la posición indicada (en metros) y devuelve su id
function crearNodo(x, y, z) {
  var id = "N" + red.contadorNodos;
  red.contadorNodos = red.contadorNodos + 1;
  red.nodos[id] = {
    id: id,
    x: x,
    y: y,     // la coordenada y es la cota del nodo
    z: z,
    terminal: null,   // en un extremo es el terminal y en un origen es el tipo de equipo
    origen: false     // true si el nodo es el equipo (UMA o caja de ventilación) de una red
  };
  return id;
}

// ---------------------------------------------------------------------------
// Varias redes en el mismo modelo
// ---------------------------------------------------------------------------
// El modelo puede tener varias redes independientes, cada una con su propio
// equipo de origen. Las redes no se guardan por separado, sino que una red es
// simplemente el conjunto de nodos que están unidos por tramos, es por esto
// que para saber a qué red pertenece un nodo se recorren los tramos desde ese
// nodo (con nodosConectados) hasta encontrar el nodo que tiene origen = true.

// Devuelve el id del primer equipo del modelo
function idNodoRaiz() {
  var origenes = listaDeOrigenes();
  if (origenes.length == 0) {
    return Object.keys(red.nodos)[0];
  }
  return origenes[0];
}

// Devuelve los ids de todos los nodos que son equipo de origen
function listaDeOrigenes() {
  var lista = [];
  var ids = Object.keys(red.nodos);
  for (var i = 0; i < ids.length; i++) {
    if (red.nodos[ids[i]].origen) {
      lista.push(ids[i]);
    }
  }
  return lista;
}

// Devuelve el id del equipo de la red a la que pertenece un nodo
function origenDeNodo(idNodo) {
  var nodosDeLaRed = nodosConectados(idNodo, null);
  for (var i = 0; i < nodosDeLaRed.length; i++) {
    if (red.nodos[nodosDeLaRed[i]].origen) {
      return nodosDeLaRed[i];
    }
  }
  return null;
}

// Crea un equipo nuevo (origen de una red nueva) en la posición indicada en metros.
// Se revisa que no quede encima de otro nodo, ya que, no se podrían diferenciar.
function crearEquipoNuevo(tipo, x, y, z) {
  var ids = Object.keys(red.nodos);
  for (var i = 0; i < ids.length; i++) {
    var n = red.nodos[ids[i]];
    var distancia = Math.sqrt((n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) + (n.z - z) * (n.z - z));
    if (distancia < 0.5) {
      throw new Error("Ya existe el nodo " + n.id + " a menos de 0,5 m de esa posición.");
    }
  }
  var id = crearNodo(redondear(x), redondear(y), redondear(z));
  red.nodos[id].terminal = tipo;
  red.nodos[id].origen = true;
  return id;
}

// Borra un equipo junto con toda su red (nodos, tramos y accesorios)
function eliminarRedCompleta(idOrigen) {
  if (listaDeOrigenes().length <= 1) {
    throw new Error("El modelo debe tener al menos un equipo.");
  }
  var nodosDeLaRed = nodosConectados(idOrigen, null);
  for (var i = 0; i < nodosDeLaRed.length; i++) {
    delete red.nodos[nodosDeLaRed[i]];
  }
  var idsTramos = Object.keys(red.tramos);
  for (var j = 0; j < idsTramos.length; j++) {
    var t = red.tramos[idsTramos[j]];
    if (!red.nodos[t.a] || !red.nodos[t.b]) {
      delete red.tramos[t.id];
    }
  }
  var idsAcc = Object.keys(red.accesorios);
  for (var k = 0; k < idsAcc.length; k++) {
    if (!red.tramos[red.accesorios[idsAcc[k]].tramo]) {
      delete red.accesorios[idsAcc[k]];
    }
  }
}


// ---------------------------------------------------------------------------
// Funciones para consultar datos de la red
// ---------------------------------------------------------------------------

// Devuelve la posición de un nodo como un vector de Three.js
function posicionNodo(idNodo) {
  var nodo = red.nodos[idNodo];
  return new THREE.Vector3(nodo.x, nodo.y, nodo.z);
}

// Dirección de un tramo (vector de largo 1 que va desde el nodo a hasta el nodo b)
function direccionTramo(tramo) {
  var a = posicionNodo(tramo.a);
  var b = posicionNodo(tramo.b);
  var direccion = b.sub(a);
  direccion.normalize();
  return direccion;
}

// Largo de un tramo en metros
function largoTramo(tramo) {
  var a = posicionNodo(tramo.a);
  var b = posicionNodo(tramo.b);
  return a.distanceTo(b);
}

// Devuelve la lista de tramos que llegan o salen de un nodo
function tramosDelNodo(idNodo) {
  var lista = [];
  var ids = Object.keys(red.tramos);
  for (var i = 0; i < ids.length; i++) {
    var tramo = red.tramos[ids[i]];
    if (tramo.a == idNodo || tramo.b == idNodo) {
      lista.push(tramo);
    }
  }
  return lista;
}

// Dirección en la que un tramo "sale" de un nodo. Si el nodo es el inicio del
// tramo es la misma dirección del tramo, si es el final es la dirección contraria.
function direccionSaliendo(tramo, idNodo) {
  var direccion = direccionTramo(tramo);
  if (tramo.b == idNodo) {
    direccion.negate();
  }
  return direccion;
}

// A partir de un vector devuelve el código de dirección ("+X", "-Y", etc.)
function codigoDireccion(vector) {
  var codigos = Object.keys(DIRECCIONES);
  for (var i = 0; i < codigos.length; i++) {
    var d = DIRECCIONES[codigos[i]];
    var punto = vector.x * d[0] + vector.y * d[1] + vector.z * d[2];   // producto punto
    if (punto > 0.99) {
      return codigos[i];
    }
  }
  return "?";
}

// Texto de la sección, por ejemplo "600×400" o "Ø315"
function textoSeccion(tramo) {
  if (tramo.forma == "rect") {
    return tramo.ancho + "×" + tramo.alto;
  } else {
    return "Ø" + tramo.diametro;
  }
}

// Formatea un número con 2 decimales y coma, por ejemplo 2.5 -> "2,50"
function formatoNumero(numero) {
  return numero.toFixed(2).replace(".", ",");
}

// Redondea a 4 decimales para que no se acumulen errores como 2.9999999
function redondear(numero) {
  return Math.round(numero * 10000) / 10000;
}


// ---------------------------------------------------------------------------
// Vector de ancho de los ductos rectangulares
// ---------------------------------------------------------------------------
// Un ducto de 600x400 puede ir con el ancho acostado o parado, por lo que cada
// tramo guarda un vector "ancho" que dice hacia dónde apunta su ancho.
//  - Si el tramo es horizontal, el ancho se deja horizontal y perpendicular al tramo.
//  - Si el tramo es vertical, se copia el ancho del tramo anterior, ya que, de lo
//    contrario la sección giraría al subir o bajar.
function calcularVectorAncho(direccion, tramoAnterior) {
  var esVertical = Math.abs(direccion.y) > 0.5;

  if (!esVertical) {
    // producto cruz entre el eje vertical y la dirección del tramo
    var arriba = new THREE.Vector3(0, 1, 0);
    var ancho = new THREE.Vector3();
    ancho.crossVectors(arriba, direccion);
    ancho.normalize();
    return ancho;
  }

  if (tramoAnterior != null) {
    var anchoAnterior = new THREE.Vector3(tramoAnterior.ancho3d[0], tramoAnterior.ancho3d[1], tramoAnterior.ancho3d[2]);
    // solo sirve si el ancho anterior no apunta en la misma dirección que el tramo nuevo
    if (Math.abs(anchoAnterior.dot(direccion)) < 0.5) {
      return anchoAnterior;
    }
  }
  return new THREE.Vector3(0, 0, 1);
}


// ---------------------------------------------------------------------------
// Funciones que modifican la red
// ---------------------------------------------------------------------------

// Agrega un tramo nuevo desde un nodo, en una dirección, con una sección y un largo.
// Devuelve el id del nodo nuevo que queda al final del tramo.
function agregarTramo(idNodoInicio, codigo, seccion, largo) {
  var direccion = new THREE.Vector3(DIRECCIONES[codigo][0], DIRECCIONES[codigo][1], DIRECCIONES[codigo][2]);

  // Primeramente se revisa que no exista otro tramo saliendo en la misma dirección
  var tramosExistentes = tramosDelNodo(idNodoInicio);

  // del equipo sale un solo ducto de descarga, las derivaciones se hacen después
  if (red.nodos[idNodoInicio].origen && tramosExistentes.length >= 1) {
    throw new Error("Del equipo " + idNodoInicio + " sale un solo ducto, las derivaciones se hacen más adelante en la red.");
  }
  for (var i = 0; i < tramosExistentes.length; i++) {
    var sale = direccionSaliendo(tramosExistentes[i], idNodoInicio);
    if (sale.dot(direccion) > 0.99) {
      throw new Error("El nodo " + idNodoInicio + " ya tiene un tramo hacia " + NOMBRE_DIRECCION[codigo] + ".");
    }
  }

  // Se calcula la posición del nodo nuevo
  var inicio = posicionNodo(idNodoInicio);
  var fin = inicio.clone();
  fin.x = redondear(inicio.x + direccion.x * largo);
  fin.y = redondear(inicio.y + direccion.y * largo);
  fin.z = redondear(inicio.z + direccion.z * largo);
  var idNodoFin = crearNodo(fin.x, fin.y, fin.z);

  // Se calcula el vector de ancho usando el primer tramo que llega al nodo (si hay)
  var tramoAnterior = null;
  if (tramosExistentes.length > 0) {
    tramoAnterior = tramosExistentes[0];
  }
  var ancho = calcularVectorAncho(direccion, tramoAnterior);

  // Se crea el tramo
  var id = "T" + red.contadorTramos;
  red.contadorTramos = red.contadorTramos + 1;
  red.tramos[id] = {
    id: id,
    a: idNodoInicio,
    b: idNodoFin,
    forma: seccion.forma,          // "rect" o "circ"
    ancho: seccion.ancho || 0,     // en mm
    alto: seccion.alto || 0,       // en mm
    diametro: seccion.diametro || 0,
    ancho3d: [ancho.x, ancho.y, ancho.z]
  };

  // si el nodo de inicio tenía un terminal se le quita, porque ya no es extremo,
  // salvo en el equipo de origen, donde terminal guarda el tipo de equipo
  if (!red.nodos[idNodoInicio].origen) {
    red.nodos[idNodoInicio].terminal = null;
  }

  return idNodoFin;
}

// Agrega un accesorio sobre un tramo, a una distancia (m) medida desde su nodo inicial
function agregarAccesorio(idTramo, codigo, distancia) {
  var id = "A" + red.contadorAccesorios;
  red.contadorAccesorios = red.contadorAccesorios + 1;
  red.accesorios[id] = {
    id: id,
    tramo: idTramo,
    tipo: codigo,
    posicion: distancia
  };
}

// Devuelve los ids de todos los nodos a los que se llega desde idNodo sin pasar
// por el tramo idTramoExcluido. Como la red es un árbol, esto entrega todo lo que
// "cuelga" de ese lado del tramo. Se recorre la red con una pila (búsqueda en profundidad).
function nodosConectados(idNodo, idTramoExcluido) {
  var visitados = {};
  visitados[idNodo] = true;
  var pila = [idNodo];

  while (pila.length > 0) {
    var actual = pila.pop();
    var tramos = tramosDelNodo(actual);
    for (var i = 0; i < tramos.length; i++) {
      var t = tramos[i];
      if (t.id == idTramoExcluido) {
        continue;
      }
      var otro = t.a;
      if (t.a == actual) {
        otro = t.b;
      }
      if (!visitados[otro]) {
        visitados[otro] = true;
        pila.push(otro);
      }
    }
  }
  return Object.keys(visitados);
}

// Divide un tramo en dos creando un nodo intermedio a "distancia" metros de su inicio.
// Así se hacen las derivaciones, ya que, desde el nodo nuevo se puede sacar un ramal.
function dividirTramo(idTramo, distancia) {
  var tramo = red.tramos[idTramo];
  var largo = largoTramo(tramo);
  if (distancia <= 0.05 || distancia >= largo - 0.05) {
    throw new Error("La distancia debe estar entre 0,05 y " + formatoNumero(largo - 0.05) + " m.");
  }

  var direccion = direccionTramo(tramo);
  var inicio = posicionNodo(tramo.a);
  var idNodoMedio = crearNodo(
    redondear(inicio.x + direccion.x * distancia),
    redondear(inicio.y + direccion.y * distancia),
    redondear(inicio.z + direccion.z * distancia)
  );

  // el tramo nuevo es una copia del original que va desde el nodo medio hasta el final
  var idNuevo = "T" + red.contadorTramos;
  red.contadorTramos = red.contadorTramos + 1;
  red.tramos[idNuevo] = {
    id: idNuevo,
    a: idNodoMedio,
    b: tramo.b,
    forma: tramo.forma,
    ancho: tramo.ancho,
    alto: tramo.alto,
    diametro: tramo.diametro,
    ancho3d: tramo.ancho3d.slice()
  };
  // el tramo original ahora termina en el nodo medio
  tramo.b = idNodoMedio;

  // los accesorios que quedaron después del corte se pasan al tramo nuevo
  var idsAcc = Object.keys(red.accesorios);
  for (var i = 0; i < idsAcc.length; i++) {
    var acc = red.accesorios[idsAcc[i]];
    if (acc.tramo == idTramo && acc.posicion > distancia) {
      acc.tramo = idNuevo;
      acc.posicion = redondear(acc.posicion - distancia);
    }
  }
  return idNodoMedio;
}

// Borra un tramo junto con todo lo que cuelga de él (nunca el lado del equipo).
// Devuelve el id del nodo que queda, para dejarlo seleccionado.
function borrarTramo(idTramo) {
  var tramo = red.tramos[idTramo];
  var nodosABorrar = nodosConectados(tramo.b, idTramo);
  var nodoQueQueda = tramo.a;

  // si por el lado b está el equipo de la red entonces se borra el otro lado
  if (nodosABorrar.indexOf(origenDeNodo(tramo.a)) != -1) {
    nodosABorrar = nodosConectados(tramo.a, idTramo);
    nodoQueQueda = tramo.b;
  }

  delete red.tramos[idTramo];
  for (var i = 0; i < nodosABorrar.length; i++) {
    delete red.nodos[nodosABorrar[i]];
  }

  // se borran los tramos que quedaron sin alguno de sus nodos
  var idsTramos = Object.keys(red.tramos);
  for (var j = 0; j < idsTramos.length; j++) {
    var t = red.tramos[idsTramos[j]];
    if (!red.nodos[t.a] || !red.nodos[t.b]) {
      delete red.tramos[t.id];
    }
  }

  // y los accesorios que quedaron sin tramo
  var idsAcc = Object.keys(red.accesorios);
  for (var k = 0; k < idsAcc.length; k++) {
    var acc = red.accesorios[idsAcc[k]];
    if (!red.tramos[acc.tramo]) {
      delete red.accesorios[acc.id];
    }
  }
  return nodoQueQueda;
}


// ---------------------------------------------------------------------------
// Deshacer y guardar
// ---------------------------------------------------------------------------
// Para deshacer se guarda una copia completa de la red antes de cada cambio.
// La forma más simple de copiar un objeto es pasarlo a texto JSON y volverlo a leer.

function guardarCopia() {
  historial.push(JSON.stringify(red));
  if (historial.length > 50) {
    historial.shift();   // se guardan como máximo 50 copias
  }
}

function deshacer() {
  if (historial.length == 0) {
    return false;
  }
  red = JSON.parse(historial.pop());
  return true;
}

// Guarda la red en el navegador para que no se pierda al recargar la página
function guardarEnNavegador() {
  try {
    localStorage.setItem(NOMBRE_GUARDADO, JSON.stringify(red));
  } catch (e) {
    // en algunos navegadores (modo privado) no se puede guardar, no pasa nada
  }
}

// Una red guardada con una versión anterior puede tener accesorios que ya no
// existen en la lista ACCESORIOS (por ejemplo cajas VAV), por lo que se quitan
// al cargar, de lo contrario el programa no sabría cómo dibujarlos
function quitarAccesoriosDesconocidos() {
  var idsAcc = Object.keys(red.accesorios);
  for (var i = 0; i < idsAcc.length; i++) {
    var acc = red.accesorios[idsAcc[i]];
    if (ACCESORIOS[acc.tipo] == undefined) {
      delete red.accesorios[acc.id];
    }
  }
}

// En las versiones anteriores no existía la propiedad origen, ya que, la UMA
// era siempre el primer nodo, por lo que al cargar una red antigua se marca el
// primer nodo como origen y se quitan las "uma" que hubieran quedado como terminal
function marcarOrigenesAntiguos() {
  if (listaDeOrigenes().length > 0) {
    return;
  }
  var ids = Object.keys(red.nodos);
  for (var i = 0; i < ids.length; i++) {
    red.nodos[ids[i]].origen = false;
    if (red.nodos[ids[i]].terminal == "uma") {
      red.nodos[ids[i]].terminal = null;
    }
  }
  red.nodos[ids[0]].origen = true;
  red.nodos[ids[0]].terminal = "uma";
}

// Intenta cargar la red guardada, devuelve true si lo logra
function cargarDesdeNavegador() {
  try {
    var texto = localStorage.getItem(NOMBRE_GUARDADO);
    if (texto) {
      var datos = JSON.parse(texto);
      if (datos.nodos && Object.keys(datos.nodos).length > 0) {
        red = datos;
        quitarAccesoriosDesconocidos();
        marcarOrigenesAntiguos();
        return true;
      }
    }
  } catch (e) {
    console.log("No se pudo cargar la red guardada", e);
  }
  return false;
}


// ---------------------------------------------------------------------------
// Red de ejemplo (la misma del caso de prueba del informe)
// ---------------------------------------------------------------------------
function crearRedEjemplo() {
  crearRedVacia();
  var rect = function (a, b) { return { forma: "rect", ancho: a, alto: b }; };
  var circ = function (d) { return { forma: "circ", diametro: d }; };

  // troncal
  var n2 = agregarTramo("N1", "+X", rect(600, 400), 5);
  var n3 = agregarTramo(n2, "+X", rect(500, 350), 4);
  var n4 = agregarTramo(n3, "+Z", rect(500, 350), 3.5);
  var n5 = agregarTramo(n4, "+X", rect(400, 300), 3);
  var n6 = agregarTramo(n5, "-Y", circ(315), 0.6);
  red.nodos[n6].terminal = "difusor";

  // ramal desde N2
  var n7 = agregarTramo(n2, "-Z", rect(300, 250), 3);
  var n8 = agregarTramo(n7, "-Y", circ(250), 0.5);
  red.nodos[n8].terminal = "difusor";

  // ramal desde N3
  var n9 = agregarTramo(n3, "-Z", rect(300, 250), 2.5);
  var n10 = agregarTramo(n9, "-Y", circ(250), 0.5);
  red.nodos[n10].terminal = "difusor";

  // derivación sobre el tramo T3
  var n11 = dividirTramo("T3", 1.75);
  var n12 = agregarTramo(n11, "-X", rect(350, 250), 2.2);
  var n13 = agregarTramo(n12, "-Y", rect(300, 200), 0.4);
  red.nodos[n13].terminal = "rejilla";

  // accesorios
  agregarAccesorio("T1", "CCF", 0.8);
  agregarAccesorio("T1", "SIL", 2.6);
  agregarAccesorio("T6", "CR", 0.7);
  agregarAccesorio("T8", "CR", 0.6);
}


// ---------------------------------------------------------------------------
// Funciones de edición que usa el panel lateral
// ---------------------------------------------------------------------------

// Cambia el largo de un tramo. Como la red es un árbol, al alargar o acortar un
// tramo se debe mover también todo lo que está aguas abajo de él, es decir, los
// nodos que cuelgan del nodo b, por lo que se buscan con nodosConectados() y a
// cada uno se le suma la diferencia de largo en la dirección del tramo.
function cambiarLargoTramo(idTramo, largoNuevo) {
  var tramo = red.tramos[idTramo];
  var direccion = direccionTramo(tramo);
  var diferencia = largoNuevo - largoTramo(tramo);

  var nodosQueSeMueven = nodosConectados(tramo.b, idTramo);
  // si dentro de los nodos que se mueven está el equipo significa que el tramo está
  // dibujado "al revés" respecto al origen, en ese caso no se permite el cambio
  if (nodosQueSeMueven.indexOf(origenDeNodo(tramo.a)) != -1) {
    throw new Error("No se puede cambiar el largo de este tramo desde este lado.");
  }

  for (var i = 0; i < nodosQueSeMueven.length; i++) {
    var nodo = red.nodos[nodosQueSeMueven[i]];
    nodo.x = redondear(nodo.x + direccion.x * diferencia);
    nodo.y = redondear(nodo.y + direccion.y * diferencia);
    nodo.z = redondear(nodo.z + direccion.z * diferencia);
  }

  // si el tramo se acortó puede que algún accesorio quede fuera, por lo que se
  // deja como máximo a 0,1 m del final del tramo
  var idsAcc = Object.keys(red.accesorios);
  for (var j = 0; j < idsAcc.length; j++) {
    var acc = red.accesorios[idsAcc[j]];
    if (acc.tramo == idTramo && acc.posicion > largoNuevo - 0.1) {
      acc.posicion = redondear(largoNuevo - 0.1);
    }
  }
}

// Cambia la sección de un tramo (forma y medidas en mm). Los fittings no se
// modifican aquí, ya que, se vuelven a generar solos al reconstruir la escena.
function cambiarSeccionTramo(idTramo, seccion) {
  var tramo = red.tramos[idTramo];
  tramo.forma = seccion.forma;
  if (seccion.forma == "rect") {
    tramo.ancho = seccion.ancho;
    tramo.alto = seccion.alto;
  } else {
    tramo.diametro = seccion.diametro;
  }
}

// Quita un accesorio de la red
function quitarAccesorio(idAccesorio) {
  delete red.accesorios[idAccesorio];
}

// Devuelve los accesorios de un tramo ordenados desde el inicio hasta el final del tramo
function accesoriosDelTramo(idTramo) {
  var lista = [];
  var idsAcc = Object.keys(red.accesorios);
  for (var i = 0; i < idsAcc.length; i++) {
    if (red.accesorios[idsAcc[i]].tramo == idTramo) {
      lista.push(red.accesorios[idsAcc[i]]);
    }
  }
  // ordenamiento simple por posición
  lista.sort(function (a, b) {
    return a.posicion - b.posicion;
  });
  return lista;
}

// Devuelve los códigos de dirección que ya están ocupados en un nodo
function direccionesOcupadas(idNodo) {
  var ocupadas = [];
  var tramos = tramosDelNodo(idNodo);
  for (var i = 0; i < tramos.length; i++) {
    ocupadas.push(codigoDireccion(direccionSaliendo(tramos[i], idNodo)));
  }
  return ocupadas;
}

// Dice qué fitting le corresponde a un nodo según los tramos que llegan a él.
// Se usa la misma regla de escena.js: 1 tramo es un extremo, 2 tramos en línea
// recta son una unión (o una reducción o ampliación si cambia la sección), 2 tramos que no están
// en línea forman un codo y 3 o más tramos forman una derivación.
function tipoDeNodo(idNodo) {
  if (red.nodos[idNodo].origen) {
    return "equipo";
  }
  var tramos = tramosDelNodo(idNodo);
  if (tramos.length == 0) {
    return "nodo aislado";
  }
  if (tramos.length == 1) {
    return "extremo";
  }
  if (tramos.length >= 3) {
    return "derivación";
  }
  var sale1 = direccionSaliendo(tramos[0], idNodo);
  var sale2 = direccionSaliendo(tramos[1], idNodo);
  if (sale1.dot(sale2) < -0.99) {
    if (mismaSeccion(tramos[0], tramos[1])) {
      return "unión recta";
    }
    return "reducción o ampliación";
  }
  return "codo";
}

// Analiza una derivación para saber cuál es el troncal y cuáles son los ramales.
//  - entrada: el tramo por donde llega el aire, es decir, el que conecta el nodo
//    con el equipo de su red. Se encuentra buscando desde el otro extremo de cada tramo si se
//    puede llegar al equipo sin pasar por el mismo tramo.
//  - recto: el tramo que sigue en línea recta con la entrada (puede no existir).
//  - ramales: todos los demás tramos, los cuales salen con zapato chino o collarín.
// Si el nodo es el mismo equipo no hay entrada y se devuelve null.
function analizarDerivacion(idNodo) {
  var tramos = tramosDelNodo(idNodo);
  var raiz = origenDeNodo(idNodo);   // equipo de la red de este nodo

  var entrada = null;
  for (var i = 0; i < tramos.length; i++) {
    var otroNodo = tramos[i].a;
    if (tramos[i].a == idNodo) {
      otroNodo = tramos[i].b;
    }
    var alcanzables = nodosConectados(otroNodo, tramos[i].id);
    if (alcanzables.indexOf(raiz) != -1) {
      entrada = tramos[i];
    }
  }
  if (entrada == null) {
    return null;
  }

  var saleEntrada = direccionSaliendo(entrada, idNodo);
  var recto = null;
  var ramales = [];
  for (var j = 0; j < tramos.length; j++) {
    if (tramos[j].id == entrada.id) {
      continue;
    }
    var sale = direccionSaliendo(tramos[j], idNodo);
    // si sale justo al lado contrario de la entrada es la continuación del troncal
    if (sale.dot(saleEntrada) < -0.99) {
      recto = tramos[j];
    } else {
      ramales.push(tramos[j]);
    }
  }
  return { entrada: entrada, recto: recto, ramales: ramales };
}
