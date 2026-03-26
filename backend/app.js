const express = require("express");
const cors = require("cors");

const app = express();
const db = require("./config/db");

app.use(cors());
app.use(express.json());

// Ruta básica
app.get("/", (req, res) => {
    res.send("API funcionando 🔥");
});

// 🔥 PROBAR BASE DE DATOS
app.get("/estudiantes", (req, res) => {
    db.query("SELECT * FROM estudiantes", (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error en BD");
        }
        res.json(result);
    });
});

// 🔥 ESTUDIANTES POR CLASE
app.get("/clase/:id/estudiantes", (req, res) => {
    const id_clase = req.params.id;

    const sql = `
        SELECT e.id, e.nombre
        FROM inscripciones i
        JOIN estudiantes e ON e.id = i.id_estudiante
        WHERE i.id_clase = ?
    `;

    db.query(sql, [id_clase], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error");
        }
        res.json(result);
    });
});

// 🔥 ASISTENCIA
app.post("/asistencia", (req, res) => {
    const { id_estudiante, id_clase, fecha, estado, id_profesor } = req.body;

    const sql = `
        INSERT INTO asistencia (id_estudiante, id_clase, fecha, estado, id_profesor)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [id_estudiante, id_clase, fecha, estado, id_profesor], (err, result) => {
        if (err) {
            console.log(err);

            if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ mensaje: "Asistencia ya registrada" });
            }

            return res.status(500).json({ mensaje: "Error al guardar" });
        }

        res.json({ mensaje: "Asistencia registrada correctamente" });
    });
});

// 🚀 SIEMPRE AL FINAL
app.listen(3000, () => {
    console.log("Servidor en puerto 3000");
});
app.get("/asistencia/:id_clase/:fecha", (req, res) => {
    const { id_clase, fecha } = req.params;

    const sql = `
        SELECT e.nombre, a.estado, a.fecha
        FROM asistencia a
        JOIN estudiantes e ON e.id = a.id_estudiante
        WHERE a.id_clase = ? AND a.fecha = ?
    `;

    db.query(sql, [id_clase, fecha], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error");
        }

        res.json(result);
    });
});