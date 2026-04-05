const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

    if (!token) {
        return res.status(403).json({ mensaje: "Sin token" });
    }

    const secreto = process.env.JWT_SECRET || "secreto";

    jwt.verify(token, secreto, (err, decoded) => {
        if (err) {
            return res.status(401).json({ mensaje: "Token inválido" });
        }

        req.user = decoded;
        next();
    });
};

module.exports = verificarToken;