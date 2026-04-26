require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");

const db = require("./config/db");
const verificarToken = require("./middlewares/auth");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "secreto";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
    res.send("API funcionando 🔥");
});

app.get("/estudiantes", async (req, res) => {
    try {
        const [result] = await db.query("SELECT * FROM estudiantes");
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/estudiantes", async (req, res) => {
    const { nombre, email, telefono, acudiente_nombre, acudiente_telefono } = req.body;

    if (!nombre || !email || !acudiente_nombre || !acudiente_telefono) {
        return res.status(400).json({ mensaje: "Nombre estudiante, email, nombre acudiente y teléfono acudiente son requeridos" });
    }

    const sql = `
        INSERT INTO estudiantes (nombre, email, telefono, acudiente_nombre, acudiente_telefono, fecha_registro)
        VALUES (?, ?, ?, ?, ?, NOW())
    `;

    try {
        await db.query(sql, [nombre, email, telefono || null, acudiente_nombre, acudiente_telefono]);
        res.json({ mensaje: "Estudiante creado correctamente" });
    } catch (err) {
        console.error(err);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ mensaje: "El email ya está registrado" });
        }
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/clase/:id/estudiantes", async (req, res) => {
    const id_clase = req.params.id;
    const sql = `
        SELECT e.id, e.nombre
        FROM inscripciones i
        JOIN estudiantes e ON e.id = i.id_estudiante
        WHERE i.id_clase = ?
    `;

    try {
        const [result] = await db.query(sql, [id_clase]);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/clases", async (req, res) => {
    const sql = `
        SELECT c.id,
               c.nombre,
               c.descripcion,
               c.nivel,
               c.capacidad_maxima,
               COALESCE(COUNT(DISTINCT i.id_estudiante), 0) AS estudiantes_inscritos,
               COALESCE(GROUP_CONCAT(DISTINCT p.nombre SEPARATOR ', '), 'Sin asignar') AS profesor_nombre,
               GROUP_CONCAT(DISTINCT CONCAT(h.dia_semana, ' ', DATE_FORMAT(h.hora, '%H:%i')) SEPARATOR ', ') AS horarios
        FROM clases c
        LEFT JOIN horarios h ON h.id_clase = c.id
        LEFT JOIN profesores p ON p.id = h.id_profesor
        LEFT JOIN inscripciones i ON i.id_clase = c.id
        GROUP BY c.id
    `;

    try {
        const [result] = await db.query(sql);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.put("/clases/:id/capacidad", verificarToken, async (req, res) => {
    const { capacidad_maxima } = req.body;
    const id_clase = req.params.id;

    if (!capacidad_maxima || capacidad_maxima < 1) {
        return res.status(400).json({ mensaje: "Capacidad inválida" });
    }

    const sql = "UPDATE clases SET capacidad_maxima = ? WHERE id = ?";

    try {
        await db.query(sql, [capacidad_maxima, id_clase]);
        res.json({ mensaje: "Capacidad actualizada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/clases/:id", async (req, res) => {
    const id_clase = req.params.id;
    const sql = `
        SELECT c.id,
               c.nombre,
               c.descripcion,
               c.nivel,
               c.capacidad_maxima,
               COALESCE(GROUP_CONCAT(DISTINCT CONCAT(h.dia_semana, ' ', DATE_FORMAT(h.hora, '%H:%i')) SEPARATOR ', '), '') AS horarios,
               COALESCE(GROUP_CONCAT(DISTINCT p.nombre SEPARATOR ', '), '') AS profesor_nombre
        FROM clases c
        LEFT JOIN horarios h ON h.id_clase = c.id
        LEFT JOIN profesores p ON p.id = h.id_profesor
        WHERE c.id = ?
        GROUP BY c.id
    `;

    try {
        const [result] = await db.query(sql, [id_clase]);
        if (!result.length) {
            return res.status(404).json({ mensaje: "Clase no encontrada" });
        }
        res.json(result[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.put("/clases/:id", verificarToken, async (req, res) => {
    const { nombre, descripcion, nivel, capacidad_maxima } = req.body;
    const id_clase = req.params.id;

    if (!nombre || !nivel || !capacidad_maxima || capacidad_maxima < 1) {
        return res.status(400).json({ mensaje: "Todos los campos son requeridos" });
    }

    const sql = "UPDATE clases SET nombre = ?, descripcion = ?, nivel = ?, capacidad_maxima = ? WHERE id = ?";

    try {
        await db.query(sql, [nombre, descripcion || null, nivel, capacidad_maxima, id_clase]);
        res.json({ mensaje: "Clase actualizada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.delete("/clases/:id", verificarToken, async (req, res) => {
    const id_clase = req.params.id;

    try {
        await db.query("DELETE FROM horarios WHERE id_clase = ?", [id_clase]);
        await db.query("DELETE FROM inscripciones WHERE id_clase = ?", [id_clase]);
        await db.query("DELETE FROM clases WHERE id = ?", [id_clase]);
        res.json({ mensaje: "Clase eliminada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/clases", verificarToken, async (req, res) => {
    const { nombre, descripcion, nivel, capacidad_maxima } = req.body;

    if (!nombre || !nivel) {
        return res.status(400).json({ mensaje: "Nombre y nivel son requeridos" });
    }

    const sql = `
        INSERT INTO clases (nombre, descripcion, nivel, capacidad_maxima)
        VALUES (?, ?, ?, ?)
    `;

    try {
        const [result] = await db.query(sql, [nombre, descripcion || null, nivel, capacidad_maxima || 20]);
        res.json({ 
            mensaje: "Clase creada correctamente", 
            id: result.insertId 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/horarios", verificarToken, async (req, res) => {
    const { id_clase, id_profesor, dia_semana, hora } = req.body;

    if (!id_clase || !id_profesor || !dia_semana || !hora) {
        return res.status(400).json({ mensaje: "Todos los campos son requeridos" });
    }

    // Validar día de la semana
    const diasValidos = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    if (!diasValidos.includes(dia_semana)) {
        return res.status(400).json({ mensaje: "Día de la semana inválido" });
    }

    const sql = `
        INSERT INTO horarios (id_clase, id_profesor, dia_semana, hora)
        VALUES (?, ?, ?, ?)
    `;

    try {
        const [result] = await db.query(sql, [id_clase, id_profesor, dia_semana, hora]);
        res.json({ 
            mensaje: "Horario asignado correctamente", 
            id: result.insertId 
        });
    } catch (err) {
        console.error(err);
        if (err.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({ mensaje: "Clase o profesor no existe" });
        }
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/horarios/:id_clase", async (req, res) => {
    const id_clase = req.params.id_clase;
    const sql = `
        SELECT h.id, h.dia_semana, h.hora, p.nombre AS profesor_nombre
        FROM horarios h
        JOIN profesores p ON p.id = h.id_profesor
        WHERE h.id_clase = ?
        ORDER BY FIELD(h.dia_semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'), h.hora
    `;

    try {
        const [result] = await db.query(sql, [id_clase]);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.delete("/horarios/:id", verificarToken, async (req, res) => {
    const id_horario = req.params.id;

    const sql = "DELETE FROM horarios WHERE id = ?";

    try {
        await db.query(sql, [id_horario]);
        res.json({ mensaje: "Horario eliminado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/profesores", async (req, res) => {
    try {
        const [result] = await db.query("SELECT id, nombre FROM profesores ORDER BY nombre");
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.delete("/inscripciones/:id_estudiante/:id_clase", verificarToken, async (req, res) => {
    const { id_estudiante, id_clase } = req.params;

    const sql = "DELETE FROM inscripciones WHERE id_estudiante = ? AND id_clase = ?";

    try {
        await db.query(sql, [id_estudiante, id_clase]);
        res.json({ mensaje: "Estudiante retirado de la clase" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/inscripciones/cambiar", verificarToken, async (req, res) => {
    const { id_estudiante, id_clase_anterior, id_clase_nueva } = req.body;

    if (!id_estudiante || !id_clase_anterior || !id_clase_nueva) {
        return res.status(400).json({ mensaje: "Faltan datos requeridos" });
    }

    if (id_clase_anterior === id_clase_nueva) {
        return res.status(400).json({ mensaje: "La clase nueva debe ser diferente" });
    }

    try {
        const [already] = await db.query(
            "SELECT id FROM inscripciones WHERE id_estudiante = ? AND id_clase = ?",
            [id_estudiante, id_clase_nueva]
        );

        if (already.length) {
            return res.status(400).json({ mensaje: "El estudiante ya está inscrito en la clase nueva" });
        }

        const [conflict] = await db.query(
            `
                SELECT 1
                FROM inscripciones i
                JOIN horarios h_old ON h_old.id_clase = i.id_clase
                JOIN horarios h_new ON h_new.id_clase = ?
                WHERE i.id_estudiante = ?
                  AND i.id_clase <> ?
                  AND h_old.dia_semana = h_new.dia_semana
                  AND h_old.hora = h_new.hora
                LIMIT 1
            `,
            [id_clase_nueva, id_estudiante, id_clase_anterior]
        );

        if (conflict.length) {
            return res.status(400).json({ mensaje: "No se puede cambiar: el estudiante ya tiene otra clase en ese mismo horario" });
        }

        await db.query("DELETE FROM inscripciones WHERE id_estudiante = ? AND id_clase = ?", [id_estudiante, id_clase_anterior]);
        await db.query("INSERT INTO inscripciones (id_estudiante, id_clase, fecha_inscripcion) VALUES (?, ?, CURDATE())", [id_estudiante, id_clase_nueva]);
        res.json({ mensaje: "Estudiante cambiado de clase correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/inscripciones", verificarToken, async (req, res) => {
    const { id_estudiante, id_clase } = req.body;

    if (!id_estudiante || !id_clase) {
        return res.status(400).json({ mensaje: "Faltan datos requeridos" });
    }

    try {
        const [existing] = await db.query(
            "SELECT id FROM inscripciones WHERE id_estudiante = ? AND id_clase = ?",
            [id_estudiante, id_clase]
        );

        if (existing.length) {
            return res.status(400).json({ mensaje: "El estudiante ya está inscrito en esta clase" });
        }

        const [conflict] = await db.query(
            `
                SELECT 1
                FROM inscripciones i
                JOIN horarios h_old ON h_old.id_clase = i.id_clase
                JOIN horarios h_new ON h_new.id_clase = ?
                WHERE i.id_estudiante = ?
                  AND h_old.dia_semana = h_new.dia_semana
                  AND h_old.hora = h_new.hora
                LIMIT 1
            `,
            [id_clase, id_estudiante]
        );

        if (conflict.length) {
            return res.status(400).json({ mensaje: "El estudiante ya tiene otra clase en ese mismo horario" });
        }

        // Verificar capacidad de la clase
        const [capacidad] = await db.query(
            `SELECT capacidad_maxima,
                    (SELECT COUNT(*) FROM inscripciones WHERE id_clase = ?) AS inscritos
             FROM clases
             WHERE id = ?`,
            [id_clase, id_clase]
        );

        if (capacidad.length === 0) {
            return res.status(404).json({ mensaje: "Clase no existe" });
        }

        if (capacidad[0].inscritos >= capacidad[0].capacidad_maxima) {
            return res.status(400).json({ mensaje: "La clase ya está llena" });
        }

        const sql = "INSERT INTO inscripciones (id_estudiante, id_clase, fecha_inscripcion) VALUES (?, ?, CURDATE())";
        await db.query(sql, [id_estudiante, id_clase]);
        res.json({ mensaje: "Estudiante asignado a clase correctamente" });
    } catch (err) {
        console.error(err);
        if (err.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({ mensaje: "Estudiante o clase no existe" });
        }
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/asistencia", verificarToken, async (req, res) => {
    const { id_estudiante, id_clase, fecha, estado } = req.body;
    const id_profesor = req.user.id_profesor;

    if (!id_estudiante || !id_clase || !fecha || !estado) {
        return res.status(400).json({ mensaje: "Faltan datos requeridos" });
    }

    const sql = `
        INSERT INTO asistencia (id_estudiante, id_clase, fecha, estado, id_profesor)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            estado = VALUES(estado),
            id_profesor = VALUES(id_profesor)
    `;

    try {
        await db.query(sql, [id_estudiante, id_clase, fecha, estado, id_profesor]);
        res.json({ mensaje: "Asistencia registrada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ mensaje: "Email y contraseña requeridos" });
    }

    const sql = "SELECT * FROM usuarios WHERE email = ?";

    try {
        const [result] = await db.query(sql, [email]);

        if (result.length === 0) {
            return res.status(401).json({ mensaje: "Usuario no existe" });
        }

        const user = result[0];

        if (user.password !== password) {
            return res.status(401).json({ mensaje: "Contraseña incorrecta" });
        }

        const token = jwt.sign(
            { id: user.id, rol: user.rol, id_profesor: user.id_profesor },
            JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({ mensaje: "Login exitoso", token, rol: user.rol, id_profesor: user.id_profesor });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

app.get("/asistencia", async (req, res) => {
    const sql = `
        SELECT e.nombre, c.nombre AS clase, a.fecha, a.estado
        FROM asistencia a
        JOIN estudiantes e ON e.id = a.id_estudiante
        JOIN clases c ON c.id = a.id_clase
    `;

    try {
        const [result] = await db.query(sql);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/asistencia/:id_clase/:fecha", async (req, res) => {
    const { id_clase, fecha } = req.params;
    const sql = `
        SELECT e.nombre, a.estado, a.fecha
        FROM asistencia a
        JOIN estudiantes e ON e.id = a.id_estudiante
        WHERE a.id_clase = ? AND a.fecha = ?
    `;

    try {
        const [result] = await db.query(sql, [id_clase, fecha]);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.listen(process.env.PORT || 3002, () => {
    console.log("Servidor en puerto", process.env.PORT || 3002);
});