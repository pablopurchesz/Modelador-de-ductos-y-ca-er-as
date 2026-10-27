// ============================================================================
// geometria.js
// En este archivo están las funciones que crean las mallas (Mesh) de Three.js
// para cada elemento de la red: tramos rectos, codos, transiciones,
// derivaciones, accesorios y terminales. Estas funciones solo crean objetos,
// quien las llama y las agrega a la escena es escena.js.
// ============================================================================


// ---------------------------------------------------------------------------
// Materiales (colores) que se usan en la escena
// ---------------------------------------------------------------------------
// Se crean una sola vez y se reutilizan en todas las mallas, ya que, crear un
// material nuevo por cada tramo gastaría memoria sin necesidad.
var materiales = {
  ducto:        new THREE.MeshStandardMaterial({ color: 0xbac4cd, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide }),
  fitting:      new THREE.MeshStandardMaterial({ color: 0xa6b4c1, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide }),
  pestana:      new THREE.MeshStandardMaterial({ color: 0x7d8b98, metalness: 0.4,  roughness: 0.45 }),
  seleccionado: new THREE.MeshStandardMaterial({ color: 0x2fa8d0, metalness: 0.2,  roughness: 0.45, side: THREE.DoubleSide, emissive: 0x0b4a60, emissiveIntensity: 0.35 }),
  terminal:     new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.1,  roughness: 0.6 }),
  uma:          new THREE.MeshStandardMaterial({ color: 0x8796a3, metalness: 0.25, roughness: 0.6 }),
  nodo:         new THREE.MeshBasicMaterial({ color: 0x4a5a69, depthTest: false, transparent: true }),
  nodoAbierto:  new THREE.MeshBasicMaterial({ color: 0xe08a1e, depthTest: false, transparent: true }),
  nodoSelecc:   new THREE.MeshBasicMaterial({ color: 0x18a6d6, depthTest: false, transparent: true })
};

// un material por cada tipo de accesorio, con el color definido en datos.js
var codigosAcc = Object.keys(ACCESORIOS);
for (var i = 0; i < codigosAcc.length; i++) {
  var codigo = codigosAcc[i];
  materiales[codigo] = new THREE.MeshStandardMaterial({ color: ACCESORIOS[codigo].color, metalness: 0.25, roughness: 0.55 });
}

// material de las líneas de borde y de las líneas de difusores y rejillas
var materialBordes = new THREE.LineBasicMaterial({ color: 0x34485a, transparent: true, opacity: 0.45 });
var materialLineas = new THREE.LineBasicMaterial({ color: 0x6b7a88 });

// Agrega las aristas (bordes) a una malla para que se vea más como un dibujo técnico
function agregarBordes(malla) {
  var bordes = new THREE.EdgesGeometry(malla.geometry, 30);
  malla.add(new THREE.LineSegments(bordes, materialBordes));
}


// ---------------------------------------------------------------------------
// Perfil de un tramo
// ---------------------------------------------------------------------------
// Para dibujar un tramo se necesita saber hacia dónde apunta, es decir, se arma
// una "base local" con tres vectores perpendiculares:
//   d = dirección del tramo (el eje del ducto)
//   u = dirección del ancho
//   v = dirección del alto, que se obtiene con el producto cruz entre d y u
// Además se pasan las medidas de mm a metros.
function perfilTramo(tramo) {
  var d = direccionTramo(tramo);
  var u = new THREE.Vector3(tramo.ancho3d[0], tramo.ancho3d[1], tramo.ancho3d[2]);
  var v = new THREE.Vector3();
  v.crossVectors(d, u);

  return {
    forma: tramo.forma,
    ancho: tramo.ancho / 1000,
    alto: tramo.alto / 1000,
    diametro: tramo.diametro / 1000,
    d: d,
    u: u,
    v: v
  };
}

