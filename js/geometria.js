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
  umaClaro:     new THREE.MeshStandardMaterial({ color: 0xa3b0bb, metalness: 0.25, roughness: 0.6 }),
  lona:         new THREE.MeshStandardMaterial({ color: 0x3d4650, metalness: 0.0,  roughness: 0.95 }),
  // material de las redes que no están activas: transparente y sin escribir profundidad
  // para que no tapen a la red activa
  inactivo:     new THREE.MeshStandardMaterial({ color: 0xbac4cd, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
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
var materialLineasInactivo = new THREE.LineBasicMaterial({ color: 0x6b7a88, transparent: true, opacity: 0.12 });

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
// Pieza recta
// ---------------------------------------------------------------------------
// Crea una caja (ducto rectangular) o un cilindro (ducto circular) con el
// perfil de un tramo, centrada en el punto "centro" y con el largo indicado.
// Se usa para el cuerpo de las derivaciones y para las tapas del troncal.
function crearPiezaRecta(perfil, centro, largo, material) {
  var malla;
  if (perfil.forma == "rect") {
    malla = new THREE.Mesh(new THREE.BoxGeometry(perfil.ancho, perfil.alto, largo), material);
  } else {
    var cilindro = new THREE.CylinderGeometry(perfil.diametro / 2, perfil.diametro / 2, largo, 36);
    cilindro.rotateX(Math.PI / 2);   // se acuesta el cilindro en el eje z, igual que en los tramos
    malla = new THREE.Mesh(cilindro, material);
  }
  malla.position.copy(centro);
  malla.quaternion.copy(rotacionDesdeBase(perfil.u, perfil.v, perfil.d));
  agregarBordes(malla);
  return malla;
}


// ---------------------------------------------------------------------------
// Reducción o ampliación
// ---------------------------------------------------------------------------
// Pieza que pasa de la sección perfil1 a la sección perfil2 avanzando en la
// dirección "a", partiendo en el punto "inicio" y con el largo indicado. Se
// arma con anillos igual que el codo, pero los anillos van en línea recta y el
// radio de cada uno se mezcla entre la sección de entrada y la de salida.
var LARGO_REDUCCION = 0.30;   // las reducciones y ampliaciones miden 30 cm

function crearReduccion(inicio, a, perfil1, perfil2, largo, material) {
  var n = perfil1.u.clone();
  var w = new THREE.Vector3().crossVectors(n, a);

  var esquinas = angulosEsquinas(perfil1, n, w).concat(angulosEsquinas(perfil2, n, w));
  var angulos = listaAngulos(esquinas);

  var anillos = [];
  var pasos = 6;
  for (var i = 0; i <= pasos; i++) {
    var t = i / pasos;   // va de 0 (sección 1) a 1 (sección 2)
    var centro = inicio.clone().addScaledVector(a, t * largo);
    var anillo = [];
    for (var j = 0; j < angulos.length; j++) {
      var dir = n.clone().multiplyScalar(Math.cos(angulos[j])).addScaledVector(w, Math.sin(angulos[j]));
      var r1 = radioEnDireccion(perfil1, dir);
      var r2 = radioEnDireccion(perfil2, dir);
      anillo.push(centro.clone().addScaledVector(dir, r1 + (r2 - r1) * t));
    }
    anillos.push(anillo);
  }
  return crearMallaDesdeAnillos(anillos, material);
}

// Transición en un nodo con dos tramos en línea recta y distinta sección.
// La reducción (o ampliación) de 30 cm queda centrada en el nodo, sin embargo,
// si alguno de los tramos es muy corto se achica para que no se pase del tramo.
function crearTransicion(puntoNodo, c1, c2, material) {
  var a = c1.sale.clone().negate();   // dirección que va desde c1 hacia c2
  var largo = Math.min(LARGO_REDUCCION, 0.9 * c1.largo, 0.9 * c2.largo);
  var inicio = puntoNodo.clone().addScaledVector(a, -largo / 2);
  var malla = crearReduccion(inicio, a, c1.perfil, c2.perfil, largo, material);
  return { malla: malla, recorte: largo / 2 };
}


// ---------------------------------------------------------------------------
// Zapato chino y collarín (salida de un ramal desde el troncal)
// ---------------------------------------------------------------------------
// El zapato chino es la pieza con la que un ramal rectangular sale del troncal.
// Su boca sobre el troncal es más larga que el ramal hacia aguas arriba y ese
// lado queda inclinado a 45°, con el objeto de que el aire entre al ramal de
// forma más suave. El alargue es 1/4 del ancho del ramal medido en la dirección
// del troncal, con un mínimo de 100 mm, y como el lado va a 45° el zapato
// tiene de alto lo mismo que el alargue.
var ALARGUE_MINIMO_ZAPATO = 0.10;   // 100 mm
var LARGO_COLLARIN = 0.10;          // el collarín circular mide 100 mm

function alargueZapato(anchoEnTroncal) {
  return Math.max(anchoEnTroncal / 4, ALARGUE_MINIMO_ZAPATO);
}

// Crea una malla de 6 caras a partir de 8 puntos. Los puntos 0 a 3 son la cara
// de abajo y los puntos 4 a 7 la cara de arriba, ambas en el mismo orden.
function crearPiezaDe8Puntos(p, material) {
  var caras = [
    [0, 1, 2, 3],   // abajo
    [4, 5, 6, 7],   // arriba
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7]
  ];
  // cada cara de 4 puntos se divide en dos triángulos
  var posiciones = [];
  for (var i = 0; i < caras.length; i++) {
    var c = caras[i];
    var triangulos = [c[0], c[1], c[2], c[0], c[2], c[3]];
    for (var j = 0; j < triangulos.length; j++) {
      var punto = p[triangulos[j]];
      posiciones.push(punto.x, punto.y, punto.z);
    }
  }
  var geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.computeVertexNormals();
  return new THREE.Mesh(geometria, material);
}

// a: dirección del aire en el troncal, perfilTroncal: perfil del troncal en el
// nodo, conexion: la conexión del ramal { tramo, sale, perfil, largo }.
// Devuelve la malla y el recorte del ramal, es decir, desde el eje del troncal
// hasta donde termina el zapato o el collarín.
function crearSalidaRamal(puntoNodo, a, perfilTroncal, conexion, material) {
  var b = conexion.sale.clone();                          // hacia donde sale el ramal
  var c = new THREE.Vector3().crossVectors(a, b);         // tercer eje, perpendicular a los dos
  c.normalize();
  var mitadTroncal = radioEnDireccion(perfilTroncal, b);  // del eje del troncal a su pared

  // función auxiliar: punto a partir de cuánto se avanza en cada eje
  function punto(enA, enB, enC) {
    return puntoNodo.clone().addScaledVector(a, enA).addScaledVector(b, enB).addScaledVector(c, enC);
  }

  if (conexion.tramo.forma == "circ") {
    // collarín: un cuello circular corto pegado a la pared del troncal
    var radio = conexion.perfil.diametro / 2;
    var geometria = new THREE.CylinderGeometry(radio, radio, LARGO_COLLARIN, 36, 1, true);
    var collarin = new THREE.Mesh(geometria, material);
    collarin.position.copy(punto(0, mitadTroncal + LARGO_COLLARIN / 2, 0));
    // el cilindro de Three.js viene en el eje y, se gira para que apunte hacia b
    collarin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b);
    agregarBordes(collarin);
    return { malla: collarin, recorte: mitadTroncal + LARGO_COLLARIN };
  }

  // zapato chino para ramal rectangular
  var anchoEnA = medidaEnEje(conexion.perfil, a);   // medida del ramal en la dirección del troncal
  var anchoEnC = medidaEnEje(conexion.perfil, c);   // la otra medida del ramal
  var alargue = alargueZapato(anchoEnA);
  var base = mitadTroncal;                           // la base va sobre la pared del troncal
  var tope = mitadTroncal + alargue;                 // el tope se une con el ramal

  var puntos = [
    // base sobre el troncal, alargada hacia aguas arriba (lado negativo de a)
    punto(-anchoEnA / 2 - alargue, base, -anchoEnC / 2),
    punto(anchoEnA / 2, base, -anchoEnC / 2),
    punto(anchoEnA / 2, base, anchoEnC / 2),
    punto(-anchoEnA / 2 - alargue, base, anchoEnC / 2),
    // tope con la medida del ramal
    punto(-anchoEnA / 2, tope, -anchoEnC / 2),
    punto(anchoEnA / 2, tope, -anchoEnC / 2),
    punto(anchoEnA / 2, tope, anchoEnC / 2),
    punto(-anchoEnA / 2, tope, anchoEnC / 2)
  ];
  var zapato = crearPiezaDe8Puntos(puntos, material);
  agregarBordes(zapato);
  return { malla: zapato, recorte: tope };
}


