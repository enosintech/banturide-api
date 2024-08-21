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
    }
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
        connectedUsers.set(userId, { socketId: socket.id, userType});
        console.log(`User Registered: ${userId}, Type: ${userType}`)
        console.log(connectedUsers)
        socket.emit('connectionAcknowledged', {
            status: 'success',
            message: `Connection to the server was successful! ${userId} ${userType}`,
        });
    })

    socket.on('sendMessage', (messageData) => {
        const { recipientId, text, senderId } = messageData;

        const recipient = connectedUsers.get(recipientId);
        if (recipient) {
            io.to(recipient.socketId).emit('message', { text, senderId, recipientId });
            console.log(`Message sent from ${senderId} to ${recipientId}: ${text}`);
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

export { sendDataToClient }

// export { sendDataToClient, wss};

// const wss = new WebSocketServer({ server });

// function sendDataToClient(client, data) {
//     if(client.readyState === WebSocket.OPEN){
//         client.send(JSON.stringify(data))
//     }
// }

// function sendMessageToRecipient(senderId, recipientId, content) {
    //     wss.clients.forEach((client) => {
        //         if (client.userId === recipientId && client.readyState === WebSocket.OPEN) {
            //             const messageData = {
                //                 type: 'message',
                //                 senderId: senderId,
//                 content: content,
//                 timestamp: new Date(),
//             };
//             client.send(JSON.stringify(messageData));
//             console.log(`Message from ${senderId} to ${recipientId} sent.`);
//         }
//     });
// }



// wss.on("connection", (ws, request) => {
    
//     const query = url.parse(request.url, true).query;
//     const userId = query.userId;

//     if(userId){
//         ws.userId = userId;
//         console.log(`Client Connected with client ID: ${userId}`);
//     } else {
//         ws.close();
//         console.log(`Client connnected rejected: user ID missing`)
//     }

//     ws.on('message', (message) => {

//         const data = JSON.parse(message);

//         if (data.type === 'sendMessage') {
//             sendMessageToRecipient(data.senderId, data.recipientId, data.content);
//         }

//     });

//     ws.on('close', () => {
//         console.log(`Client ${ws.userId} disconnected`);
//     });

//     ws.on('error', (error) => {
//         console.error('WebSocket error:', error);
//     });
// }) 