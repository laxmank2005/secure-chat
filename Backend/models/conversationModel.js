
import mongoose from "mongoose";


const ConversationModel = new mongoose.Schema({
    isGroup: {
        type: Boolean,
        default: false,
    },
    groupName: {
        type: String,
        trim: true,
    },
    groupProfilePhoto: {
        type: String,
        default: "",
    },
    groupAdmins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Messages"
    }],
    // E2EE: The shared AES group key, encrypted individually for each participant's RSA public key
    encryptedGroupKeys: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        encryptedKey: { type: String, required: true },
        encryptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } // The admin who encrypted this key
    }]
}, { timestamps: true });

// Index for performance
ConversationModel.index({ participants: 1, updatedAt: -1 });

export const Conversation = mongoose.model("Conversation",ConversationModel);