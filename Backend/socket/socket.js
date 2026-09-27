import {Server} from 'socket.io';
import http from 'http';
import express from "express";
import jwt from "jsonwebtoken";


const app=express();

const server =http.createServer(app);

const frontendUrl = process.env.FRONTEND_URL
  ? (process.env.FRONTEND_URL.endsWith('/') ? process.env.FRONTEND_URL.slice(0, -1) : process.env.FRONTEND_URL)
  : 'http://localhost:5173';

const isAllowedSocketOrigin = (origin) => {
  if (!origin) return true;
  return (
    origin === frontendUrl ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:4173" ||
    origin.endsWith(".vercel.app")
  );
};

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedSocketOrigin(origin)) {
                return callback(null, true);
            }
            callback(new Error(`Socket CORS blocked for origin: ${origin}`));
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
});

export const getReceiverSocketId = (receiverId) => {
    return userSocketMap[receiverId]; // Now returns an array of socket IDs
}

const userSocketMap = {}; // { userId: [socketId1, socketId2, ...] }



// Socket authentication middleware
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        next();
    } catch (err) {
        next(new Error("Authentication error: Invalid token"));
    }
});

io.on('connection', (socket) => {
    console.log('user connected', socket.id);

    const userId = socket.userId; // Retrieved securely from JWT middleware
    
    if (userId) {
        if (!userSocketMap[userId]) {
            userSocketMap[userId] = [];
        }
        userSocketMap[userId].push(socket.id);
    }

    io.emit('getOnlineUsers', Object.keys(userSocketMap));

    // Typing indicator events
    socket.on('typing', ({ receiverId }) => {
        const receiverSockets = userSocketMap[receiverId];
        if (receiverSockets && receiverSockets.length > 0) {
            receiverSockets.forEach(socketId => {
                io.to(socketId).emit('typing', { senderId: userId });
            });
        }
    });

    socket.on('stopTyping', ({ receiverId }) => {
        const receiverSockets = userSocketMap[receiverId];
        if (receiverSockets && receiverSockets.length > 0) {
            receiverSockets.forEach(socketId => {
                io.to(socketId).emit('stopTyping', { senderId: userId });
            });
        }
    });

    socket.on('typingGroup', ({ participants, groupId }) => {
        if (!participants || !Array.isArray(participants)) return;
        participants.forEach(participantId => {
            if (participantId.toString() !== userId.toString()) {
                const receiverSockets = userSocketMap[participantId.toString()];
                if (receiverSockets && receiverSockets.length > 0) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('typing', { senderId: groupId, isGroup: true, actualUser: userId });
                    });
                }
            }
        });
    });

    socket.on('stopTypingGroup', ({ participants, groupId }) => {
        if (!participants || !Array.isArray(participants)) return;
        participants.forEach(participantId => {
            if (participantId.toString() !== userId.toString()) {
                const receiverSockets = userSocketMap[participantId.toString()];
                if (receiverSockets && receiverSockets.length > 0) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('stopTyping', { senderId: groupId, isGroup: true, actualUser: userId });
                    });
                }
            }
        });
    });

    // --- Video Calling Events ---
    socket.on('callUser', ({ receiverId, callerData, roomId }) => {
        const receiverSockets = userSocketMap[receiverId];
        if (receiverSockets && receiverSockets.length > 0) {
            receiverSockets.forEach(socketId => {
                io.to(socketId).emit('incomingCall', { callerData, roomId });
            });
        }
    });

    socket.on('callGroup', ({ groupId, groupName, participants, callerData, roomId }) => {
        if (!participants || !Array.isArray(participants)) return;
        participants.forEach(participant => {
            const participantId = typeof participant === 'object' ? participant._id : participant;
            if (participantId && participantId.toString() !== userId.toString()) {
                const receiverSockets = userSocketMap[participantId.toString()];
                if (receiverSockets && receiverSockets.length > 0) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('incomingCall', { callerData, roomId, isGroup: true, groupName });
                    });
                }
            }
        });
    });

    socket.on('rejectCall', ({ callerId }) => {
        const callerSockets = userSocketMap[callerId];
        if (callerSockets && callerSockets.length > 0) {
            callerSockets.forEach(socketId => {
                io.to(socketId).emit('callRejected');
            });
        }
    });

    // --- P2P WebRTC Direct File Transfer Events ---
    socket.on('p2pTransferRequest', ({ receiverId, fileInfo }) => {
        const receiverSockets = userSocketMap[receiverId];
        if (receiverSockets && receiverSockets.length > 0) {
            receiverSockets.forEach(socketId => {
                io.to(socketId).emit('incomingP2PTransfer', { senderId: userId, fileInfo });
            });
        }
    });

    socket.on('p2pTransferResponse', ({ senderId, accepted }) => {
        const senderSockets = userSocketMap[senderId];
        if (senderSockets && senderSockets.length > 0) {
            senderSockets.forEach(socketId => {
                // Ensure receiverId is the authenticated user, not spoofable
                io.to(socketId).emit('p2pTransferResponse', { accepted, receiverId: userId });
            });
        }
    });

    socket.on('p2pSignal', ({ targetId, signal }) => {
        const targetSockets = userSocketMap[targetId];
        if (targetSockets && targetSockets.length > 0) {
            targetSockets.forEach(socketId => {
                io.to(socketId).emit('p2pSignal', { senderId: userId, signal });
            });
        }
    });

    socket.on('p2pTransferCanceled', ({ targetId }) => {
        const targetSockets = userSocketMap[targetId];
        if (targetSockets && targetSockets.length > 0) {
            targetSockets.forEach(socketId => {
                io.to(socketId).emit('p2pTransferCanceled');
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
        if (userId && userSocketMap[userId]) {
            // Remove just this specific socket ID from the user's array
            userSocketMap[userId] = userSocketMap[userId].filter(id => id !== socket.id);
            
            // If they have no more connected sockets (closed all tabs), remove them from the map entirely
            if (userSocketMap[userId].length === 0) {
                delete userSocketMap[userId];
            }
        }
        io.emit('getOnlineUsers', Object.keys(userSocketMap));
    });
});
  
export {app,io,server}



