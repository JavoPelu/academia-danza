// Configuración de backend para el frontend desplegado.
// Si el frontend está en Vercel y el backend comparte el mismo origen,
// la app usará el origen actual por defecto.
// Si estás desarrollando localmente, se usará localhost:3002.

(function() {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const defaultApiUrl = isLocal ? "http://localhost:3002" : window.location.origin;
  if (!window.API_URL) {
    window.API_URL = defaultApiUrl;
  }
  localStorage.setItem("API_URL", window.API_URL);
})();
