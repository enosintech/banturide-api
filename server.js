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
import deliveryRoutes from "./src/routes/deliveryRoutes.js"

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

        const data = JSON.parse(message);

        if (data.type === 'sendMessage') {
            sendMessageToRecipient(data.senderId, data.recipientId, data.content);
        }

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

function sendMessageToRecipient(senderId, recipientId, content) {
    wss.clients.forEach((client) => {
        if (client.userId === recipientId && client.readyState === WebSocket.OPEN) {
            const messageData = {
                type: 'message',
                senderId: senderId,
                content: content,
                timestamp: new Date(),
            };
            client.send(JSON.stringify(messageData));
            console.log(`Message from ${senderId} to ${recipientId} sent.`);
        }
    });
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
app.use("/delivery", deliveryRoutes)

server.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`)
});

export { sendDataToClient, wss};