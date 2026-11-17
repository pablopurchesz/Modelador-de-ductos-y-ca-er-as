// ============================================================================
// escena.js
// En este archivo se prepara la escena de Three.js (cámara, luces, grilla y
// controles) y se encuentra la función reconstruirEscena(), la cual borra todo
// lo dibujado y lo vuelve a crear a partir de los datos de la red. También se
// manejan las cotas (textos sobre el dibujo) y la selección con el mouse.
// ============================================================================


// ---------------------------------------------------------------------------
// Preparación de la escena
// ---------------------------------------------------------------------------
var contenedor = document.getElementById("visor");
var capaEtiquetas = document.getElementById("etiquetas");

var escena = new THREE.Scene();
escena.background = new THREE.Color(0xe3e8ed);

// En esta versión el visor no ocupa toda la ventana, ya que, a la izquierda se
// encuentra el panel lateral, es por esto que el tamaño se toma del contenedor
// y no de window.innerWidth y window.innerHeight como en la versión anterior.
var anchoVisor = contenedor.clientWidth;
var altoVisor = contenedor.clientHeight;

// cámara en perspectiva: ángulo de visión 42°, y los planos cercano y lejano
var camara = new THREE.PerspectiveCamera(42, anchoVisor / altoVisor, 0.05, 600);

var renderer = new THREE.WebGLRenderer({ antialias: true });
// en pantallas de alta densidad se limita a 2 la cantidad de píxeles por punto,
// con el fin de no dibujar más píxeles de los que se alcanzan a notar
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(anchoVisor, altoVisor);
contenedor.appendChild(renderer.domElement);

// controles para girar la cámara alrededor de la red (OrbitControls)
var controles = new THREE.OrbitControls(camara, renderer.domElement);
controles.enableDamping = true;     // el movimiento se frena suave
controles.dampingFactor = 0.12;

// luces: una luz general (hemisférica) y dos direccionales para que se noten las caras
escena.add(new THREE.HemisphereLight(0xffffff, 0x50606e, 0.85));
var luz1 = new THREE.DirectionalLight(0xffffff, 0.75);
luz1.position.set(10, 18, 8);
escena.add(luz1);
var luz2 = new THREE.DirectionalLight(0xffffff, 0.3);
luz2.position.set(-8, 6, -10);
escena.add(luz2);

// grilla del suelo de 80 x 80 m con líneas cada 1 m, y los ejes en el origen
escena.add(new THREE.GridHelper(80, 80, 0xc3ccd5, 0xc3ccd5));
var ejes = new THREE.AxesHelper(1);
ejes.position.y = 0.002;
escena.add(ejes);

// Todo lo que es parte de la red se agrega a este grupo, así para borrar la
// red basta con vaciar el grupo y no se borran la grilla ni las luces
var grupoRed = new THREE.Group();
escena.add(grupoRed);

// lista de mallas que se pueden seleccionar con el mouse
var mallasSeleccionables = [];
var marcadoresNodos = [];

// lista de cotas que se dibujan encima del canvas
var cotas = [];
var mostrarCotas = true;

// Red activa: es el id del equipo de origen de la red con la que se está
// trabajando, o null si se trabaja con todas las redes a la vez. Las redes que
// no están activas se dibujan transparentes y no se pueden seleccionar.
var redActiva = null;
var nodosActivos = {};   // nodosActivos["N3"] = true si N3 es parte de la red activa


// ---------------------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------------------

// Guarda en la malla a qué elemento de la red corresponde y la deja seleccionable
function hacerSeleccionable(objeto, tipo, id) {
  objeto.traverse(function (hijo) {
    if (hijo.isMesh) {
      if (!hijo.userData.elemento) {
        hijo.userData.elemento = { tipo: tipo, id: id };
      }
      mallasSeleccionables.push(hijo);
    }
  });
}

// Cambia todos los materiales de un objeto por los transparentes, se usa para
// las piezas de las redes que no están activas
function pintarInactivo(objeto) {
  objeto.traverse(function (hijo) {
    if (hijo.isMesh) {
      hijo.material = materiales.inactivo;
    } else if (hijo.isLine) {
      hijo.material = materialLineasInactivo;
    }
  });
}