// Distancia desde el eje del ducto hasta su borde en una dirección dada.
// En un ducto circular es siempre el radio, en uno rectangular depende de la
// dirección, por eso se calcula hasta qué lado del rectángulo se choca primero.
function radioEnDireccion(perfil, dir) {
  if (perfil.forma == "circ") {
    return perfil.diametro / 2;
  }
  var componenteU = Math.abs(dir.dot(perfil.u));
  var componenteV = Math.abs(dir.dot(perfil.v));
  var radio = 999999;
  if (componenteU > 0.000001) {
    radio = Math.min(radio, (perfil.ancho / 2) / componenteU);
  }
  if (componenteV > 0.000001) {
    radio = Math.min(radio, (perfil.alto / 2) / componenteV);
  }
  return radio;
}

// Cuánto mide el perfil a lo largo de un eje (por ejemplo cuánto mide en el eje X)
function medidaEnEje(perfil, eje) {
  if (perfil.forma == "circ") {
    var coseno = perfil.d.dot(eje);
    return perfil.diametro * Math.sqrt(Math.max(0, 1 - coseno * coseno));
  }
  return Math.abs(perfil.u.dot(eje)) * perfil.ancho + Math.abs(perfil.v.dot(eje)) * perfil.alto;
}

// Crea un cuaternión (rotación) a partir de tres vectores, sirve para girar una
// malla de forma que sus ejes x, y, z queden alineados con u, v, d
function rotacionDesdeBase(x, y, z) {
  var matriz = new THREE.Matrix4();
  matriz.makeBasis(x, y, z);
  var q = new THREE.Quaternion();
  q.setFromRotationMatrix(matriz);
  return q;
}

// Dos tramos tienen la misma sección si tienen la misma forma y medidas.
// En los rectangulares además se revisa que el ancho esté en la misma dirección.
function mismaSeccion(t1, t2) {
  if (t1.forma != t2.forma) {
    return false;
  }
  if (t1.forma == "circ") {
    return t1.diametro == t2.diametro;
  }
  if (t1.ancho != t2.ancho || t1.alto != t2.alto) {
    return false;
  }
  if (t1.ancho == t1.alto) {
    return true;   // si es cuadrado da lo mismo cómo esté girado
  }
  var u1 = new THREE.Vector3(t1.ancho3d[0], t1.ancho3d[1], t1.ancho3d[2]);
  var u2 = new THREE.Vector3(t2.ancho3d[0], t2.ancho3d[1], t2.ancho3d[2]);
  return Math.abs(u1.dot(u2)) > 0.99;
}


