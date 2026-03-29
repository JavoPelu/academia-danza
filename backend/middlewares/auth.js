const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
    const token = req.headers["authorization"];

    if (!token) {
        return res.status(403).json({ mensaje: "Sin token" });
    }

    jwt.verify(token, "secreto", (err, decoded) => {
        if (err) {
            return res.status(401).json({ mensaje: "Token inválido" });
        }

        req.user = decoded;
        next();
    });
};

module.exports = verificarToken;