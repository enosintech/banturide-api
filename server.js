import WebSocket, { WebSocketServer } from "ws";
import express from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import url from "url";

import authRoutes from "./src/routes/authRoutes.js";
import bookingRoutes from "./src/routes/bookingRoutes.js";
import locationRoutes from "./src/routes/locationRoutes.js";
import paymentsRoutes from "./src/routes/paymentsRoutes.js";
import profileRoutes from "./src/routes/profileRoutes.js";
import favoritesRoutes from './src/routes/favoritesRoutes.js';
import reviewRoutes from "./src/routes/reviewRoutes.js";

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, request) => {
    
    const query = url.parse(request.url, true).query;
    const userId = query.userId;

    if(userId){
        ws.userId = userId;
        console.log(`Client Connected with client ID: ${userId}`);
    } else {
        ws.close();
        console.log(`Client connnected rejected: user ID missing`)
    }

    ws.on('message', (message) => {
        console.log(`Received message from client ${ws.userId}:`, message.toString('utf-8'));
    });

    ws.on('close', () => {
        console.log(`Client ${ws.userId} disconnected`);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
}) 

function sendDataToClient(client, data) {
    if(client.readyState === WebSocket.OPEN){
        client.send(JSON.stringify(data))
    }
}

app.use(express.json());
app.use(cors());

app.use("/auth", authRoutes);
app.use("/booking", bookingRoutes);
app.use("/location", locationRoutes);
app.use("/payment", paymentsRoutes);
app.use("/profile", profileRoutes);
app.use("/favorites", favoritesRoutes);
app.use("/reviews", reviewRoutes);

server.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`)
});

export { sendDataToClient, wss};