// ---------------------------------------------------------------------------
// Malla a partir de anillos (para codos y transiciones)
// ---------------------------------------------------------------------------
// Three.js no tiene una geometría para un codo rectangular o para un codo que
// pase de rectangular a circular, es por esto que se construye a mano: se
// calculan varios "anillos" de puntos a lo largo del codo y luego se unen los
// anillos vecinos con triángulos (dos triángulos por cada cuadrado).
function crearMallaDesdeAnillos(anillos, material) {
  var puntosPorAnillo = anillos[0].length;
  var posiciones = [];
  var indices = [];

  // se pasan todos los puntos a un solo arreglo [x, y, z, x, y, z, ...]
  for (var i = 0; i < anillos.length; i++) {
    for (var j = 0; j < puntosPorAnillo; j++) {
      posiciones.push(anillos[i][j].x, anillos[i][j].y, anillos[i][j].z);
    }
  }

  // se arman los triángulos entre el anillo i y el anillo i+1
  for (var i2 = 0; i2 < anillos.length - 1; i2++) {
    for (var j2 = 0; j2 < puntosPorAnillo; j2++) {
      var siguiente = (j2 + 1) % puntosPorAnillo;   // el último punto se une con el primero
      var a = i2 * puntosPorAnillo + j2;
      var b = i2 * puntosPorAnillo + siguiente;
      var c = (i2 + 1) * puntosPorAnillo + j2;
      var d = (i2 + 1) * puntosPorAnillo + siguiente;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  var geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setIndex(indices);
  geometria.computeVertexNormals();   // las normales sirven para que la luz se vea bien
  var malla = new THREE.Mesh(geometria, material);
  agregarBordes(malla);
  return malla;
}

// Ángulos donde están las esquinas de un rectángulo. Se agregan a la lista de
// ángulos de cada anillo, ya que, si no las esquinas del ducto quedan redondeadas.
function angulosEsquinas(perfil, n, w) {
  var lista = [];
  if (perfil.forma != "rect") {
    return lista;
  }
  var signos = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (var i = 0; i < signos.length; i++) {
    var esquina = perfil.u.clone().multiplyScalar(signos[i][0] * perfil.ancho / 2);
    esquina.addScaledVector(perfil.v, signos[i][1] * perfil.alto / 2);
    lista.push(Math.atan2(esquina.dot(w), esquina.dot(n)));
  }
  return lista;
}

// Lista de ángulos para recorrer el contorno: 48 ángulos parejos más las esquinas
function listaAngulos(extras) {
  var lista = [];
  var cantidad = 48;
  for (var i = 0; i < cantidad; i++) {
    lista.push(-Math.PI + i * 2 * Math.PI / cantidad);
  }
  for (var j = 0; j < extras.length; j++) {
    lista.push(extras[j]);
  }
  lista.sort(function (a, b) { return a - b; });

  // se quitan los ángulos repetidos (muy cercanos)
  var sinRepetir = [];
  for (var k = 0; k < lista.length; k++) {
    if (k == 0 || lista[k] - lista[k - 1] > 0.0001) {
      sinRepetir.push(lista[k]);
    }
  }
  return sinRepetir;
}


// ---------------------------------------------------------------------------
// Codo
// ---------------------------------------------------------------------------
// c1 y c2 son las dos conexiones del nodo, cada una con { tramo, sale, perfil, largo }.
// El codo es un cuarto de circunferencia alrededor de un centro de curvatura y
// en cada anillo el radio del contorno se va mezclando entre la sección de
// entrada y la de salida, permitiendo así pasar de rectangular a circular.
// Devuelve la malla y el "recorte", es decir, cuánto ocupa el codo sobre cada tramo.
function crearCodo(puntoNodo, c1, c2, material) {
  var a = c1.sale.clone().negate();   // dirección con la que se llega al nodo
  var b = c2.sale.clone();             // dirección con la que se sale del nodo
  var n = new THREE.Vector3();
  n.crossVectors(a, b);
  n.normalize();                       // normal del plano donde está el codo

  // radio de curvatura: el tamaño de la sección, pero sin pasar del 45% de cada tramo
  var R = Math.max(medidaEnEje(c1.perfil, b), medidaEnEje(c2.perfil, a));
  R = Math.min(R, 0.45 * c1.largo, 0.45 * c2.largo);

  var wA = new THREE.Vector3().crossVectors(n, a);
  var wB = new THREE.Vector3().crossVectors(n, b);
  var esquinas = angulosEsquinas(c1.perfil, n, wA).concat(angulosEsquinas(c2.perfil, n, wB));
  var angulos = listaAngulos(esquinas);

  // centro de la curva
  var centro = puntoNodo.clone();
  centro.addScaledVector(a, -R);
  centro.addScaledVector(b, R);

  var anillos = [];
  var pasos = 18;
  for (var i = 0; i <= pasos; i++) {
    var t = i / pasos;                     // va de 0 (entrada) a 1 (salida)
    var theta = t * Math.PI / 2;
    var cos = Math.cos(theta);
    var sen = Math.sin(theta);

    // centro del anillo y dirección del codo en ese punto
    var centroAnillo = centro.clone().addScaledVector(b, -R * cos).addScaledVector(a, R * sen);
    var tangente = a.clone().multiplyScalar(cos).addScaledVector(b, sen);
    var w = new THREE.Vector3().crossVectors(n, tangente);

    var anillo = [];
    for (var j = 0; j < angulos.length; j++) {
      var c = Math.cos(angulos[j]);
      var s = Math.sin(angulos[j]);
      var dirEntrada = n.clone().multiplyScalar(c).addScaledVector(wA, s);
      var dirSalida = n.clone().multiplyScalar(c).addScaledVector(wB, s);
      var rEntrada = radioEnDireccion(c1.perfil, dirEntrada);
      var rSalida = radioEnDireccion(c2.perfil, dirSalida);
      var r = rEntrada + (rSalida - rEntrada) * t;   // mezcla entre entrada y salida
      var punto = centroAnillo.clone().addScaledVector(n, c * r).addScaledVector(w, s * r);
      anillo.push(punto);
    }
    anillos.push(anillo);
  }

  return { malla: crearMallaDesdeAnillos(anillos, material), recorte: R };
}


// ---------------------------------------------------------------------------
// Transición (cambio de sección en línea recta)
// ---------------------------------------------------------------------------
function crearTransicion(puntoNodo, c1, c2, material) {
  var a = c1.sale.clone().negate();
  var n = c1.perfil.u.clone();
  var w = new THREE.Vector3().crossVectors(n, a);

  // el largo depende de cuánto cambia la sección (mínimo 0,25 m)
  var diferencia = Math.max(
    Math.abs(medidaEnEje(c1.perfil, n) - medidaEnEje(c2.perfil, n)),
    Math.abs(medidaEnEje(c1.perfil, w) - medidaEnEje(c2.perfil, w))
  );
  var largo = Math.max(0.25, diferencia * 1.4);
  largo = Math.min(largo, 0.9 * c1.largo, 0.9 * c2.largo);

  var esquinas = angulosEsquinas(c1.perfil, n, w).concat(angulosEsquinas(c2.perfil, n, w));
  var angulos = listaAngulos(esquinas);

  var anillos = [];
  var pasos = 6;
  for (var i = 0; i <= pasos; i++) {
    var t = i / pasos;
    var centro = puntoNodo.clone().addScaledVector(a, -largo / 2 + t * largo);
    var anillo = [];
    for (var j = 0; j < angulos.length; j++) {
      var dir = n.clone().multiplyScalar(Math.cos(angulos[j])).addScaledVector(w, Math.sin(angulos[j]));
      var r1 = radioEnDireccion(c1.perfil, dir);
      var r2 = radioEnDireccion(c2.perfil, dir);
      anillo.push(centro.clone().addScaledVector(dir, r1 + (r2 - r1) * t));
    }
    anillos.push(anillo);
  }
  return { malla: crearMallaDesdeAnillos(anillos, material), recorte: largo / 2 };
}


// ---------------------------------------------------------------------------
// Derivación
// ---------------------------------------------------------------------------
// Se dibuja como una caja que envuelve todas las secciones que llegan al nodo.
// Devuelve la malla y el recorte de cada conexión (en el mismo orden).
function crearDerivacion(puntoNodo, conexiones, material) {
  var ejes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  var tamano = [0, 0, 0];
  var hayTramoEnEje = [false, false, false];
  var ejeDeCadaConexion = [];

  for (var i = 0; i < conexiones.length; i++) {
    var c = conexiones[i];
    for (var k = 0; k < 3; k++) {
      tamano[k] = Math.max(tamano[k], medidaEnEje(c.perfil, ejes[k]));
    }
    // se busca en qué eje (x, y o z) va el tramo
    var eje = 0;
    if (Math.abs(c.sale.y) > 0.5) { eje = 1; }
    if (Math.abs(c.sale.z) > 0.5) { eje = 2; }
    ejeDeCadaConexion.push(eje);
    hayTramoEnEje[eje] = true;
  }

  // se agranda un poco la caja para que se note que es una pieza aparte
  for (var k2 = 0; k2 < 3; k2++) {
    if (hayTramoEnEje[k2]) {
      tamano[k2] = tamano[k2] + 0.12;
    } else {
      tamano[k2] = tamano[k2] + 0.03;
    }
    tamano[k2] = Math.max(0.05, tamano[k2]);
  }

  var caja = new THREE.Mesh(new THREE.BoxGeometry(tamano[0], tamano[1], tamano[2]), material);
  caja.position.copy(puntoNodo);
  agregarBordes(caja);

  var recortes = [];
  for (var j = 0; j < conexiones.length; j++) {
    recortes.push(Math.min(tamano[ejeDeCadaConexion[j]] / 2, 0.45 * conexiones[j].largo));
  }
  return { malla: caja, recortes: recortes };
}


// ---------------------------------------------------------------------------
// Tramo recto
// ---------------------------------------------------------------------------
// recorteA y recorteB son los pedazos que ocupan los fittings en cada extremo,
// el tramo se dibuja solo en la parte que queda libre entre ellos.
// Devuelve un grupo con el ducto y sus pestañas (uniones) en cada punta.
function crearTramoRecto(tramo, recorteA, recorteB, material) {
  var perfil = perfilTramo(tramo);
  var largo = largoTramo(tramo) - recorteA - recorteB;
  if (largo < 0.005) {
    return null;   // el fitting ocupa todo el tramo
  }

  var grupo = new THREE.Group();
  var inicio = posicionNodo(tramo.a);
  grupo.position.copy(inicio.addScaledVector(perfil.d, recorteA + largo / 2));
  grupo.quaternion.copy(rotacionDesdeBase(perfil.u, perfil.v, perfil.d));

  var cuerpo;
  if (tramo.forma == "rect") {
    cuerpo = new THREE.Mesh(new THREE.BoxGeometry(perfil.ancho, perfil.alto, largo), material);
  } else {
    var cilindro = new THREE.CylinderGeometry(perfil.diametro / 2, perfil.diametro / 2, largo, 36, 1, true);
    cilindro.rotateX(Math.PI / 2);   // el cilindro de Three.js viene parado, se acuesta en el eje z
    cuerpo = new THREE.Mesh(cilindro, material);
  }
  agregarBordes(cuerpo);
  grupo.add(cuerpo);

  // pestañas en cada extremo
  var extremos = [-largo / 2, largo / 2];
  for (var i = 0; i < extremos.length; i++) {
    var pestana;
    if (tramo.forma == "rect") {
      pestana = new THREE.Mesh(new THREE.BoxGeometry(perfil.ancho + 0.05, perfil.alto + 0.05, 0.025), materiales.pestana);
    } else {
      var disco = new THREE.CylinderGeometry(perfil.diametro / 2 + 0.025, perfil.diametro / 2 + 0.025, 0.025, 36);
      disco.rotateX(Math.PI / 2);
      pestana = new THREE.Mesh(disco, materiales.pestana);
    }
    pestana.position.z = extremos[i];
    grupo.add(pestana);
  }
  return grupo;
}


// ---------------------------------------------------------------------------
// Accesorios
// ---------------------------------------------------------------------------
// Caja o cilindro un poco más grande que el ducto
function cuerpoAccesorio(esCircular, ancho, alto, largo, material) {
  if (esCircular) {
    var cil = new THREE.CylinderGeometry(ancho / 2, ancho / 2, largo, 36);
    cil.rotateX(Math.PI / 2);
    return new THREE.Mesh(cil, material);
  }
  return new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, largo), material);
}

