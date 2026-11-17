// ============================================================================
// trazado.js
// En este archivo se encuentra el trazado de tramos con el mouse. Cuando hay un
// nodo seleccionado, al mover el mouse por el visor se busca cuál de las seis
// direcciones (±X, ±Y, ±Z) es la que más se parece al movimiento del mouse en
// la pantalla, sin considerar las direcciones que ya están ocupadas en el nodo
// (entre ellas la del tramo por donde se llegó, es decir, no se puede devolver).
// En esa dirección se dibuja una vista previa del tramo con la sección y el
// largo escritos en el panel, y al hacer clic en el visor se crea el tramo.
// Cuando lo seleccionado es un tramo, al pasar el mouse sobre él se marca el
// punto donde iría una derivación y al hacer clic se divide el tramo ahí.
// ============================================================================

// Dirección que marca el mouse ("+X", "-Y", etc.) o null si no hay ninguna
var direccionPrevia = null;

// Malla transparente de la vista previa, se agrega directo a la escena (no a
// grupoRed) para que no se borre al reconstruir ni cuente al encuadrar la cámara
var mallaPrevia = null;

// Material de la vista previa: color de selección y transparente
var materialPrevia = new THREE.MeshBasicMaterial({ color: 0x18a6d6, transparent: true, opacity: 0.35, depthWrite: false });

// Texto que acompaña a la vista previa, por ejemplo "+X · 3,00 m"
var cotaPrevia = document.createElement("div");
cotaPrevia.className = "cota cota-accesorio";
cotaPrevia.style.display = "none";
contenedor.appendChild(cotaPrevia);

// Última posición del mouse sobre el visor, para volver a calcular la
// dirección cuando cambia la red o las medidas sin que el mouse se mueva
var ultimoMouse = null;

// Cuando hay un tramo seleccionado, distancia (en m, medida desde su nodo a)
// del punto de derivación que marca el mouse, o null si el mouse no está sobre el tramo
var distanciaDerivacion = null;
var PASO_DERIVACION = 0.05;   // la distancia se ajusta cada 5 cm


// ---------------------------------------------------------------------------
// ¿Se puede trazar desde lo seleccionado?
// ---------------------------------------------------------------------------
// Solo se traza cuando hay un nodo seleccionado, no se está creando un equipo
// y el nodo tiene direcciones libres. Si el nodo es un equipo que ya tiene su
// ducto de descarga tampoco se puede, ya que, del equipo sale un solo ducto.
function puedeTrazar() {
  if (creandoEquipo || seleccion == null || seleccion.tipo != "nodo") {
    return false;
  }
  var nodo = red.nodos[seleccion.id];
  var cantidadTramos = tramosDelNodo(nodo.id).length;
  if (nodo.origen && cantidadTramos >= 1) {
    return false;
  }
  return direccionesOcupadas(nodo.id).length < 6;
}


// ---------------------------------------------------------------------------
// Elegir la dirección según el mouse
// ---------------------------------------------------------------------------
// Se pasa el nodo a coordenadas de pantalla y también el punto que está a 1 m
// del nodo en cada dirección libre. Así se obtiene cómo se ve cada dirección en
// la pantalla, y se elige la que forma el menor ángulo con la línea que va
// desde el nodo hasta el mouse (la de mayor coseno).
function aPantalla(punto) {
  var p = punto.clone().project(camara);
  return new THREE.Vector2((p.x + 1) / 2 * contenedor.clientWidth, (1 - p.y) / 2 * contenedor.clientHeight);
}

function elegirDireccion(mouseX, mouseY) {
  var puntoNodo = posicionNodo(seleccion.id);
  var nodoEnPantalla = aPantalla(puntoNodo);
  var haciaMouse = new THREE.Vector2(mouseX - nodoEnPantalla.x, mouseY - nodoEnPantalla.y);

  // si el mouse está casi encima del nodo no se elige nada
  if (haciaMouse.length() < 20) {
    return null;
  }
  haciaMouse.normalize();

  var ocupadas = direccionesOcupadas(seleccion.id);
  var mejor = null;
  var mejorCoseno = -2;
  var codigos = Object.keys(DIRECCIONES);
  for (var i = 0; i < codigos.length; i++) {
    if (ocupadas.indexOf(codigos[i]) != -1) {
      continue;   // dirección ocupada, incluida la del tramo por donde se llegó
    }
    var d = DIRECCIONES[codigos[i]];
    var puntoDireccion = puntoNodo.clone().add(new THREE.Vector3(d[0], d[1], d[2]));
    var enPantalla = aPantalla(puntoDireccion).sub(nodoEnPantalla);
    // si la dirección apunta casi directo a la cámara se ve como un punto y no sirve
    if (enPantalla.length() < 3) {
      continue;
    }
    enPantalla.normalize();
    var coseno = enPantalla.dot(haciaMouse);
    if (coseno > mejorCoseno) {
      mejorCoseno = coseno;
      mejor = codigos[i];
    }
  }
  return mejor;
}


