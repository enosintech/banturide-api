import { Server } from "socket.io";
import express from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";

import authRoutes from "./src/routes/authRoutes.js";
import bookingRoutes from "./src/routes/bookingRoutes.js";
import locationRoutes from "./src/routes/locationRoutes.js";
import paymentsRoutes from "./src/routes/paymentsRoutes.js";
import profileRoutes from "./src/routes/profileRoutes.js";
import favoritesRoutes from './src/routes/favoritesRoutes.js';
import reviewRoutes from "./src/routes/reviewRoutes.js";
import deliveryRoutes from "./src/routes/deliveryRoutes.js";

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = express();

app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://banturide-api.onrender.com",
    },
    connectionStateRecovery: {}
})

const connectedUsers = new Map();

const sendDataToClient = (userId, event, data) => {
    const user = connectedUsers.get(userId);
    if(user) {
        io.to(user.socketId).emit(event, data);
        console.log(`Sent data to ${userId}:`, data);
    } else {
        console.log(`User with ID ${userId} is not connected`);
    }
}

io.on("connection", (socket) => {
    console.log("Client Connected Successfully:", socket.id)

    socket.on("register", ({ userId, userType}) => {
        try {
            if (!userId || !userType) {
                throw new Error('Missing userId or userType');
            }

            connectedUsers.set(userId, { socketId: socket.id, userType });
            console.log(`User Registered: ${userId}, Type: ${userType}`);
            console.log(connectedUsers);

            socket.emit('connectionAcknowledged', {
                status: 'success',
                message: `Connection to the server was successful! User ID: ${userId}, Type: ${userType}`,
            });
        } catch (error) {
            console.error('Error handling register event:', error);
            socket.emit('connectionAcknowledged', {
                status: 'error',
                message: `Failed to register user: ${error.message}`,
            });
        }
    })

    socket.on('sendMessage', (messageData) => {
        const { recipientId, text, senderId, time, id } = messageData;

        const recipient = connectedUsers.get(recipientId);
        if (recipient) {
            io.to(recipient.socketId).emit('message', { text, senderId, recipientId, time, id });
            console.log(`Message sent from ${senderId} to ${recipientId}: ${text} at ${time}.`);
        } else {
            console.log(`Recipient ${recipientId} is not connected`);
        }
    });

    socket.on("disconnect", () => {
        connectedUsers.forEach((value, key) => {
            if(value.socketId === socket.id) {
                connectedUsers.delete(key);
                console.log(`User Disconnected: ${key}`)
            }
        });
    })
})

app.use("/auth", authRoutes);
app.use("/booking", bookingRoutes);
app.use("/delivery", deliveryRoutes);
app.use("/location", locationRoutes);
app.use("/payment", paymentsRoutes);
app.use("/profile", profileRoutes);
app.use("/favorites", favoritesRoutes);
app.use("/reviews", reviewRoutes);

server.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`)
});

export { sendDataToClient };