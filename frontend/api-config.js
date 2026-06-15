// Configuración de backend para el frontend desplegado.
// Reemplaza la URL siguiente por la de tu backend en Vercel:
// window.API_URL = "https://mi-backend.vercel.app";

// Si estás probando en local, descomenta y usa localhost:
// window.API_URL = "http://localhost:3002";

if (window.API_URL) {
  localStorage.setItem("API_URL", window.API_URL);
}