function crearAccesorio(accesorio) {
  var tramo = red.tramos[accesorio.tramo];
  var perfil = perfilTramo(tramo);
  var esCircular = (tramo.forma == "circ");
  var ancho = perfil.ancho;
  var alto = perfil.alto;
  if (esCircular) {
    ancho = perfil.diametro;
    alto = perfil.diametro;
  }

  var grupo = new THREE.Group();
  var inicio = posicionNodo(tramo.a);
  grupo.position.copy(inicio.addScaledVector(perfil.d, accesorio.posicion));
  grupo.quaternion.copy(rotacionDesdeBase(perfil.u, perfil.v, perfil.d));

  var material = materiales[accesorio.tipo];
  var piezas = [];

  if (accesorio.tipo == "CR") {
    // compuerta de regulación: cuerpo delgado con una palanca
    piezas.push(cuerpoAccesorio(esCircular, ancho + 0.06, alto + 0.06, 0.1, material));
    var palanca = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), material);
    palanca.position.set(ancho / 2 + 0.13, 0, 0);
    piezas.push(palanca);
  } else if (accesorio.tipo == "CCF") {
    // compuerta cortafuego: cuerpo más grueso con un actuador al costado
    piezas.push(cuerpoAccesorio(esCircular, ancho + 0.14, alto + 0.14, 0.3, material));
    var actuador = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.14), material);
    actuador.position.set(ancho / 2 + 0.13, 0, 0);
    piezas.push(actuador);
  } else if (accesorio.tipo == "SIL") {
    piezas.push(cuerpoAccesorio(esCircular, ancho + 0.2, alto + 0.2, 0.9, material));
  } else if (accesorio.tipo == "FIL") {
    piezas.push(cuerpoAccesorio(esCircular, ancho + 0.12, alto + 0.12, 0.18, material));
  } else if (accesorio.tipo == "VAV") {
    // la caja VAV siempre es rectangular y tiene un controlador al costado
    piezas.push(cuerpoAccesorio(false, ancho + 0.3, alto + 0.12, 0.7, material));
    var controlador = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.25), materiales.terminal);
    controlador.position.set(ancho / 2 + 0.21, 0, 0);
    piezas.push(controlador);
  }

  for (var i = 0; i < piezas.length; i++) {
    agregarBordes(piezas[i]);
    piezas[i].userData.elemento = { tipo: "tramo", id: tramo.id };   // al hacer clic se selecciona el tramo
    grupo.add(piezas[i]);
  }
  return grupo;
}


