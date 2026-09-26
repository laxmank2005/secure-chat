import mongoose from "mongoose";

const messageModel = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    message: {
        type: String,
        required: true
    },
    messageType: {
        type: String,
        enum: ["text", "call"],
        default: "text"
    },
    isEncrypted: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent"
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Messages",
        default: null
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    reactions: [
        {
            emoji: { type: String, required: true },
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
        }
    ]
}, {
    timestamps: true
});

// Indexes for performance
messageModel.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageModel.index({ receiverId: 1, senderId: 1, createdAt: -1 });
messageModel.index({ createdAt: -1 });

export const Messages = mongoose.model("Messages", messageModel);