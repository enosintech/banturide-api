import dotenv from "dotenv";
import { admin } from "../config/firebase.js";

dotenv.config();

export const verifyUser = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        return res.status(401).json({ success: false, message: "Unauthorized", info: "No token provided" });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        return next();
    } catch (error) {
        console.error("Error verifying token:", error);
        return res.status(401).json({ success: false, message: "Unauthorized", info: "Invalid token" });
    }
};