// Dice si un nodo es parte de la red activa (si no hay red activa, todos lo son)
function estaActivo(idNodo) {
  if (redActiva == null) {
    return true;
  }
  return nodosActivos[idNodo] == true;
}

// Agrega una pieza al modelo. Si es de la red activa queda seleccionable, si
// no lo es se pinta transparente y no se agrega a la lista de seleccionables.
function agregarAlModelo(objeto, tipo, id, activo) {
  if (activo) {
    hacerSeleccionable(objeto, tipo, id);
  } else {
    pintarInactivo(objeto);
  }
  grupoRed.add(objeto);
}

// Revisa que la red activa siga existiendo (por ejemplo después de deshacer) y
// arma la lista de nodos que le pertenecen
function prepararRedActiva() {
  if (redActiva != null && (red.nodos[redActiva] == undefined || !red.nodos[redActiva].origen)) {
    redActiva = null;
  }
  nodosActivos = {};
  if (redActiva != null) {
    var lista = nodosConectados(redActiva, null);
    for (var i = 0; i < lista.length; i++) {
      nodosActivos[lista[i]] = true;
    }
  }
  // si lo seleccionado quedó en una red inactiva se quita la selección
  if (seleccion != null) {
    var idNodoSel = seleccion.id;
    if (seleccion.tipo == "tramo") {
      idNodoSel = red.tramos[seleccion.id].a;
    }
    if (!estaActivo(idNodoSel)) {
      seleccion = null;
    }
  }
}

// Agrega una cota a la lista (se dibuja después en dibujarCotas)
function agregarCota(texto, posicion, clase) {
  if (!mostrarCotas) {
    return;
  }
  cotas.push({ texto: texto, posicion: posicion, clase: clase });
}

// Borra todo lo dibujado de la red y libera la memoria de las geometrías
function limpiarEscena() {
  grupoRed.traverse(function (objeto) {
    if (objeto.geometry) {
      objeto.geometry.dispose();
    }
  });
  while (grupoRed.children.length > 0) {
    grupoRed.remove(grupoRed.children[0]);
  }
  mallasSeleccionables = [];
  marcadoresNodos = [];
  cotas = [];
}


