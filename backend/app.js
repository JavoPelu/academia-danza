require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");

const db = require("./config/db");
const verificarToken = require("./middlewares/auth");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "secreto";

const ROLES_ADMINISTRATIVOS = new Set(["admin", "auxiliar_administrativo", "auxiliar administrativo"]);

const esRolAdministrativo = rol => ROLES_ADMINISTRATIVOS.has(rol);

const requireAdmin = (req, res, next) => {
    if (!req.user || !esRolAdministrativo(req.user.rol)) {
        return res.status(403).json({ mensaje: "Acceso solo para administradores" });
    }
    next();
};

const requireSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.rol !== "admin") {
        return res.status(403).json({ mensaje: "Solo el administrador principal puede cambiar roles" });
    }
    next();
};

async function inicializarTablas() {
    const sqlAsistenciaProfesores = `
        CREATE TABLE IF NOT EXISTS asistencia_profesores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_profesor INT NOT NULL,
            fecha DATE NOT NULL,
            estado ENUM('asistio', 'falta') NOT NULL,
            reportado_por_admin INT NULL,
            UNIQUE KEY unique_profesor_fecha (id_profesor, fecha),
            INDEX idx_profesor_fecha (id_profesor, fecha)
        )
    `;

    const sqlMensualidades = `
        CREATE TABLE IF NOT EXISTS mensualidades (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_estudiante INT NOT NULL,
            periodo CHAR(7) NOT NULL,
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE NOT NULL,
            clases_incluidas INT NOT NULL DEFAULT 4,
            valor DECIMAL(10,2) NOT NULL DEFAULT 0,
            estado ENUM('debe', 'al_dia') NOT NULL DEFAULT 'debe',
            fecha_pago DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_estudiante_periodo (id_estudiante, periodo),
            INDEX idx_periodo_estado (periodo, estado)
        )
    `;

    const sqlTarifasClase = `
        CREATE TABLE IF NOT EXISTS tarifas_clase (
            id_clase INT PRIMARY KEY,
            valor_mensual DECIMAL(10,2) NOT NULL DEFAULT 0
        )
    `;

    const sqlPagosEstudianteClase = `
        CREATE TABLE IF NOT EXISTS pagos_estudiante_clase (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_estudiante INT NOT NULL,
            id_clase INT NOT NULL,
            fecha_pago DATE NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            periodo_referencia CHAR(7) NULL,
            observacion VARCHAR(255) NULL,
            registrado_por INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_estudiante_clase_fecha (id_estudiante, id_clase, fecha_pago)
        )
    `;

    const sqlDescuentosEstudiante = `
        CREATE TABLE IF NOT EXISTS descuentos_estudiante (
            id_estudiante INT PRIMARY KEY,
            porcentaje_dos_o_mas_clases DECIMAL(5,2) NOT NULL DEFAULT 0
        )
    `;

    try {
        await db.query(sqlAsistenciaProfesores);
        await db.query(sqlMensualidades);
        await db.query(sqlTarifasClase);
        await db.query(sqlPagosEstudianteClase);
        await db.query(sqlDescuentosEstudiante);
    } catch (err) {
        console.error("No se pudieron inicializar tablas auxiliares:", err);
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

inicializarTablas();

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

app.put("/estudiantes/:id/fecha-ingreso", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { fecha_registro } = req.body;

    if (!fecha_registro) {
        return res.status(400).json({ mensaje: "Fecha de ingreso requerida" });
    }

    try {
        const [result] = await db.query(
            "UPDATE estudiantes SET fecha_registro = ? WHERE id = ?",
            [fecha_registro, id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ mensaje: "Estudiante no encontrado" });
        }

        res.json({ mensaje: "Fecha de ingreso actualizada correctamente" });
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

app.get("/estudiantes/:id/clases", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            `SELECT c.id, c.nombre, COALESCE(t.valor_mensual, 0) AS valor_mensual
             FROM inscripciones i
             JOIN clases c ON c.id = i.id_clase
             LEFT JOIN tarifas_clase t ON t.id_clase = c.id
             WHERE i.id_estudiante = ?
             ORDER BY c.nombre`,
            [id]
        );
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/estudiantes/:id/descuento", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            "SELECT porcentaje_dos_o_mas_clases FROM descuentos_estudiante WHERE id_estudiante = ?",
            [id]
        );
        res.json({ porcentaje: Number(result[0]?.porcentaje_dos_o_mas_clases || 0) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.put("/estudiantes/:id/descuento", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const porcentaje = Number(req.body.porcentaje || 0);

    if (Number.isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        return res.status(400).json({ mensaje: "Porcentaje inválido. Debe estar entre 0 y 100" });
    }

    try {
        await db.query(
            `INSERT INTO descuentos_estudiante (id_estudiante, porcentaje_dos_o_mas_clases)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE porcentaje_dos_o_mas_clases = VALUES(porcentaje_dos_o_mas_clases)`,
            [id, porcentaje]
        );
        res.json({ mensaje: "Descuento actualizado correctamente" });
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

app.get("/clases/tarifas", verificarToken, requireAdmin, async (req, res) => {
    try {
        const [result] = await db.query(
            `SELECT c.id, c.nombre, COALESCE(t.valor_mensual, 0) AS valor_mensual
             FROM clases c
             LEFT JOIN tarifas_clase t ON t.id_clase = c.id
             ORDER BY c.nombre`
        );
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.put("/clases/:id/tarifa", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { valor_mensual } = req.body;
    const valor = Number(valor_mensual);

    if (Number.isNaN(valor) || valor < 0) {
        return res.status(400).json({ mensaje: "Valor mensual inválido" });
    }

    try {
        await db.query(
            `INSERT INTO tarifas_clase (id_clase, valor_mensual)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE valor_mensual = VALUES(valor_mensual)`,
            [id, valor]
        );
        res.json({ mensaje: "Tarifa de clase actualizada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/mis-clases", verificarToken, async (req, res) => {
    const { rol, id_profesor } = req.user;
    const esAdmin = esRolAdministrativo(rol);

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
        ${esAdmin ? "" : "WHERE h.id_profesor = ?"}
        GROUP BY c.id
    `;

    try {
        const [result] = esAdmin
            ? await db.query(sql)
            : await db.query(sql, [id_profesor]);
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

app.get("/clases/:id_clase/profesores", verificarToken, async (req, res) => {
    const { id_clase } = req.params;
    const { rol, id_profesor } = req.user;

    try {
        if (!esRolAdministrativo(rol)) {
            const [claseAsignada] = await db.query(
                "SELECT id FROM horarios WHERE id_clase = ? AND id_profesor = ? LIMIT 1",
                [id_clase, id_profesor]
            );

            if (!claseAsignada.length) {
                return res.status(403).json({ mensaje: "No tienes permiso para ver profesores de esta clase" });
            }
        }

        const [result] = await db.query(
            `SELECT DISTINCT p.id, p.nombre
             FROM horarios h
             JOIN profesores p ON p.id = h.id_profesor
             WHERE h.id_clase = ?
             ORDER BY p.nombre`,
            [id_clase]
        );
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
        const [result] = await db.query(`
            SELECT p.id,
                   p.nombre,
                   u.email AS usuario_numerico,
                   u.password AS password_numerico
            FROM profesores p
            LEFT JOIN usuarios u ON u.id_profesor = p.id AND u.rol = 'profesor'
            ORDER BY p.nombre
        `);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/profesores", verificarToken, requireAdmin, async (req, res) => {
    const { nombre, usuario_numerico, password_numerico } = req.body;

    if (!nombre || !usuario_numerico || !password_numerico) {
        return res.status(400).json({ mensaje: "Nombre, usuario y contraseña son requeridos" });
    }

    if (!/^\d+$/.test(String(usuario_numerico)) || !/^\d+$/.test(String(password_numerico))) {
        return res.status(400).json({ mensaje: "Usuario y contraseña deben ser numéricos" });
    }

    try {
        const [credRepetida] = await db.query(
            "SELECT id FROM usuarios WHERE email = ? OR password = ? LIMIT 1",
            [String(usuario_numerico), String(password_numerico)]
        );

        if (credRepetida.length) {
            return res.status(400).json({ mensaje: "Usuario o contraseña ya están en uso" });
        }

        const [resultProfesor] = await db.query(
            "INSERT INTO profesores (nombre) VALUES (?)",
            [nombre.trim()]
        );

        await db.query(
            "INSERT INTO usuarios (email, password, rol, id_profesor) VALUES (?, ?, 'profesor', ?)",
            [String(usuario_numerico), String(password_numerico), resultProfesor.insertId]
        );

        res.json({
            mensaje: "Profesor creado correctamente",
            id_profesor: resultProfesor.insertId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.put("/profesores/:id", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre, usuario_numerico, password_numerico } = req.body;

    if (!nombre || !usuario_numerico || !password_numerico) {
        return res.status(400).json({ mensaje: "Nombre, usuario y contraseña son requeridos" });
    }

    if (!/^\d+$/.test(String(usuario_numerico)) || !/^\d+$/.test(String(password_numerico))) {
        return res.status(400).json({ mensaje: "Usuario y contraseña deben ser numéricos" });
    }

    try {
        const [credRepetida] = await db.query(
            "SELECT id FROM usuarios WHERE (email = ? OR password = ?) AND (id_profesor <> ? OR id_profesor IS NULL) LIMIT 1",
            [String(usuario_numerico), String(password_numerico), id]
        );

        if (credRepetida.length) {
            return res.status(400).json({ mensaje: "Usuario o contraseña ya están en uso" });
        }

        await db.query("UPDATE profesores SET nombre = ? WHERE id = ?", [nombre.trim(), id]);
        const [usuarioActualizado] = await db.query(
            "UPDATE usuarios SET email = ?, password = ? WHERE id_profesor = ? AND rol = 'profesor'",
            [String(usuario_numerico), String(password_numerico), id]
        );

        if (usuarioActualizado.affectedRows === 0) {
            await db.query(
                "INSERT INTO usuarios (email, password, rol, id_profesor) VALUES (?, ?, 'profesor', ?)",
                [String(usuario_numerico), String(password_numerico), id]
            );
        }

        res.json({ mensaje: "Profesor actualizado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.delete("/profesores/:id", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await db.query("DELETE FROM horarios WHERE id_profesor = ?", [id]);
        await db.query("DELETE FROM asistencia_profesores WHERE id_profesor = ?", [id]);
        await db.query("DELETE FROM usuarios WHERE id_profesor = ? AND rol = 'profesor'", [id]);
        await db.query("DELETE FROM profesores WHERE id = ?", [id]);
        res.json({ mensaje: "Profesor eliminado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/profesores/:id/asistencia", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { fecha, estado } = req.body;

    if (!fecha || !estado) {
        return res.status(400).json({ mensaje: "Fecha y estado son requeridos" });
    }

    if (!["asistio", "falta"].includes(estado)) {
        return res.status(400).json({ mensaje: "Estado inválido" });
    }

    const sql = `
        INSERT INTO asistencia_profesores (id_profesor, fecha, estado, reportado_por_admin)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            estado = VALUES(estado),
            reportado_por_admin = VALUES(reportado_por_admin)
    `;

    try {
        await db.query(sql, [id, fecha, estado, req.user.id]);
        res.json({ mensaje: "Asistencia del profesor registrada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/profesores/:id/asistencia", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            `SELECT fecha, estado
             FROM asistencia_profesores
             WHERE id_profesor = ?
             ORDER BY fecha DESC`,
            [id]
        );
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/mensualidades", verificarToken, requireAdmin, async (req, res) => {
    const { periodo, id_estudiante } = req.query;
    const filtros = [];
    const params = [];

    if (periodo) {
        filtros.push("m.periodo = ?");
        params.push(periodo);
    }

    if (id_estudiante) {
        filtros.push("m.id_estudiante = ?");
        params.push(id_estudiante);
    }

    const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
    const sql = `
        SELECT m.id,
               m.id_estudiante,
               e.nombre AS estudiante,
               e.fecha_registro,
               m.periodo,
               m.fecha_inicio,
               m.fecha_fin,
               m.clases_incluidas,
               m.valor,
               m.estado,
               m.fecha_pago
        FROM mensualidades m
        JOIN estudiantes e ON e.id = m.id_estudiante
        ${where}
        ORDER BY m.periodo DESC, e.nombre ASC
    `;

    try {
        const [result] = await db.query(sql, params);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/mensualidades/generar", verificarToken, requireAdmin, async (req, res) => {
    const now = new Date();
    const anio = parseInt(req.body.anio || now.getFullYear(), 10);
    const mes = parseInt(req.body.mes || now.getMonth() + 1, 10);
    const valor = Number(req.body.valor || 0);

    if (Number.isNaN(anio) || Number.isNaN(mes) || mes < 1 || mes > 12 || Number.isNaN(valor) || valor < 0) {
        return res.status(400).json({ mensaje: "Parámetros inválidos para generar mensualidades" });
    }

    const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
    const fecha_inicio = `${periodo}-01`;
    const fecha_fin = new Date(anio, mes, 0).toISOString().slice(0, 10);

    try {
        const [estudiantes] = await db.query(
            "SELECT id FROM estudiantes WHERE DATE(fecha_registro) <= ?",
            [fecha_fin]
        );

        if (!estudiantes.length) {
            return res.json({ mensaje: "No hay estudiantes para generar mensualidades", creadas: 0, periodo });
        }

        let creadas = 0;
        for (const est of estudiantes) {
            const [insert] = await db.query(
                `INSERT IGNORE INTO mensualidades
                 (id_estudiante, periodo, fecha_inicio, fecha_fin, clases_incluidas, valor, estado)
                 VALUES (?, ?, ?, ?, 4, ?, 'debe')`,
                [est.id, periodo, fecha_inicio, fecha_fin, valor]
            );
            creadas += insert.affectedRows;
        }

        res.json({ mensaje: "Mensualidades generadas", periodo, creadas });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/mensualidades/:id/pagar", verificarToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const fecha_pago = req.body.fecha_pago || new Date().toISOString().slice(0, 10);

    try {
        const [result] = await db.query(
            "UPDATE mensualidades SET estado = 'al_dia', fecha_pago = ? WHERE id = ?",
            [fecha_pago, id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ mensaje: "Mensualidad no encontrada" });
        }

        res.json({ mensaje: "Pago registrado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/mensualidades/historial/:id_estudiante", verificarToken, requireAdmin, async (req, res) => {
    const { id_estudiante } = req.params;

    try {
        const [result] = await db.query(
            `SELECT periodo, fecha_inicio, fecha_fin, clases_incluidas, valor, estado, fecha_pago
             FROM mensualidades
             WHERE id_estudiante = ?
             ORDER BY periodo DESC`,
            [id_estudiante]
        );
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/facturacion/resumen", verificarToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT x.id_estudiante,
                   e.nombre AS estudiante,
                   DATE(e.fecha_registro) AS fecha_ingreso,
                   x.id_clase,
                   c.nombre AS clase,
                   COALESCE(act.total_clases, 0) AS clases_activas,
                   COALESCE(t.valor_mensual, 0) AS valor_mensual,
                   COALESCE(d.porcentaje_dos_o_mas_clases, 0) AS porcentaje_descuento,
                   COALESCE(p.total_pagado, 0) AS total_pagado,
                   GREATEST(TIMESTAMPDIFF(MONTH, DATE(e.fecha_registro), CURDATE()) + 1, 1) AS meses_desde_ingreso,
                   COALESCE(GREATEST(TIMESTAMPDIFF(MONTH, DATE(e.fecha_registro), CURDATE()) + 1, 1) * COALESCE(t.valor_mensual, 0), 0) AS valor_esperado
            FROM (
                SELECT DISTINCT i.id_estudiante, i.id_clase FROM inscripciones i
                UNION
                SELECT DISTINCT p.id_estudiante, p.id_clase FROM pagos_estudiante_clase p
            ) x
            JOIN estudiantes e ON e.id = x.id_estudiante
            JOIN clases c ON c.id = x.id_clase
            LEFT JOIN tarifas_clase t ON t.id_clase = x.id_clase
            LEFT JOIN descuentos_estudiante d ON d.id_estudiante = x.id_estudiante
            LEFT JOIN (
                SELECT id_estudiante, COUNT(DISTINCT id_clase) AS total_clases
                FROM inscripciones
                GROUP BY id_estudiante
            ) act ON act.id_estudiante = x.id_estudiante
            LEFT JOIN (
                SELECT id_estudiante, id_clase, SUM(valor) AS total_pagado
                FROM pagos_estudiante_clase
                GROUP BY id_estudiante, id_clase
            ) p ON p.id_estudiante = x.id_estudiante AND p.id_clase = x.id_clase
            ORDER BY e.nombre, c.nombre
            `
        );

        const result = rows.map(row => {
            const esperado = Number(row.valor_esperado || 0);
            const pagado = Number(row.total_pagado || 0);
            const clasesActivas = Number(row.clases_activas || 0);
            const porcentajeDescuento = Number(row.porcentaje_descuento || 0);
            const descuentoAplicado = clasesActivas >= 2 ? porcentajeDescuento : 0;
            const valorDescuento = esperado * (descuentoAplicado / 100);
            const valorNeto = Math.max(0, esperado - valorDescuento);
            const diferencia = pagado - valorNeto;
            let estado = "al_dia";
            if (diferencia < 0) estado = "mora";
            if (row.valor_mensual > 0 && diferencia >= Number(row.valor_mensual)) estado = "adelantado";

            return {
                ...row,
                estado,
                valor_bruto: esperado,
                valor_descuento: valorDescuento,
                valor_neto: valorNeto,
                descuento_aplicado: descuentoAplicado,
                diferencia
            };
        });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/facturacion/calculo/:id_estudiante/:id_clase", verificarToken, requireAdmin, async (req, res) => {
    const { id_estudiante, id_clase } = req.params;
    try {
        const [[clase]] = await db.query(
            "SELECT COALESCE(valor_mensual, 0) AS valor_mensual FROM tarifas_clase WHERE id_clase = ?",
            [id_clase]
        );
        const [[conteo]] = await db.query(
            "SELECT COUNT(DISTINCT id_clase) AS total FROM inscripciones WHERE id_estudiante = ?",
            [id_estudiante]
        );
        const [[desc]] = await db.query(
            "SELECT COALESCE(porcentaje_dos_o_mas_clases, 0) AS porcentaje FROM descuentos_estudiante WHERE id_estudiante = ?",
            [id_estudiante]
        );

        const valorBruto = Number(clase?.valor_mensual || 0);
        const aplica = Number(conteo?.total || 0) >= 2;
        const porcentaje = aplica ? Number(desc?.porcentaje || 0) : 0;
        const valorDescuento = valorBruto * (porcentaje / 100);
        const valorNeto = Math.max(0, valorBruto - valorDescuento);

        res.json({
            valor_bruto: valorBruto,
            descuento_porcentaje: porcentaje,
            valor_descuento: valorDescuento,
            valor_neto: valorNeto
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.post("/facturacion/pagos", verificarToken, requireAdmin, async (req, res) => {
    const { id_estudiante, id_clase, valor, fecha_pago, periodo_referencia, observacion } = req.body;
    const monto = Number(valor);

    if (!id_estudiante || !id_clase || Number.isNaN(monto) || monto <= 0) {
        return res.status(400).json({ mensaje: "Datos de pago inválidos" });
    }

    try {
        await db.query(
            `INSERT INTO pagos_estudiante_clase
             (id_estudiante, id_clase, fecha_pago, valor, periodo_referencia, observacion, registrado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                id_estudiante,
                id_clase,
                fecha_pago || new Date().toISOString().slice(0, 10),
                monto,
                periodo_referencia || null,
                observacion || null,
                req.user.id
            ]
        );
        res.json({ mensaje: "Pago registrado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.get("/facturacion/historial/:id_estudiante/:id_clase", verificarToken, requireAdmin, async (req, res) => {
    const { id_estudiante, id_clase } = req.params;

    try {
        const [result] = await db.query(
            `SELECT fecha_pago, valor, periodo_referencia, observacion
             FROM pagos_estudiante_clase
             WHERE id_estudiante = ? AND id_clase = ?
             ORDER BY fecha_pago DESC, id DESC`,
            [id_estudiante, id_clase]
        );
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
    const { rol } = req.user;
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
        if (!esRolAdministrativo(rol)) {
            const [claseAsignada] = await db.query(
                "SELECT id FROM horarios WHERE id_clase = ? AND id_profesor = ? LIMIT 1",
                [id_clase, id_profesor]
            );

            if (!claseAsignada.length) {
                return res.status(403).json({ mensaje: "No tienes permiso para reportar asistencia en esta clase" });
            }
        }

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

app.get("/usuarios", verificarToken, requireSuperAdmin, async (req, res) => {
    try {
        const [result] = await db.query(
            `SELECT u.id, u.email, u.rol, u.id_profesor, p.nombre AS profesor_nombre
             FROM usuarios u
             LEFT JOIN profesores p ON p.id = u.id_profesor
             ORDER BY u.id DESC`
        );
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.put("/usuarios/:id/rol", verificarToken, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { rol } = req.body;
    const rolesPermitidos = ["admin", "auxiliar_administrativo", "profesor"];

    if (!rolesPermitidos.includes(rol)) {
        return res.status(400).json({ mensaje: "Rol inválido" });
    }

    try {
        const [actual] = await db.query("SELECT id, rol FROM usuarios WHERE id = ?", [id]);
        if (!actual.length) {
            return res.status(404).json({ mensaje: "Usuario no encontrado" });
        }

        if (Number(id) === req.user.id && rol !== "admin") {
            return res.status(400).json({ mensaje: "No puedes quitarte el rol admin a ti mismo" });
        }

        await db.query("UPDATE usuarios SET rol = ? WHERE id = ?", [rol, id]);
        res.json({ mensaje: "Rol actualizado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
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

app.get("/clases/:id_clase/asistencias", verificarToken, async (req, res) => {
    const { id_clase } = req.params;
    const { rol, id_profesor } = req.user;

    const sql = `
        SELECT e.nombre,
               a.fecha,
               a.estado,
               CASE
                   WHEN a.id_profesor IS NULL THEN 'Administrador'
                   ELSE CONCAT('Profesor: ', COALESCE(p.nombre, 'Sin nombre'))
               END AS reportado_por
        FROM asistencia a
        JOIN estudiantes e ON e.id = a.id_estudiante
        LEFT JOIN profesores p ON p.id = a.id_profesor
        WHERE a.id_clase = ?
        ORDER BY a.fecha DESC, e.nombre ASC
    `;

    try {
        if (!esRolAdministrativo(rol)) {
            const [claseAsignada] = await db.query(
                "SELECT id FROM horarios WHERE id_clase = ? AND id_profesor = ? LIMIT 1",
                [id_clase, id_profesor]
            );

            if (!claseAsignada.length) {
                return res.status(403).json({ mensaje: "No tienes permiso para ver asistencias de esta clase" });
            }
        }

        const [result] = await db.query(sql, [id_clase]);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensaje: "Error en BD" });
    }
});

app.listen(process.env.PORT || 3002, () => {
    console.log("Servidor en puerto", process.env.PORT || 3002);
});