// ---------------------------------------------------------------------------
// Derivación
// ---------------------------------------------------------------------------
// La derivación se arma de la siguiente forma:
//  - El troncal pasa por el nodo con la sección del tramo de entrada, mediante
//    un cuerpo recto que se alarga lo suficiente para que quepan los zapatos.
//  - Si el troncal sigue en línea recta con otra sección, después del cuerpo se
//    pone una reducción (o ampliación) de 30 cm, es decir, la reducción va
//    aguas abajo de los ramales.
//  - Si el troncal no sigue en línea recta, el cuerpo termina en una tapa y
//    todos los tramos que salen son ramales con zapato chino hacia ambos lados.
//  - Cada ramal sale con zapato chino si es rectangular o con collarín si es circular.
// Devuelve un grupo con todas las piezas y el recorte de cada conexión.
function crearDerivacion(puntoNodo, idNodo, conexiones, material) {
  var analisis = analizarDerivacion(idNodo);   // está en datos.js
  if (analisis == null) {
    return crearCajaDerivacion(puntoNodo, conexiones, material);
  }

  // se busca cuál de las conexiones es la entrada y cuál es la recta
  var entrada = null;
  var recta = null;
  for (var i = 0; i < conexiones.length; i++) {
    if (conexiones[i].tramo.id == analisis.entrada.id) {
      entrada = conexiones[i];
    }
    if (analisis.recto != null && conexiones[i].tramo.id == analisis.recto.id) {
      recta = conexiones[i];
    }
  }

  var a = entrada.sale.clone().negate();   // dirección del aire en el troncal
  var perfilTroncal = entrada.perfil;
  var grupo = new THREE.Group();
  var recortes = [];
  for (var r = 0; r < conexiones.length; r++) {
    recortes.push(0);
  }

  // cuánto debe medir el cuerpo hacia aguas arriba y hacia aguas abajo del nodo
  // para que entren los ramales, se deja una holgura de 5 cm por lado
  var haciaArriba = 0.05;
  var haciaAbajo = 0.05;
  for (var j = 0; j < conexiones.length; j++) {
    var con = conexiones[j];
    if (con == entrada || con == recta) {
      continue;
    }
    var anchoEnA = medidaEnEje(con.perfil, a);
    var extra = 0;
    if (con.tramo.forma == "rect") {
      extra = alargueZapato(anchoEnA);
    }
    haciaArriba = Math.max(haciaArriba, anchoEnA / 2 + extra + 0.05);
    haciaAbajo = Math.max(haciaAbajo, anchoEnA / 2 + 0.05);
  }
  haciaArriba = Math.min(haciaArriba, 0.9 * entrada.largo);

  // cuerpo recto del troncal
  var centroCuerpo = puntoNodo.clone().addScaledVector(a, (haciaAbajo - haciaArriba) / 2);
  grupo.add(crearPiezaRecta(perfilTroncal, centroCuerpo, haciaArriba + haciaAbajo, material));
  recortes[conexiones.indexOf(entrada)] = haciaArriba;

  if (recta != null) {
    if (mismaSeccion(entrada.tramo, recta.tramo)) {
      recortes[conexiones.indexOf(recta)] = haciaAbajo;
    } else {
      // reducción o ampliación de 30 cm después de los ramales
      var largoReduccion = Math.min(LARGO_REDUCCION, 0.9 * (recta.largo - haciaAbajo));
      var inicioReduccion = puntoNodo.clone().addScaledVector(a, haciaAbajo);
      grupo.add(crearReduccion(inicioReduccion, a, perfilTroncal, recta.perfil, largoReduccion, material));
      recortes[conexiones.indexOf(recta)] = haciaAbajo + largoReduccion;
    }
  } else {
    // el troncal termina en el nodo, por lo que se cierra con una tapa
    var centroTapa = puntoNodo.clone().addScaledVector(a, haciaAbajo + 0.01);
    grupo.add(crearPiezaRecta(perfilTroncal, centroTapa, 0.02, materiales.pestana));
  }

  // salidas de los ramales
  for (var k = 0; k < conexiones.length; k++) {
    if (conexiones[k] == entrada || conexiones[k] == recta) {
      continue;
    }
    var salida = crearSalidaRamal(puntoNodo, a, perfilTroncal, conexiones[k], material);
    grupo.add(salida.malla);
    recortes[k] = Math.min(salida.recorte, 0.9 * conexiones[k].largo);
  }

  return { malla: grupo, recortes: recortes };
}

