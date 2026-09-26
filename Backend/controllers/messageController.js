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

        // Check if receiverId is actually a Group ID
        let gotConversation = await Conversation.findById(receiverId);
        const isGroupMessage = gotConversation && gotConversation.isGroup;

        if (!isGroupMessage) {
            gotConversation = await Conversation.findOne({
                participants: { $all: [senderId, receiverId] },
                isGroup: false
            });

            if (!gotConversation) {
                gotConversation = await Conversation.create({
                    participants: [senderId, receiverId],
                    isGroup: false
                });
            }
        } else {
            // For groups, verify the sender is a participant
            if (!gotConversation.participants.includes(senderId)) {
                return res.status(403).json({ success: false, message: "You are not a participant in this group." });
            }
        }

        // For groups, we consider it "delivered" immediately if at least one other participant is online (or just "sent")
        const newMessage = await Messages.create({
            senderId,
            receiverId, // For groups, this is the groupId
            message,
            messageType,
            isEncrypted,
            replyTo: replyTo || null,
            status: "sent" // Group read receipts require more complex tracking, default to sent
        });

        if (newMessage) {
            gotConversation.messages.push(newMessage._id);
            await gotConversation.save();
        }

        const senderUser = await User.findById(senderId).select("fullName email profilePhoto gender publicKey").lean();
        const messageObj = newMessage.toObject ? newMessage.toObject() : newMessage;
        messageObj.senderObj = senderUser;

        // Emit to receiver(s) via socket
        if (isGroupMessage) {
            gotConversation.participants.forEach(participantId => {
                if (participantId.toString() !== senderId.toString()) {
                    const socketIds = getReceiverSocketId(participantId.toString());
                    if (socketIds && socketIds.length > 0) {
                        socketIds.forEach(socketId => {
                            io.to(socketId).emit("newMessage", messageObj);
                        });
                    }
                }
            });
        } else {
            const receiverSocketIds = getReceiverSocketId(receiverId);
            if (receiverSocketIds && receiverSocketIds.length > 0) {
                receiverSocketIds.forEach(socketId => {
                    io.to(socketId).emit("newMessage", messageObj);
                });
                
                // Update status to delivered for 1-on-1 if online
                await Messages.findByIdAndUpdate(newMessage._id, { status: "delivered" });
                newMessage.status = "delivered";
            }
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

        // Check if senderId is actually a group
        const conv = await Conversation.findById(senderId).select("isGroup participants");

        if (conv && conv.isGroup) {
            // Group read receipt logic (simplified: marks read for the whole group)
            const result = await Messages.updateMany(
                {
                    receiverId: senderId, // The group ID
                    senderId: { $ne: receiverId }, // Sent by others
                    readBy: { $ne: receiverId } // Only update messages this user hasn't read yet
                },
                { $addToSet: { readBy: receiverId } }
            );

            if (result.modifiedCount > 0) {
                conv.participants.forEach(participantId => {
                    if (participantId.toString() !== receiverId) {
                        const socketIds = getReceiverSocketId(participantId.toString());
                        if (socketIds && socketIds.length > 0) {
                            socketIds.forEach(socketId => {
                                io.to(socketId).emit("messagesRead", {
                                    byUserId: receiverId,
                                    fromUserId: senderId, // Group ID
                                    isGroup: true
                                });
                            });
                        }
                    }
                });
            }
            return res.status(200).json({ success: true, updated: result.modifiedCount });
        }

        // 1-on-1 logic
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

        let filter;
        const conv = await Conversation.findById(receiverId).select("isGroup");
        
        if (conv && conv.isGroup) {
            filter = { receiverId: receiverId };
        } else {
            filter = {
                $or: [
                    { senderId: senderId, receiverId: receiverId },
                    { senderId: receiverId, receiverId: senderId }
                ]
            };
        }

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

        // Check if group message
        const receiverId = msg.receiverId.toString();
        const conv = await Conversation.findById(receiverId);

        const emitData = { 
            messageId: msg._id, 
            message: msg.message, 
            isEdited: true, 
            isEncrypted: msg.isEncrypted,
            senderId: msg.senderId.toString()
        };

        if (conv && conv.isGroup) {
            conv.participants.forEach(participantId => {
                if (participantId.toString() !== userId) {
                    const socketIds = getReceiverSocketId(participantId.toString());
                    if (socketIds && socketIds.length > 0) {
                        socketIds.forEach(socketId => io.to(socketId).emit("messageEdited", emitData));
                    }
                }
            });
        } else {
            const receiverSocketIds = getReceiverSocketId(receiverId);
            if (receiverSocketIds && receiverSocketIds.length > 0) {
                receiverSocketIds.forEach(socketId => io.to(socketId).emit("messageEdited", emitData));
            }
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

        const receiverId = msg.receiverId.toString();
        const conv = await Conversation.findById(receiverId);
        
        const emitData = { 
            messageId: msg._id,
            senderId: msg.senderId.toString()
        };

        if (conv && conv.isGroup) {
            conv.participants.forEach(participantId => {
                if (participantId.toString() !== userId) {
                    const socketIds = getReceiverSocketId(participantId.toString());
                    if (socketIds && socketIds.length > 0) {
                        socketIds.forEach(socketId => io.to(socketId).emit("messageDeleted", emitData));
                    }
                }
            });
        } else {
            const receiverSocketIds = getReceiverSocketId(receiverId);
            if (receiverSocketIds && receiverSocketIds.length > 0) {
                receiverSocketIds.forEach(socketId => io.to(socketId).emit("messageDeleted", emitData));
            }
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

        const receiverId = msg.receiverId.toString();
        const conv = await Conversation.findById(receiverId);
        
        const emitData = { messageId: msg._id, reactions: msg.reactions };

        if (conv && conv.isGroup) {
            conv.participants.forEach(participantId => {
                if (participantId.toString() !== userId) {
                    const socketIds = getReceiverSocketId(participantId.toString());
                    if (socketIds && socketIds.length > 0) {
                        socketIds.forEach(socketId => io.to(socketId).emit("messageReactionUpdated", emitData));
                    }
                }
            });
        } else {
            const otherParticipantId = msg.receiverId.toString() === userId ? msg.senderId.toString() : msg.receiverId.toString();
            const receiverSocketIds = getReceiverSocketId(otherParticipantId);
            if (receiverSocketIds && receiverSocketIds.length > 0) {
                receiverSocketIds.forEach(socketId => io.to(socketId).emit("messageReactionUpdated", emitData));
            }
        }

        return res.status(200).json({ success: true, reactions: msg.reactions, msg });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Create a new Group Chat
export const createGroup = async (req, res) => {
    try {
        const creatorId = req.id;
        const { groupName, participants, encryptedGroupKeys, groupProfilePhoto } = req.body;

        if (!groupName || typeof groupName !== "string" || groupName.trim().length === 0) {
            return res.status(400).json({ success: false, message: "A valid group name is required." });
        }
        if (groupName.length > 100) {
            return res.status(400).json({ success: false, message: "Group name cannot exceed 100 characters." });
        }
        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ success: false, message: "Participants array is required." });
        }
        if (participants.length > 50) {
            return res.status(400).json({ success: false, message: "A group cannot have more than 50 members." });
        }
        
        // Add creator to participants if not already included
        const uniqueParticipants = [...new Set([...participants.map(String), creatorId.toString()])];
        
        if (uniqueParticipants.length < 2) {
            return res.status(400).json({ success: false, message: "A group requires at least 2 members (including you)." });
        }
        
        if (!encryptedGroupKeys || encryptedGroupKeys.length !== uniqueParticipants.length) {
            return res.status(400).json({ success: false, message: "Encrypted E2EE group keys are required for all participants." });
        }

        const newGroup = await Conversation.create({
            isGroup: true,
            groupName,
            groupProfilePhoto: groupProfilePhoto || "",
            groupAdmins: [creatorId],
            participants: uniqueParticipants,
            encryptedGroupKeys
        });

        const populatedGroup = await Conversation.findById(newGroup._id).populate("participants", "fullName email profilePhoto");

        // Broadcast to all online participants that they were added to a new group
        uniqueParticipants.forEach(participantId => {
            const socketIds = getReceiverSocketId(participantId.toString());
            if (socketIds && socketIds.length > 0) {
                socketIds.forEach(socketId => {
                    io.to(socketId).emit("newGroupCreated", populatedGroup);
                });
            }
        });

        return res.status(201).json({ success: true, group: populatedGroup });
    } catch (error) {
        console.error("Create group error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Update Group Settings (Name, Photo)
export const updateGroup = async (req, res) => {
    try {
        const userId = req.id;
        const groupId = req.params.groupId;
        const { groupName, groupProfilePhoto } = req.body;

        const group = await Conversation.findById(groupId);
        if (!group || !group.isGroup) return res.status(404).json({ success: false, message: "Group not found" });

        if (!group.groupAdmins.includes(userId)) {
            return res.status(403).json({ success: false, message: "Only admins can update group settings." });
        }

        if (groupName) {
            if (groupName.length > 100) return res.status(400).json({ success: false, message: "Name too long" });
            group.groupName = groupName;
        }
        if (groupProfilePhoto !== undefined) group.groupProfilePhoto = groupProfilePhoto;

        await group.save();

        const populatedGroup = await Conversation.findById(groupId).populate("participants", "fullName email profilePhoto");

        // Broadcast group update
        group.participants.forEach(participantId => {
            const socketIds = getReceiverSocketId(participantId.toString());
            if (socketIds && socketIds.length > 0) {
                socketIds.forEach(socketId => io.to(socketId).emit("groupSettingsUpdated", { groupId, groupName: group.groupName, groupProfilePhoto: group.groupProfilePhoto }));
            }
        });

        return res.status(200).json({ success: true, group: populatedGroup });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Add Group Member
export const addGroupMember = async (req, res) => {
    try {
        const userId = req.id;
        const groupId = req.params.groupId;
        const { newParticipants, encryptedGroupKeys } = req.body; // Arrays

        const group = await Conversation.findById(groupId);
        if (!group || !group.isGroup) return res.status(404).json({ success: false, message: "Group not found" });

        // Verify admin
        if (!group.groupAdmins.includes(userId)) {
            return res.status(403).json({ success: false, message: "Only admins can add members." });
        }

        // Add participants
        newParticipants.forEach(pId => {
            if (!group.participants.includes(pId)) {
                group.participants.push(pId);
            }
        });

        // Add keys
        encryptedGroupKeys.forEach(keyObj => {
            const existing = group.encryptedGroupKeys.find(k => k.userId.toString() === keyObj.userId.toString());
            if (!existing) group.encryptedGroupKeys.push(keyObj);
        });

        await group.save();

        const populatedGroup = await Conversation.findById(groupId).populate("participants", "fullName email profilePhoto");
        
        group.participants.forEach(participantId => {
            const socketIds = getReceiverSocketId(participantId.toString());
            if (socketIds && socketIds.length > 0) {
                socketIds.forEach(socketId => io.to(socketId).emit("groupMembersUpdated", populatedGroup));
            }
        });

        return res.status(200).json({ success: true, group: populatedGroup });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Remove Group Member
export const removeGroupMember = async (req, res) => {
    try {
        const userId = req.id;
        const groupId = req.params.groupId;
        const { memberId, newEncryptedGroupKeys } = req.body;

        const group = await Conversation.findById(groupId);
        if (!group || !group.isGroup) return res.status(404).json({ success: false, message: "Group not found" });

        // Verify admin or self-leaving
        if (!group.groupAdmins.includes(userId) && userId !== memberId) {
            return res.status(403).json({ success: false, message: "Only admins can remove members." });
        }

        const allOldParticipants = [...group.participants]; // To broadcast to the removed member too

        // Remove participant
        group.participants = group.participants.filter(p => p.toString() !== memberId);
        group.groupAdmins = group.groupAdmins.filter(a => a.toString() !== memberId);

        // Forward Secrecy Key Rotation: If an admin provided new keys, replace them all
        if (newEncryptedGroupKeys && Array.isArray(newEncryptedGroupKeys) && group.groupAdmins.includes(userId)) {
            group.encryptedGroupKeys = newEncryptedGroupKeys;
        } else {
            // Otherwise just strip the removed member's key
            group.encryptedGroupKeys = group.encryptedGroupKeys.filter(k => k.userId.toString() !== memberId);
        }

        // If the last admin left, randomly assign a new admin from remaining participants
        if (group.groupAdmins.length === 0 && group.participants.length > 0) {
            group.groupAdmins.push(group.participants[0]);
        }

        await group.save();

        const populatedGroup = await Conversation.findById(groupId).populate("participants", "fullName email profilePhoto");
        
        allOldParticipants.forEach(participantId => {
            const socketIds = getReceiverSocketId(participantId.toString());
            if (socketIds && socketIds.length > 0) {
                // If they were removed, we can just send groupMembersUpdated and the frontend can handle it
                socketIds.forEach(socketId => io.to(socketId).emit("groupMembersUpdated", populatedGroup));
            }
        });

        return res.status(200).json({ success: true, group: populatedGroup });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Get Detailed Group Info
export const getGroupInfo = async (req, res) => {
    try {
        const userId = req.id;
        const groupId = req.params.groupId;

        const group = await Conversation.findById(groupId).populate("participants", "fullName email profilePhoto publicKey");
        if (!group || !group.isGroup) return res.status(404).json({ success: false, message: "Group not found" });

        // Ensure user is participant
        const isParticipant = group.participants.some(p => p._id.toString() === userId);
        if (!isParticipant) {
            return res.status(403).json({ success: false, message: "Not a participant" });
        }

        const myKeyObj = group.encryptedGroupKeys.find(k => k.userId.toString() === userId);
        const encryptorId = myKeyObj?.encryptedBy || group.groupAdmins[0];

        let encryptorPublicKey = null;
        if (encryptorId) {
            const encryptorUser = await User.findById(encryptorId).select("publicKey");
            if (encryptorUser) encryptorPublicKey = encryptorUser.publicKey;
        }

        return res.status(200).json({ 
            success: true, 
            group: {
                _id: group._id,
                isGroup: group.isGroup,
                groupName: group.groupName,
                groupProfilePhoto: group.groupProfilePhoto,
                participants: group.participants,
                groupAdmins: group.groupAdmins,
                encryptedGroupKeys: group.encryptedGroupKeys,
                encryptorPublicKey: encryptorPublicKey
            } 
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Update Group Admin Roles (Promote/Demote)
export const updateGroupAdmin = async (req, res) => {
    try {
        const userId = req.id;
        const groupId = req.params.groupId;
        const { memberId, action } = req.body; // action: 'promote' | 'demote'

        const group = await Conversation.findById(groupId);
        if (!group || !group.isGroup) return res.status(404).json({ success: false, message: "Group not found" });

        if (!group.groupAdmins.includes(userId)) {
            return res.status(403).json({ success: false, message: "Only admins can change roles." });
        }
        if (!group.participants.includes(memberId)) {
            return res.status(400).json({ success: false, message: "User is not a member of the group." });
        }
        if (memberId === userId) {
            return res.status(400).json({ success: false, message: "You cannot change your own admin role this way." });
        }

        if (action === 'promote') {
            if (!group.groupAdmins.includes(memberId)) {
                group.groupAdmins.push(memberId);
            }
        } else if (action === 'demote') {
            group.groupAdmins = group.groupAdmins.filter(a => a.toString() !== memberId);
            // Ensure there is at least one admin
            if (group.groupAdmins.length === 0) {
                return res.status(400).json({ success: false, message: "A group must have at least one admin." });
            }
        } else {
            return res.status(400).json({ success: false, message: "Invalid action." });
        }

        await group.save();

        const populatedGroup = await Conversation.findById(groupId).populate("participants", "fullName email profilePhoto");

        // Broadcast to all participants that roles have updated
        group.participants.forEach(participantId => {
            const socketIds = getReceiverSocketId(participantId.toString());
            if (socketIds && socketIds.length > 0) {
                socketIds.forEach(socketId => io.to(socketId).emit("groupMembersUpdated", populatedGroup));
            }
        });

        return res.status(200).json({ success: true, group: populatedGroup });
    } catch (error) {
        console.error("Update Admin error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};