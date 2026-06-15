async function login(event) {
    event.preventDefault();
    
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const mensajeDiv = document.getElementById("mensaje");

    if (!email) {
        mensajeDiv.textContent = "Por favor ingresa usuario o correo";
        mensajeDiv.className = "mensaje error";
        return;
    }

    if (password.length < 4) {
        mensajeDiv.textContent = "La contraseña debe tener al menos 4 caracteres";
        mensajeDiv.className = "mensaje error";
        return;
    }

    try {
        mensajeDiv.textContent = "Cargando...";
        mensajeDiv.className = "mensaje";

        const apiUrl = localStorage.getItem("API_URL") || window.API_URL || (window.location.hostname === "localhost" ? "http://localhost:3002" : window.location.origin);
        const res = await fetch(`${apiUrl}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (data.token) {
            localStorage.setItem("token", data.token);
            localStorage.setItem("id_profesor", data.id_profesor);
            localStorage.setItem("rol", data.rol || "");
            window.location.href = "dashboard.html";
        } else {
            mensajeDiv.textContent = data.mensaje || "Error en login";
            mensajeDiv.className = "mensaje error";
        }
    } catch (err) {
        mensajeDiv.textContent = "No se pudo conectar con el servidor. Verifica que el backend esté encendido en el puerto 3002.";
        mensajeDiv.className = "mensaje error";
        console.error(err);
    }
}
