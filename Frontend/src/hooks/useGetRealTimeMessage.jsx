import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addMessage, updateMessageStatus, markAllMessagesRead, updateMessage, updateMessageReactions } from "../redux/messageSlice";
import { updateUserList, clearUnread, addTypingUser, removeTypingUser } from "../redux/userSlice";
import { 
  importPublicKey, 
  deriveSharedSecret, 
  decryptMessage,
  decryptGroupKey
} from "../utils/crypto";
import { getPrivateKey } from "../utils/keyStore";
import { API_ENDPOINTS } from "../config/api";

const useGetRealTimeMessage = () => {
    const { socket } = useSelector(store => store.socket);
    const { selectedUser, otherUsers, authUser } = useSelector(store => store.user);
    const dispatch = useDispatch();

    // Use refs so the async handler always has the latest values without stale closures
    const selectedUserRef = useRef(selectedUser);
    const otherUsersRef = useRef(otherUsers);
    const authUserRef = useRef(authUser);
    selectedUserRef.current = selectedUser;
    otherUsersRef.current = otherUsers;
    authUserRef.current = authUser;

    useEffect(() => {
        // Helper: load private key from IndexedDB once per handler invocation
        const loadMyPrivateKey = async () => {
            const userId = authUserRef.current?._id?.toString();
            if (!userId) return null;
            return await getPrivateKey(userId);
        };

        const handleNewMessage = async (newMessage) => {
            // Normalize IDs to strings immediately — prevents ObjectId vs string issues
            const senderIdStr = newMessage.senderId?.toString();
            const receiverIdStr = newMessage.receiverId?.toString();

            // Check if the sender is the user currently open in chat
            const isCurrentlySelected = selectedUserRef.current?._id?.toString() === senderIdStr;
            
            // --- E2EE Decryption for real-time messages ---
            let decryptedText = newMessage.message;
            if (newMessage.isEncrypted) {
                try {
                    const myPrivateKey = await loadMyPrivateKey();
                    
                    // Check if receiverId matches a known group chat
                    const group = (otherUsersRef.current || []).find(u => u.isGroup && u._id?.toString() === receiverIdStr);

                    if (group && group.encryptedGroupKeys && myPrivateKey) {
                        const myKeyObj = group.encryptedGroupKeys.find(k => k.userId.toString() === authUserRef.current?._id?.toString());
                        if (myKeyObj && group.encryptorPublicKey) {
                            const encryptorPublicKey = await importPublicKey(group.encryptorPublicKey);
                            const sharedSecret = await deriveSharedSecret(myPrivateKey, encryptorPublicKey);
                            const groupKey = await decryptGroupKey(myKeyObj.encryptedKey, sharedSecret);
                            decryptedText = await decryptMessage(newMessage.message, groupKey);
                        }
                    } else {
                        // Regular 1-on-1 decryption
                        const sender = (otherUsersRef.current || []).find(
                            u => u._id?.toString() === senderIdStr
                        ) || newMessage.senderObj;

                        if (sender?.publicKey && myPrivateKey) {
                            const theirPublicKey = await importPublicKey(sender.publicKey);
                            const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
                            decryptedText = await decryptMessage(newMessage.message, sharedSecret);
                        }
                    }
                } catch (e) {
                    console.error("Failed to decrypt real-time message:", e);
                    decryptedText = "[Encrypted message - could not decrypt]";
                }
            }

            const finalMessage = {
              ...newMessage,
              message: decryptedText,
              senderId: senderIdStr,
              receiverId: receiverIdStr,
            };

            // Add to message list only if this conversation is open
            if (isCurrentlySelected) {
                dispatch(addMessage(finalMessage));
                
                // Real-time Read Receipt: user is actively looking at the chat
                try {
                    const authUser = JSON.parse(localStorage.getItem("authUser"));
                    fetch(API_ENDPOINTS.MESSAGE.MARK_READ(senderIdStr), {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${authUser?.token}` }
                    });
                    dispatch(clearUnread(senderIdStr));
                } catch (err) {
                    console.error("Failed to emit real-time read receipt");
                }
            }
            
            // Always update sidebar: bump to top, show last message, unread badge
            dispatch(updateUserList({
                userId: senderIdStr,
                isUnread: !isCurrentlySelected,
                lastMessage: decryptedText,
                lastMessageTime: newMessage.createdAt,
                userObj: newMessage.senderObj,
            }));
        };

        // Handle delivery/read status updates for sent messages
        const handleMessageStatusUpdate = ({ messageId, status }) => {
            dispatch(updateMessageStatus({ messageId, status }));
        };

        const handleMessagesRead = ({ byUserId }) => {
            dispatch(markAllMessagesRead({ fromUserId: byUserId }));
        };

        const handleMessageEdited = async (data) => {
            const { messageId, isEdited, isEncrypted, senderId } = data;
            let decryptedText = data.message;
            
            if (isEncrypted) {
                try {
                    const sender = (otherUsersRef.current || []).find(
                        u => u._id?.toString() === senderId?.toString()
                    );
                    
                    const myPrivateKey = await loadMyPrivateKey();

                    if (sender?.publicKey && myPrivateKey) {
                        const theirPublicKey = await importPublicKey(sender.publicKey);
                        const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
                        decryptedText = await decryptMessage(data.message, sharedSecret);
                    }
                } catch (e) {
                    console.error("Failed to decrypt edited message:", e);
                }
            }
            
            dispatch(updateMessage({ messageId, message: decryptedText, isEdited }));
        };

        const handleMessageDeleted = ({ messageId }) => {
            dispatch(updateMessage({ messageId, isDeleted: true, message: "" }));
        };

        const handleMessageReactionUpdated = ({ messageId, reactions }) => {
            dispatch(updateMessageReactions({ messageId, reactions }));
        };

        const handleGlobalTyping = ({ senderId }) => {
            dispatch(addTypingUser(senderId));
        };

        const handleGlobalStopTyping = ({ senderId }) => {
            dispatch(removeTypingUser(senderId));
        };

        socket?.on("newMessage", handleNewMessage);
        socket?.on("messageStatusUpdate", handleMessageStatusUpdate);
        socket?.on("messagesRead", handleMessagesRead);
        socket?.on("messageEdited", handleMessageEdited);
        socket?.on("messageDeleted", handleMessageDeleted);
        socket?.on("messageReactionUpdated", handleMessageReactionUpdated);
        socket?.on("typing", handleGlobalTyping);
        socket?.on("stopTyping", handleGlobalStopTyping);

        return () => {
            socket?.off("newMessage", handleNewMessage);
            socket?.off("messageStatusUpdate", handleMessageStatusUpdate);
            socket?.off("messagesRead", handleMessagesRead);
            socket?.off("messageEdited", handleMessageEdited);
            socket?.off("messageDeleted", handleMessageDeleted);
            socket?.off("messageReactionUpdated", handleMessageReactionUpdated);
            socket?.off("typing", handleGlobalTyping);
            socket?.off("stopTyping", handleGlobalStopTyping);
        };
    }, [socket, dispatch]); // Only re-register when socket changes — refs handle the rest
};

export default useGetRealTimeMessage;