// ---------------------------------------------------------------------------
// reconstruirEscena(): se llama cada vez que cambia la red
// ---------------------------------------------------------------------------
// Primeramente se revisa cada nodo para ver qué fitting le corresponde según la
// cantidad de tramos que llegan a él, luego se dibujan los tramos rectos
// descontando lo que ocupan los fittings, y finalmente los accesorios y cotas.
function reconstruirEscena() {
  limpiarEscena();
  quitarSeleccionSiNoExiste();   // está en panel.js
  prepararRedActiva();

  var nodoSeleccionado = null;
  var tramoSeleccionado = null;
  if (seleccion != null && seleccion.tipo == "nodo") { nodoSeleccionado = seleccion.id; }
  if (seleccion != null && seleccion.tipo == "tramo") { tramoSeleccionado = seleccion.id; }

  // recortes["T3|N4"] = cuánto ocupa el fitting del nodo N4 sobre el tramo T3
  var recortes = {};

  // ---------- 1) nodos y fittings ----------
  var idsNodos = Object.keys(red.nodos);
  for (var i = 0; i < idsNodos.length; i++) {
    var nodo = red.nodos[idsNodos[i]];
    var punto = posicionNodo(nodo.id);
    var activo = estaActivo(nodo.id);

    // se arma la lista de conexiones del nodo
    var tramos = tramosDelNodo(nodo.id);
    var conexiones = [];
    for (var j = 0; j < tramos.length; j++) {
      conexiones.push({
        tramo: tramos[j],
        sale: direccionSaliendo(tramos[j], nodo.id),
        perfil: perfilTramo(tramos[j]),
        largo: largoTramo(tramos[j])
      });
    }

    var material = materiales.fitting;
    if (nodo.id == nodoSeleccionado) {
      material = materiales.seleccionado;
    }

    if (nodo.origen && conexiones.length <= 1) {
      // equipo de origen de la red (UMA o caja de ventilación)
      var conexionEquipo = null;
      if (conexiones.length == 1) {
        conexionEquipo = conexiones[0];
      }
      var equipo = crearEquipo(nodo, conexionEquipo);
      agregarAlModelo(equipo.grupo, "nodo", nodo.id, activo);
      if (activo) {
        var nombreCorto = "UMA";
        if (nodo.terminal == "ventilador") {
          nombreCorto = "Caja de ventilación";
        }
        agregarCota(nombreCorto + " " + nodo.id, equipo.puntoEtiqueta, "cota cota-accesorio");
      }
    } else if (conexiones.length == 2) {
      // producto punto entre las dos direcciones: -1 si son opuestas (línea recta)
      var punto2 = conexiones[0].sale.dot(conexiones[1].sale);
      if (punto2 < -0.99) {
        // en línea recta: si cambia la sección va una transición, si no, nada
        if (!mismaSeccion(conexiones[0].tramo, conexiones[1].tramo)) {
          var transicion = crearTransicion(punto, conexiones[0], conexiones[1], material);
          agregarAlModelo(transicion.malla, "nodo", nodo.id, activo);
          recortes[conexiones[0].tramo.id + "|" + nodo.id] = transicion.recorte;
          recortes[conexiones[1].tramo.id + "|" + nodo.id] = transicion.recorte;
        }
      } else {
        // si no son opuestas forman un codo
        var codo = crearCodo(punto, conexiones[0], conexiones[1], material);
        agregarAlModelo(codo.malla, "nodo", nodo.id, activo);
        recortes[conexiones[0].tramo.id + "|" + nodo.id] = codo.recorte;
        recortes[conexiones[1].tramo.id + "|" + nodo.id] = codo.recorte;
      }
    } else if (conexiones.length >= 3) {
      // tres o más tramos: derivación
      var derivacion = crearDerivacion(punto, nodo.id, conexiones, material);
      agregarAlModelo(derivacion.malla, "nodo", nodo.id, activo);
      for (var k = 0; k < conexiones.length; k++) {
        recortes[conexiones[k].tramo.id + "|" + nodo.id] = derivacion.recortes[k];
      }
    } else if (conexiones.length == 1 && nodo.terminal != null) {
      // nodo extremo con terminal
      var terminal = crearTerminal(nodo, conexiones[0]);
      agregarAlModelo(terminal, "nodo", nodo.id, activo);
    }

    // los nodos de las redes inactivas no llevan marcador ni cota
    if (!activo) {
      continue;
    }

    // marcador del nodo: una esfera pequeña, naranja si es un extremo abierto
    var materialMarcador = materiales.nodo;
    if (conexiones.length == 1 && nodo.terminal == null && !nodo.origen) {
      materialMarcador = materiales.nodoAbierto;
    }
    var radio = 0.075;
    if (nodo.id == nodoSeleccionado) {
      materialMarcador = materiales.nodoSelecc;
      radio = 0.11;
    }
    var esfera = new THREE.Mesh(new THREE.SphereGeometry(radio, 16, 12), materialMarcador);
    esfera.position.copy(punto);
    esfera.renderOrder = 10;   // se dibuja encima de los ductos
    esfera.userData.elemento = { tipo: "nodo", id: nodo.id };
    marcadoresNodos.push(esfera);
    grupoRed.add(esfera);
    agregarCota(nodo.id, punto, "cota-nodo");
  }

  // ---------- 2) tramos rectos ----------
  var idsTramos = Object.keys(red.tramos);
  for (var t = 0; t < idsTramos.length; t++) {
    var tramo = red.tramos[idsTramos[t]];
    var recorteA = recortes[tramo.id + "|" + tramo.a] || 0;
    var recorteB = recortes[tramo.id + "|" + tramo.b] || 0;

    var materialTramo = materiales.ducto;
    if (tramo.id == tramoSeleccionado) {
      materialTramo = materiales.seleccionado;
    }
    var tramoActivo = estaActivo(tramo.a);
    var recto = crearTramoRecto(tramo, recorteA, recorteB, materialTramo);
    if (recto != null) {
      agregarAlModelo(recto, "tramo", tramo.id, tramoActivo);
    }
    if (!tramoActivo) {
      continue;   // sin cota
    }

    // cota con la sección y el largo, un poco por encima del tramo
    var medio = posicionNodo(tramo.a).add(posicionNodo(tramo.b)).multiplyScalar(0.5);
    var perfil = perfilTramo(tramo);
    var medida = perfil.alto;
    if (tramo.forma == "circ") { medida = perfil.diametro; }
    if (Math.abs(perfil.d.y) > 0.5) {
      // tramo vertical: la cota se pone al lado
      var ladoCota = perfil.ancho;
      if (tramo.forma == "circ") { ladoCota = perfil.diametro; }
      medio.addScaledVector(perfil.u, ladoCota / 2 + 0.25);
    } else {
      medio.y = medio.y + medida / 2 + 0.2;
    }
    var claseCota = "cota";
    if (tramo.id == tramoSeleccionado) {
      claseCota = "cota cota-accesorio";
    }
    agregarCota(textoSeccion(tramo) + " · " + formatoNumero(largoTramo(tramo)) + " m", medio, claseCota);
  }

  // ---------- 3) accesorios ----------
  var idsAcc = Object.keys(red.accesorios);
  for (var a = 0; a < idsAcc.length; a++) {
    var acc = red.accesorios[idsAcc[a]];
    if (!red.tramos[acc.tramo]) {
      continue;
    }
    var accActivo = estaActivo(red.tramos[acc.tramo].a);
    var grupoAcc = crearAccesorio(acc);
    agregarAlModelo(grupoAcc, "tramo", acc.tramo, accActivo);
    if (!accActivo) {
      continue;   // sin cota
    }

    var perfilAcc = perfilTramo(red.tramos[acc.tramo]);
    var altoAcc = perfilAcc.alto;
    if (perfilAcc.forma == "circ") { altoAcc = perfilAcc.diametro; }
    var posCota = grupoAcc.position.clone().addScaledVector(perfilAcc.v, altoAcc / 2 + 0.22);
    agregarCota(acc.tipo, posCota, "cota cota-accesorio");
  }

  crearElementosCotas();
  actualizarPanel();         // está en panel.js
  guardarEnNavegador();      // está en datos.js
}


