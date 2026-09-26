import { Messages } from "../models/messageModel.js";
import { Conversation } from "../models/conversationModel.js";
import { User } from "../models/userModel.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

export const sendMessage = async (req, res) => {
    try {
        const senderId = req.id;
        const receiverId = req.params.id;
        const { message, messageType = "text", isEncrypted = false, replyTo } = req.body;

        // Prevent self-messaging
        if (senderId === receiverId) {
            return res.status(400).json({ success: false, message: "You cannot send a message to yourself." });
        }
        if (!message) {
            return res.status(400).json({ message: "Message is required" });
        }
        if (message.length > 5000) {
            return res.status(400).json({ message: "Message exceeds maximum length of 5000 characters." });
        }

        let gotConversation = await Conversation.findOne({
            participants: { $all: [senderId, receiverId] }
        });

        if (!gotConversation) {
            gotConversation = await Conversation.create({
                participants: [senderId, receiverId]
            });
        }

        // If receiver is currently online, mark as delivered immediately
        const receiverSocketIds = getReceiverSocketId(receiverId);
        const isReceiverOnline = receiverSocketIds && receiverSocketIds.length > 0;

        const newMessage = await Messages.create({
            senderId,
            receiverId,
            message,
            messageType,
            isEncrypted,
            replyTo: replyTo || null,
            status: isReceiverOnline ? "delivered" : "sent"
        });

        if (newMessage) {
            gotConversation.messages.push(newMessage._id);
        }

        await gotConversation.save();

        // Emit to receiver via socket
        if (isReceiverOnline) {
            const senderUser = await User.findById(senderId).select("fullName email profilePhoto gender publicKey").lean();
            const messageObj = newMessage.toObject ? newMessage.toObject() : newMessage;
            messageObj.senderObj = senderUser;

            receiverSocketIds.forEach(socketId => {
                io.to(socketId).emit("newMessage", messageObj);
            });
        }

        // Also notify sender about the delivery status update
        const senderSocketIds = getReceiverSocketId(senderId);
        if (senderSocketIds && senderSocketIds.length > 0) {
            senderSocketIds.forEach(socketId => {
                io.to(socketId).emit("messageStatusUpdate", {
                    messageId: newMessage._id,
                    status: newMessage.status
                });
            });
        }

        return res.status(200).json({ newMessage });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Mark all messages from a sender as "read"
export const markAsRead = async (req, res) => {
    try {
        const receiverId = req.id; // The person who is reading (logged-in user)
        const senderId = req.params.senderId;

        // Update all "sent"/"delivered" messages from this sender to "read"
        const result = await Messages.updateMany(
            {
                senderId,
                receiverId,
                status: { $in: ["sent", "delivered"] }
            },
            { $set: { status: "read" } }
        );

        // Notify the sender (via socket) that their messages were read
        if (result.modifiedCount > 0) {
            const senderSocketIds = getReceiverSocketId(senderId);
            if (senderSocketIds && senderSocketIds.length > 0) {
                senderSocketIds.forEach(socketId => {
                    io.to(socketId).emit("messagesRead", {
                        byUserId: receiverId,
                        fromUserId: senderId
                    });
                });
            }
        }

        return res.status(200).json({ success: true, updated: result.modifiedCount });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Get messages (Paginated)
export const getMessage = async (req, res) => {
    try {
        const receiverId = req.params.id;
        const senderId = req.id;
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // Query Messages collection concurrently with lean() for fast non-blocking reads
        const filter = {
            $or: [
                { senderId: senderId, receiverId: receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        };

        const [messages, totalMessages] = await Promise.all([
            Messages.find(filter)
                .sort({ createdAt: -1 }) // Covered sort using compound index
                .skip(skip)
                .limit(limit)
                .lean(),
            Messages.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            messages: messages.reverse(), // Reverse to send chronologically
            totalPages: Math.ceil(totalMessages / limit),
            currentPage: page
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

// Edit a message
export const editMessage = async (req, res) => {
    try {
        const userId = req.id;
        const messageId = req.params.msgId;
        const { message, isEncrypted } = req.body;

        const msg = await Messages.findById(messageId);
        if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

        if (msg.senderId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Unauthorized to edit this message" });
        }

        msg.message = message;
        if (isEncrypted !== undefined) msg.isEncrypted = isEncrypted;
        msg.isEdited = true;
        await msg.save();

        // Emit socket to receiver
        const receiverId = msg.receiverId.toString();
        const receiverSocketIds = getReceiverSocketId(receiverId);
        if (receiverSocketIds && receiverSocketIds.length > 0) {
            receiverSocketIds.forEach(socketId => {
                io.to(socketId).emit("messageEdited", { 
                    messageId: msg._id, 
                    message: msg.message, 
                    isEdited: true, 
                    isEncrypted: msg.isEncrypted,
                    senderId: msg.senderId.toString()
                });
            });
        }
        return res.status(200).json({ success: true, message: "Message edited", msg });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Delete a message
export const deleteMessage = async (req, res) => {
    try {
        const userId = req.id;
        const messageId = req.params.msgId;

        const msg = await Messages.findById(messageId);
        if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

        if (msg.senderId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this message" });
        }

        msg.isDeleted = true;
        msg.message = "[deleted]"; // Can't use "" — Mongoose required validator rejects empty strings
        await msg.save();

        // Emit socket to receiver
        const receiverId = msg.receiverId.toString();
        const receiverSocketIds = getReceiverSocketId(receiverId);
        if (receiverSocketIds && receiverSocketIds.length > 0) {
            receiverSocketIds.forEach(socketId => {
                io.to(socketId).emit("messageDeleted", { 
                    messageId: msg._id,
                    senderId: msg.senderId.toString()
                });
            });
        }
        return res.status(200).json({ success: true, message: "Message deleted", msg });
    } catch (error) {
        console.error("Delete message error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

// Toggle a reaction on a message
export const reactMessage = async (req, res) => {
    try {
        const userId = req.id;
        const messageId = req.params.msgId;
        const { emoji } = req.body;

        if (!emoji) return res.status(400).json({ success: false, message: "Emoji is required" });

        const msg = await Messages.findById(messageId);
        if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

        const existingReactionIndex = msg.reactions.findIndex(r => r.userId.toString() === userId && r.emoji === emoji);

        if (existingReactionIndex !== -1) {
            msg.reactions.splice(existingReactionIndex, 1);
        } else {
            msg.reactions.push({ emoji, userId });
        }

        await msg.save();

        // Broadcast to the other participant
        const otherParticipantId = msg.receiverId.toString() === userId ? msg.senderId.toString() : msg.receiverId.toString();
        const receiverSocketIds = getReceiverSocketId(otherParticipantId);
        
        if (receiverSocketIds && receiverSocketIds.length > 0) {
            receiverSocketIds.forEach(socketId => {
                io.to(socketId).emit("messageReactionUpdated", { messageId: msg._id, reactions: msg.reactions });
            });
        }

        return res.status(200).json({ success: true, reactions: msg.reactions, msg });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};