// ---------------------------------------------------------------------------
// Dibujar y quitar la vista previa
// ---------------------------------------------------------------------------
function quitarPrevia() {
  if (mallaPrevia != null) {
    escena.remove(mallaPrevia);
    mallaPrevia.geometry.dispose();
    mallaPrevia = null;
  }
  cotaPrevia.style.display = "none";
  marcarBotonPrevia(null);
}

// Marca en la botonera del panel el botón de la dirección que se está previsualizando
function marcarBotonPrevia(codigo) {
  var botones = document.querySelectorAll(".boton-direccion");
  for (var i = 0; i < botones.length; i++) {
    if (botones[i].getAttribute("data-direccion") == codigo) {
      botones[i].classList.add("previa");
    } else {
      botones[i].classList.remove("previa");
    }
  }
}

// Vuelve a dibujar la vista previa con la dirección guardada y las medidas del
// panel. Se llama cuando se mueve el mouse, cuando cambian las medidas y cada
// vez que se reconstruye la escena.
function actualizarPrevia() {
  quitarPrevia();

  // con un tramo seleccionado la vista previa es el punto de derivación
  if (!creandoEquipo && seleccion != null && seleccion.tipo == "tramo") {
    direccionPrevia = null;
    actualizarPreviaDerivacion();
    return;
  }
  distanciaDerivacion = null;

  if (!puedeTrazar()) {
    direccionPrevia = null;
    return;
  }

  // se vuelve a elegir la dirección con la última posición del mouse, ya que,
  // después de crear un tramo el nodo seleccionado es otro
  if (ultimoMouse != null) {
    direccionPrevia = elegirDireccion(ultimoMouse.x, ultimoMouse.y);
  }
  if (direccionPrevia == null) {
    return;
  }

  // si las medidas del panel están mal escritas no se dibuja nada
  var leido;
  try {
    leido = leerSeccionDelPanel("nuevo", ultimaSeccion.forma);
  } catch (error) {
    return;
  }

  // se arma el perfil del tramo igual que lo haría agregarTramo() en datos.js
  var d = DIRECCIONES[direccionPrevia];
  var direccion = new THREE.Vector3(d[0], d[1], d[2]);
  var tramosExistentes = tramosDelNodo(seleccion.id);
  var tramoAnterior = null;
  if (tramosExistentes.length > 0) {
    tramoAnterior = tramosExistentes[0];
  }
  var u = calcularVectorAncho(direccion, tramoAnterior);
  var v = new THREE.Vector3().crossVectors(direccion, u);
  var perfil = {
    forma: leido.seccion.forma,
    ancho: (leido.seccion.ancho || 0) / 1000,
    alto: (leido.seccion.alto || 0) / 1000,
    diametro: (leido.seccion.diametro || 0) / 1000,
    u: u,
    v: v,
    d: direccion
  };

  var puntoNodo = posicionNodo(seleccion.id);
  var centro = puntoNodo.clone().addScaledVector(direccion, leido.largo / 2);
  mallaPrevia = crearPiezaRecta(perfil, centro, leido.largo, materialPrevia);
  escena.add(mallaPrevia);

  // texto en la punta del tramo
  cotaPrevia.textContent = NOMBRE_DIRECCION[direccionPrevia] + " · " + formatoNumero(leido.largo) + " m · clic para crear";
  cotaPrevia.posicion = puntoNodo.clone().addScaledVector(direccion, leido.largo);
  cotaPrevia.style.display = "block";
  marcarBotonPrevia(direccionPrevia);
}

// La cota de la vista previa se mueve en cada cuadro igual que las demás cotas
function dibujarCotaPrevia() {
  if (mallaPrevia == null) {
    return;
  }
  var p = aPantalla(cotaPrevia.posicion);
  cotaPrevia.style.left = p.x + "px";
  cotaPrevia.style.top = p.y + "px";
}


// ---------------------------------------------------------------------------
// Eventos del mouse sobre el visor
// ---------------------------------------------------------------------------
renderer.domElement.addEventListener("pointermove", function (evento) {
  // mientras se arrastra para girar la cámara no se cambia la vista previa
  if (evento.buttons != 0) {
    return;
  }
  var rect = renderer.domElement.getBoundingClientRect();
  ultimoMouse = { x: evento.clientX - rect.left, y: evento.clientY - rect.top };

  // con un tramo seleccionado se busca el punto de derivación bajo el mouse,
  // y solo se redibuja si el punto cambió (cada 5 cm)
  if (seleccion != null && seleccion.tipo == "tramo" && !creandoEquipo) {
    var nuevaDistancia = calcularDistanciaDerivacion(ultimoMouse.x, ultimoMouse.y);
    if (nuevaDistancia != distanciaDerivacion || mallaPrevia == null) {
      actualizarPrevia();
    }
    return;
  }

  if (!puedeTrazar()) {
    return;
  }
  var nueva = elegirDireccion(ultimoMouse.x, ultimoMouse.y);
  // solo se redibuja si la dirección cambió, así no se crean mallas en cada movimiento
  if (nueva != direccionPrevia || mallaPrevia == null) {
    direccionPrevia = nueva;
    actualizarPrevia();
  }
});