// Caja que envuelve todas las secciones que llegan al nodo. Se usa solo cuando
// no se puede saber cuál es la entrada, es decir, cuando la derivación está en
// el mismo nodo de la UMA.
function crearCajaDerivacion(puntoNodo, conexiones, material) {
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
// Devuelve un grupo con el ducto. Las pestañas que antes se dibujaban en cada
// punta se quitaron, ya que, recargaban el dibujo en las uniones sin aportar información.
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
  }

  for (var j = 0; j < piezas.length; j++) {
    agregarBordes(piezas[j]);
    piezas[j].userData.elemento = { tipo: "nodo", id: nodo.id };
    grupo.add(piezas[j]);
  }
  return grupo;
}


// ---------------------------------------------------------------------------
// Equipos de origen: UMA y caja de ventilación
// ---------------------------------------------------------------------------
// Los equipos se dibujan "detrás" del nodo de origen, es decir, hacia el lado
// contrario de donde sale el ducto. Entre el equipo y el ducto se ponen dos
// piezas, tal como se instala en terreno:
//  - una transición de 30 cm que pasa de la sección del ducto a la boca de descarga
//  - una junta flexible de lona de 15 cm, la cual evita que las vibraciones
//    del ventilador se transmitan a los ductos
// Para ubicar cada pieza se mide la distancia "s" desde el nodo hacia atrás.
var LARGO_JUNTA_FLEXIBLE = 0.15;

