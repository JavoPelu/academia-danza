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

app.post("/asistencia", verificarToken, async (req, res) => {
    const { id_estudiante, id_clase, fecha, estado } = req.body;
    const id_profesor = req.user.id_profesor;

    // Validar inputs
    if (!id_estudiante || !id_clase || !fecha || !estado) {
        return res.status(400).json({ mensaje: "Faltan datos requeridos" });
    }

    const sql = `
        INSERT INTO asistencia (id_estudiante, id_clase, fecha, estado, id_profesor)
        VALUES (?, ?, ?, ?, ?)
    `;

    try {
        await db.query(sql, [id_estudiante, id_clase, fecha, estado, id_profesor]);
        res.json({ mensaje: "Asistencia registrada correctamente" });
    } catch (err) {
        console.error(err);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ mensaje: "Asistencia ya registrada" });
        }
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

app.listen(process.env.PORT || 3000, () => {
    console.log("Servidor en puerto", process.env.PORT || 3000);
});