async function login(event) {
    event.preventDefault();
    
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const mensajeDiv = document.getElementById("mensaje");

    // Validar email
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        mensajeDiv.textContent = "Por favor ingresa un email válido";
        mensajeDiv.className = "mensaje error";
        return;
    }

    if (password.length < 6) {
        mensajeDiv.textContent = "La contraseña debe tener al menos 6 caracteres";
        mensajeDiv.className = "mensaje error";
        return;
    }

    try {
        mensajeDiv.textContent = "Cargando...";
        mensajeDiv.className = "mensaje";

        const res = await fetch("http://localhost:3000/login", {
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
            window.location.href = "dashboard.html";
        } else {
            mensajeDiv.textContent = data.mensaje || "Error en login";
            mensajeDiv.className = "mensaje error";
        }
    } catch (err) {
        mensajeDiv.textContent = "Error de conexión. Intenta de nuevo.";
        mensajeDiv.className = "mensaje error";
        console.error(err);
    }
}