// ---------------------------------------------------------------------------
// Cotas: textos HTML que se ubican encima del canvas
// ---------------------------------------------------------------------------
// Se crea un div por cada cota y en cada cuadro se calcula dónde cae su punto
// 3D en la pantalla (proyección), luego se mueve el div a esa posición.

function crearElementosCotas() {
  capaEtiquetas.innerHTML = "";
  for (var i = 0; i < cotas.length; i++) {
    var div = document.createElement("div");
    div.className = cotas[i].clase;
    div.textContent = cotas[i].texto;
    capaEtiquetas.appendChild(div);
    cotas[i].elemento = div;
  }
}

function dibujarCotas() {
  var ancho = contenedor.clientWidth;
  var alto = contenedor.clientHeight;
  var punto = new THREE.Vector3();

  for (var i = 0; i < cotas.length; i++) {
    punto.copy(cotas[i].posicion);
    punto.project(camara);   // convierte la posición 3D a coordenadas de pantalla (-1 a 1)

    // si el punto queda detrás de la cámara no se muestra
    if (punto.z > 1 || punto.z < -1) {
      cotas[i].elemento.style.display = "none";
      continue;
    }
    cotas[i].elemento.style.display = "block";
    cotas[i].elemento.style.left = ((punto.x + 1) / 2 * ancho) + "px";
    cotas[i].elemento.style.top = ((1 - punto.y) / 2 * alto) + "px";
  }
}


// ---------------------------------------------------------------------------
// Cámara: encuadrar la red desde una dirección
// ---------------------------------------------------------------------------
function encuadrar(direccion) {
  var caja = new THREE.Box3().setFromObject(grupoRed);
  if (caja.isEmpty()) {
    caja.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 3, 2));
  }
  var centro = caja.getCenter(new THREE.Vector3());
  var tamano = caja.getSize(new THREE.Vector3()).length();
  var distancia = Math.max(4, tamano * 1.15);

  direccion.normalize();
  camara.position.copy(centro).addScaledVector(direccion, distancia);
  controles.target.copy(centro);
  camara.near = distancia / 500;
  camara.far = distancia * 20;
  camara.updateProjectionMatrix();
  controles.update();
}