// Arma un perfil rectangular con las medidas indicadas (en metros) usando los
// mismos ejes u, v, d de otro perfil, así las piezas quedan alineadas con el ducto
function perfilRectangular(perfilBase, ancho, alto) {
  return {
    forma: "rect",
    ancho: ancho,
    alto: alto,
    diametro: 0,
    u: perfilBase.u,
    v: perfilBase.v,
    d: perfilBase.d
  };
}

// Dibuja el contorno de un rectángulo con líneas, sirve para las puertas de
// registro de los equipos. ejeA y ejeB son las dos direcciones del rectángulo.
function lineasRectangulo(centro, ejeA, ejeB, mitadA, mitadB) {
  var esquinas = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  var puntos = [];
  for (var i = 0; i < esquinas.length; i++) {
    var p = centro.clone();
    p.addScaledVector(ejeA, esquinas[i][0] * mitadA);
    p.addScaledVector(ejeB, esquinas[i][1] * mitadB);
    puntos.push(p);
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), materialLineas);
}

// nodo: el nodo de origen, conexion: el ducto que sale del equipo o null si
// todavía no se ha trazado ninguno (en ese caso el equipo mira hacia +X).
// Devuelve el grupo con todas las piezas y el punto donde va la etiqueta.
function crearEquipo(nodo, conexion) {
  var puntoNodo = posicionNodo(nodo.id);
  var perfil;
  var sale;
  if (conexion != null) {
    perfil = conexion.perfil;
    sale = conexion.sale.clone();
  } else {
    // perfil de referencia de 600x400 hacia +X, con los ejes armados igual que en perfilTramo()
    sale = new THREE.Vector3(1, 0, 0);
    perfil = {
      forma: "rect", ancho: 0.6, alto: 0.4, diametro: 0,
      u: new THREE.Vector3(0, 0, -1),
      v: new THREE.Vector3(0, 1, 0),
      d: new THREE.Vector3(1, 0, 0)
    };
  }
  var atras = sale.clone().negate();   // dirección hacia donde está el equipo

  // medidas del ducto en metros (si es circular se usa el diámetro en ambos sentidos)
  var anchoDucto = perfil.ancho;
  var altoDucto = perfil.alto;
  if (perfil.forma == "circ") {
    anchoDucto = perfil.diametro;
    altoDucto = perfil.diametro;
  }

  // boca de descarga del equipo, 20 cm más grande que el ducto
  var perfilBoca = perfilRectangular(perfil, anchoDucto + 0.2, altoDucto + 0.2);

  // función auxiliar: punto a una distancia s detrás del nodo
  function puntoAtras(s) {
    return puntoNodo.clone().addScaledVector(atras, s);
  }

  var grupo = new THREE.Group();

  // 1) transición de 30 cm desde el ducto hasta la boca
  grupo.add(crearReduccion(puntoNodo, atras, perfil, perfilBoca, LARGO_REDUCCION, materiales.fitting));

  // 2) junta flexible de lona
  var sJunta = LARGO_REDUCCION;
  var perfilJunta = perfilRectangular(perfil, perfilBoca.ancho + 0.02, perfilBoca.alto + 0.02);
  grupo.add(crearPiezaRecta(perfilJunta, puntoAtras(sJunta + LARGO_JUNTA_FLEXIBLE / 2), LARGO_JUNTA_FLEXIBLE, materiales.lona));

  // 3) el equipo propiamente tal parte después de la junta
  var sEquipo = sJunta + LARGO_JUNTA_FLEXIBLE;
  var largoTotal = 0;

  if (nodo.terminal == "ventilador") {
    // Caja de ventilación: caja cúbica con la descarga al frente, una boca de
    // aspiración circular atrás y una puerta de registro en el costado
    var lado = Math.max(Math.max(perfilBoca.ancho, perfilBoca.alto) + 0.6, 0.8);
    var perfilCaja = perfilRectangular(perfil, lado, lado);
    grupo.add(crearPiezaRecta(perfilCaja, puntoAtras(sEquipo + lado / 2), lado, materiales.uma));

    // boca de aspiración: cuello circular corto en la cara de atrás
    var radioAsp = lado * 0.32;
    var cuello = new THREE.Mesh(new THREE.CylinderGeometry(radioAsp, radioAsp, 0.15, 36, 1, true), materiales.fitting);
    cuello.position.copy(puntoAtras(sEquipo + lado + 0.075));
    cuello.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), atras);
    agregarBordes(cuello);
    grupo.add(cuello);

    // puerta de registro en el costado (lado +u de la caja)
    var centroPuerta = puntoAtras(sEquipo + lado / 2).addScaledVector(perfil.u, lado / 2 + 0.003);
    grupo.add(lineasRectangulo(centroPuerta, atras, perfil.v, lado * 0.32, lado * 0.36));

    largoTotal = sEquipo + lado + 0.15;
  } else {
    // UMA: gabinete armado por módulos, desde la descarga hacia atrás:
    // ventilador, serpentín, filtro y caja de mezcla (toma de aire)
    var anchoGab = Math.max(perfilBoca.ancho + 0.5, 1.2);
    var altoGab = Math.max(perfilBoca.alto + 0.5, 1.2);
    var perfilGab = perfilRectangular(perfil, anchoGab, altoGab);
    var modulos = [
      { nombre: "ventilador", largo: 1.0, material: materiales.uma },
      { nombre: "serpentin",  largo: 0.6, material: materiales.umaClaro },
      { nombre: "filtro",     largo: 0.5, material: materiales.uma },
      { nombre: "mezcla",     largo: 0.7, material: materiales.umaClaro }
    ];

    var s = sEquipo;
    for (var i = 0; i < modulos.length; i++) {
      var m = modulos[i];
      var centroModulo = puntoAtras(s + m.largo / 2);
      grupo.add(crearPiezaRecta(perfilGab, centroModulo, m.largo, m.material));

      // puerta de registro de cada módulo en el costado (lado +u)
      var centroRegistro = centroModulo.clone().addScaledVector(perfil.u, anchoGab / 2 + 0.003);
      grupo.add(lineasRectangulo(centroRegistro, atras, perfil.v, m.largo * 0.38, altoGab * 0.4));
      s = s + m.largo;
    }

    // persianas de la toma de aire en la cara de atrás: líneas horizontales
    var centroToma = puntoAtras(s + 0.003);
    var lineas = [];
    for (var y = -altoGab * 0.4; y <= altoGab * 0.4; y = y + 0.08) {
      lineas.push(centroToma.clone().addScaledVector(perfil.v, y).addScaledVector(perfil.u, -anchoGab * 0.42));
      lineas.push(centroToma.clone().addScaledVector(perfil.v, y).addScaledVector(perfil.u, anchoGab * 0.42));
    }
    grupo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lineas), materialLineas));

    largoTotal = s;
  }

  // la etiqueta se pone sobre el centro del equipo
  var puntoEtiqueta = puntoAtras((sEquipo + largoTotal) / 2);
  puntoEtiqueta.y = puntoEtiqueta.y + 1.0;
  return { grupo: grupo, puntoEtiqueta: puntoEtiqueta };
}
