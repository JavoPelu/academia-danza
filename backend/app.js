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

app.listen(3000, () => {
    console.log("Servidor en puerto 3000");
});