function vistaIso() { encuadrar(new THREE.Vector3(1, 0.9, 1.2)); }
function vistaPlanta() { encuadrar(new THREE.Vector3(0, 1, 0.001)); }
function vistaElevacion() { encuadrar(new THREE.Vector3(0, 0.001, 1)); }


// ---------------------------------------------------------------------------
// Selección con el mouse (Raycaster)
// ---------------------------------------------------------------------------
// Se lanza un rayo desde la cámara hacia donde se hizo clic y se ve qué malla
// toca primero. Para no confundir un clic con el arrastre para girar la
// cámara, solo se considera clic si el mouse se movió menos de 5 píxeles.
var raycaster = new THREE.Raycaster();
var inicioClic = null;

renderer.domElement.addEventListener("pointerdown", function (evento) {
  inicioClic = { x: evento.clientX, y: evento.clientY, boton: evento.button };
});

renderer.domElement.addEventListener("pointerup", function (evento) {
  if (inicioClic == null || inicioClic.boton != 0) {
    return;
  }
  var movimiento = Math.abs(evento.clientX - inicioClic.x) + Math.abs(evento.clientY - inicioClic.y);
  if (movimiento > 5) {
    return;   // fue un arrastre, no un clic
  }

  // posición del mouse en coordenadas de -1 a 1
  var rect = renderer.domElement.getBoundingClientRect();
  var mouse = new THREE.Vector2(
    ((evento.clientX - rect.left) / rect.width) * 2 - 1,
    -((evento.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camara);

  // primero se prueban los marcadores de nodos (son chicos), luego si hay una
  // vista previa de tramo el clic sirve para crearlo (trazado.js), y si no
  // se prueban las demás mallas
  var toques = raycaster.intersectObjects(marcadoresNodos, false);
  if (toques.length == 0) {
    if (clicParaTrazar()) {
      return;
    }
    toques = raycaster.intersectObjects(mallasSeleccionables, false);
  }

  if (toques.length > 0) {
    seleccionar(toques[0].object.userData.elemento);
  } else {
    seleccionar(null);
  }
});

// Selecciona un elemento (o nada si es null) y vuelve a dibujar
function seleccionar(elemento) {
  creandoEquipo = false;   // si se estaba creando un equipo, se cancela (está en panel.js)
  if (elemento == null) {
    seleccion = null;
  } else {
    seleccion = { tipo: elemento.tipo, id: elemento.id };
  }

  // si se selecciona un nodo, la próxima sección por defecto es la del tramo que llega a él
  if (seleccion != null && seleccion.tipo == "nodo") {
    var tramos = tramosDelNodo(seleccion.id);
    var referencia = null;
    for (var i = 0; i < tramos.length; i++) {
      if (tramos[i].b == seleccion.id) {
        referencia = tramos[i];
      }
    }
    if (referencia == null && tramos.length > 0) {
      referencia = tramos[0];
    }
    if (referencia != null) {
      ultimaSeccion = {
        forma: referencia.forma,
        ancho: referencia.ancho,
        alto: referencia.alto,
        diametro: referencia.diametro
      };
    }
  }
  mostrarMensaje("", "");
  reconstruirEscena();
}


// ---------------------------------------------------------------------------
// Ajuste al cambiar el tamaño de la ventana y bucle de dibujo
// ---------------------------------------------------------------------------
window.addEventListener("resize", function () {
  anchoVisor = contenedor.clientWidth;
  altoVisor = contenedor.clientHeight;
  camara.aspect = anchoVisor / altoVisor;
  camara.updateProjectionMatrix();
  renderer.setSize(anchoVisor, altoVisor);
});

// Esta función se repite en cada cuadro (unas 60 veces por segundo)
function animar() {
  requestAnimationFrame(animar);
  controles.update();
  renderer.render(escena, camara);
  dibujarCotas();
  dibujarCotaPrevia();   // está en trazado.js
}