renderer.domElement.addEventListener("pointerleave", function () {
  ultimoMouse = null;
  direccionPrevia = null;
  distanciaDerivacion = null;
  quitarPrevia();
});

// Esta función la llama escena.js cuando se hace clic en el visor sin tocar
// ningún marcador de nodo. Devuelve true si se creó un tramo.
function clicParaTrazar() {
  // con un tramo seleccionado el clic sobre el tramo crea el punto de derivación
  if (seleccion != null && seleccion.tipo == "tramo" && distanciaDerivacion != null && mallaPrevia != null) {
    crearDerivacionEn(seleccion.id, distanciaDerivacion);   // está en panel.js
    return true;
  }
  if (!puedeTrazar() || direccionPrevia == null || mallaPrevia == null) {
    return false;
  }
  crearTramoHacia(direccionPrevia);   // está en panel.js
  return true;
}


// ---------------------------------------------------------------------------
// Punto de derivación sobre el tramo seleccionado
// ---------------------------------------------------------------------------
// Se lanza un rayo desde la cámara hacia el mouse y se busca el punto del eje
// del tramo que queda más cerca de ese rayo. Para esto se usa la fórmula de los
// puntos más cercanos entre dos rectas: el eje del tramo P(t) = a + t·d y el
// rayo Q(s) = o + s·r, donde d y r son vectores de largo 1.
// Devuelve la distancia t (en m desde el nodo a), ajustada cada 5 cm, o null
// si el mouse no está sobre el tramo.
function calcularDistanciaDerivacion(mouseX, mouseY) {
  var tramo = red.tramos[seleccion.id];
  var a = posicionNodo(tramo.a);
  var d = direccionTramo(tramo);
  var largo = largoTramo(tramo);

  var mouse = new THREE.Vector2(
    (mouseX / contenedor.clientWidth) * 2 - 1,
    -(mouseY / contenedor.clientHeight) * 2 + 1
  );
  var rayo = new THREE.Raycaster();
  rayo.setFromCamera(mouse, camara);
  var o = rayo.ray.origin;
  var r = rayo.ray.direction;

  var w0 = a.clone().sub(o);
  var b = d.dot(r);
  var dw = d.dot(w0);
  var rw = r.dot(w0);
  var denominador = 1 - b * b;
  if (denominador < 0.000001) {
    return null;   // el rayo va paralelo al tramo, se está mirando el tramo de punta
  }
  var t = (b * rw - dw) / denominador;

  // se ajusta a pasos de 5 cm y se deja dentro del tramo, sin tocar sus extremos
  t = Math.round(t / PASO_DERIVACION) * PASO_DERIVACION;
  t = Math.max(t, PASO_DERIVACION);
  t = Math.min(t, largo - PASO_DERIVACION);
  t = redondear(t);

  // distancia entre el punto del eje y el rayo: si es mayor que el ducto (más
  // un margen de 25 cm) se considera que el mouse no está sobre el tramo
  var punto = a.clone().addScaledVector(d, t);
  var haciaPunto = punto.clone().sub(o);
  var separacion = haciaPunto.clone().addScaledVector(r, -haciaPunto.dot(r)).length();
  var perfil = perfilTramo(tramo);
  var medida = Math.max(perfil.ancho, perfil.alto);
  if (tramo.forma == "circ") {
    medida = perfil.diametro;
  }
  if (separacion > medida / 2 + 0.25) {
    return null;
  }
  return t;
}

// Dibuja un anillo un poco más grande que el ducto en el punto de derivación,
// junto con una cota con la distancia, y escribe la distancia en el panel
function actualizarPreviaDerivacion() {
  distanciaDerivacion = null;
  if (ultimoMouse == null) {
    return;
  }
  distanciaDerivacion = calcularDistanciaDerivacion(ultimoMouse.x, ultimoMouse.y);
  if (distanciaDerivacion == null) {
    return;
  }

  var tramo = red.tramos[seleccion.id];
  var perfil = perfilTramo(tramo);
  // copia del perfil 8 cm más grande, para que el anillo se vea por fuera del ducto
  var perfilAnillo = {
    forma: perfil.forma,
    ancho: perfil.ancho + 0.08,
    alto: perfil.alto + 0.08,
    diametro: perfil.diametro + 0.08,
    u: perfil.u,
    v: perfil.v,
    d: perfil.d
  };
  var punto = posicionNodo(tramo.a).addScaledVector(perfil.d, distanciaDerivacion);
  mallaPrevia = crearPiezaRecta(perfilAnillo, punto, 0.06, materialPrevia);
  escena.add(mallaPrevia);

  cotaPrevia.textContent = formatoNumero(distanciaDerivacion) + " m desde " + tramo.a + " · clic para derivar";
  cotaPrevia.posicion = punto.clone();
  cotaPrevia.posicion.y = cotaPrevia.posicion.y + 0.5;
  cotaPrevia.style.display = "block";

  // la distancia también se escribe en el campo del panel
  var campo = document.getElementById("derivacion-distancia");
  if (campo != null) {
    campo.value = distanciaDerivacion;
  }
}
