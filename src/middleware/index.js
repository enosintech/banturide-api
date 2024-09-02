import dotenv from "dotenv";

import { admin } from "../config/firebase.js";

dotenv.config();

const refreshIdToken = async ( refreshToken ) => {
    const payload = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    }

    try {
        const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${process.env.FIREBASE_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type" : "application/json"
            },
            body: JSON.stringify(payload)
        })
        .catch((err) => {
            console.log(err)
        })

        if(!response.ok) {
            console.log("Failed to refresh token")
        }

        const data = await response.json();

        return data.id_token;
    } catch (error) {
        console.log(error)
    }
}

export const verifyUser = async ( req, res, next ) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if(!idToken){
        return res.status(401).json({ success: false, message: "Unauthorized", info: "No token provided"})
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken)
        req.user = decodedToken;
        next();
    } catch (error) {
        if(error.code === "auth/id-token-expired") {
            const refreshToken = req.headers['x-refresh-token'];
            if(!refreshToken){
                return res.status(401).json({ success: false, message: "Unauthorized", info: "No token provided"})
            }

            try {
                const newIdToken = await refreshIdToken(refreshToken);
                req.headers.authorization = `Bearer ${newIdToken}`;
                const decodedToken = await admin.auth().verifyIdToken(newIdToken);
                req.user = decodedToken;
                next();
            } catch (refreshError) {
                return res.status(401).json({ success: false, message: "Unauthorized", info: "Refresh error in token expired block"})
            }
        } else {
            return res.status(401).json({ success: false, message: "Unauthorized"})
        }
    }
}