// ---------------------------------------------------------------------------
// Terminales (difusor, rejilla, tapa y UMA)
// ---------------------------------------------------------------------------
// conexion es la única conexión del nodo extremo
function crearTerminal(nodo, conexion) {
  var tramo = conexion.tramo;
  var perfil = conexion.perfil;
  var ancho = perfil.ancho;
  var alto = perfil.alto;
  if (tramo.forma == "circ") {
    ancho = perfil.diametro;
    alto = perfil.diametro;
  }

  // signo: el terminal tiene que mirar hacia afuera del ducto
  var signo = -1;
  if (tramo.b == nodo.id) {
    signo = 1;
  }

  var grupo = new THREE.Group();
  grupo.position.copy(posicionNodo(nodo.id));
  grupo.quaternion.copy(rotacionDesdeBase(perfil.u, perfil.v, perfil.d));
  var piezas = [];

  if (nodo.terminal == "difusor") {
    // placa cuadrada con tres cuadrados dibujados encima
    var lado = Math.max(ancho, alto) + 0.3;
    var placa = new THREE.Mesh(new THREE.BoxGeometry(lado, lado, 0.04), materiales.terminal);
    placa.position.z = signo * 0.02;
    piezas.push(placa);
    var factores = [0.78, 0.56, 0.34];
    for (var i = 0; i < factores.length; i++) {
      var h = lado * factores[i] / 2;
      var z = signo * 0.042;
      var puntos = [
        new THREE.Vector3(-h, -h, z), new THREE.Vector3(h, -h, z),
        new THREE.Vector3(h, h, z), new THREE.Vector3(-h, h, z), new THREE.Vector3(-h, -h, z)
      ];
      grupo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), materialLineas));
    }
  } else if (nodo.terminal == "rejilla") {
    // placa con líneas horizontales
    var placaR = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.1, alto + 0.1, 0.04), materiales.terminal);
    placaR.position.z = signo * 0.02;
    piezas.push(placaR);
    var lineas = [];
    for (var y = -alto / 2 + 0.03; y < alto / 2; y = y + 0.035) {
      lineas.push(new THREE.Vector3(-ancho / 2, y, signo * 0.042));
      lineas.push(new THREE.Vector3(ancho / 2, y, signo * 0.042));
    }
    grupo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lineas), materialLineas));
  } else if (nodo.terminal == "tapa") {
    var tapa = cuerpoAccesorio(tramo.forma == "circ", ancho + 0.02, alto + 0.02, 0.02, materiales.pestana);
    tapa.position.z = signo * 0.01;
    piezas.push(tapa);
  } else if (nodo.terminal == "uma") {
    // caja grande con un disco que representa el ventilador
    var medida = Math.max(ancho, alto);
    var caja = new THREE.Mesh(new THREE.BoxGeometry(medida + 0.9, medida + 0.7, 2.0), materiales.uma);
    caja.position.z = signo * 1.0;
    piezas.push(caja);
    var disco = new THREE.CylinderGeometry(medida * 0.45, medida * 0.45, 0.02, 40);
    disco.rotateX(Math.PI / 2);
    var ventilador = new THREE.Mesh(disco, materiales.pestana);
    ventilador.position.z = signo * 2.01;
    grupo.add(ventilador);
  }

  for (var j = 0; j < piezas.length; j++) {
    agregarBordes(piezas[j]);
    piezas[j].userData.elemento = { tipo: "nodo", id: nodo.id };
    grupo.add(piezas[j]);
  }
  return grupo;
}
