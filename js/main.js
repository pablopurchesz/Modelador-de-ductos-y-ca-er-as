// ============================================================================
// main.js
// Punto de partida del programa, se ejecuta al final cuando todos los demás
// archivos ya están cargados.
// ============================================================================

// Primeramente se intenta cargar la red guardada en el navegador, si no hay
// ninguna se carga la red de ejemplo
if (!cargarDesdeNavegador()) {
  crearRedEjemplo();
}

document.getElementById("btnCotas").className = "activo";   // las cotas parten encendidas

reconstruirEscena();
vistaIso();
mostrarMensaje("Selecciona un nodo con clic y escribe un tramo, por ejemplo +X 3 600x400. Escribe ayuda para ver los comandos.", "");

// se parte el bucle de dibujo
animar();
