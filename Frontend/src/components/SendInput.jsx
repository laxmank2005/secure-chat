import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { setMessages, addMessage, setReplyingTo, setEditingMessage, updateMessage } from "../redux/messageSlice";
import { updateUserList } from "../redux/userSlice";
import { toast } from "react-hot-toast";
import { API_ENDPOINTS } from "../config/api";
import { 
  importPublicKey, 
  deriveSharedSecret, 
  encryptMessage,
  decryptGroupKey
} from "../utils/crypto";
import { getPrivateKey } from "../utils/keyStore";
import { BsEmojiSmile, BsX, BsPaperclip, BsLightningFill } from "react-icons/bs";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const SendInput = ({ requestTransfer }) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const inputRef = useRef();
  const fileInputRef = useRef(null);
  const p2pFileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const dispatch = useDispatch();
  
  const { selectedUser, authUser } = useSelector(store => store.user);
  const { messages: messagesFromStore, replyingTo, editingMessage } = useSelector(store => store.message);
  
  const messagesRef = useRef(messagesFromStore);
  messagesRef.current = messagesFromStore; // always up-to-date in async callbacks
  
  const { socket } = useSelector(store => store.socket);

  // When editing, populate input
  useEffect(() => {
    if (editingMessage) {
      setMessage(editingMessage.message);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  const onEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const cancelAction = () => {
    if (editingMessage) {
        dispatch(setEditingMessage(null));
        setMessage("");
    }
    if (replyingTo) {
        dispatch(setReplyingTo(null));
    }
  };

  const cancelFile = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    setSelectedFile(null);
    setFilePreview(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      toast.error("File is too large. Max 50MB.");
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const onSubmitHandler = async (e) => {
    if (e) e.preventDefault();
    const text = message.trim();
    if ((!text && !selectedFile) || isSending) return;

    if (selectedUser?._id === authUser?._id) {
      toast.error("You cannot send a message to yourself.");
      return;
    }

    setMessage("");
    setIsSending(true);

    if (editingMessage) {
        // Edit mode
        try {
            let messageToSend = text;
            let isMessageEncrypted = false;
            if (selectedUser?.isGroup) {
                const myKeyObj = selectedUser.encryptedGroupKeys?.find(k => k.userId.toString() === authUser._id.toString());
                if (!myKeyObj || !selectedUser.creatorPublicKey) throw new Error("Missing group encryption keys.");
                const myPrivateKey = await getPrivateKey(authUser._id.toString());
                if (!myPrivateKey) throw new Error("Could not unlock private key.");

                const creatorPublicKey = await importPublicKey(selectedUser.creatorPublicKey);
                const sharedSecret = await deriveSharedSecret(myPrivateKey, creatorPublicKey);
                const groupKey = await decryptGroupKey(myKeyObj.encryptedKey, sharedSecret);

                messageToSend = await encryptMessage(text, groupKey);
                isMessageEncrypted = true;
            } else if (selectedUser?.publicKey) {
                const myPrivateKey = authUser?._id ? await getPrivateKey(authUser._id.toString()) : null;
                if (myPrivateKey) {
                    const theirPublicKey = await importPublicKey(selectedUser.publicKey);
                    const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
                    messageToSend = await encryptMessage(text, sharedSecret);
                    isMessageEncrypted = true;
                }
            }

            axios.defaults.withCredentials = true;
            await axios.put(
                API_ENDPOINTS.MESSAGE.EDIT(editingMessage._id),
                { message: messageToSend, isEncrypted: isMessageEncrypted },
                { headers: { Authorization: `Bearer ${authUser?.token}` } }
            );

            // Optimistic update locally
            dispatch(updateMessage({ messageId: editingMessage._id, message: text, isEdited: true }));
            dispatch(setEditingMessage(null));
        } catch (err) {
            toast.error("Failed to edit message");
            setMessage(text); // restore
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
        return;
    }

    if (selectedFile) {
        setIsSending(true);
        try {
            abortControllerRef.current = new AbortController();
            
            // 1. Encrypt file locally using dynamic import to avoid circular dependencies
            const { encryptFile } = await import("../utils/crypto");
            const { encryptedBlob, fileKeyBase64, ivBase64 } = await encryptFile(selectedFile);
            
            // 2. Upload to server
            const formData = new FormData();
            formData.append("file", encryptedBlob, selectedFile.name);
            
            const uploadRes = await axios.post(API_ENDPOINTS.MESSAGE.UPLOAD, formData, {
                headers: { Authorization: `Bearer ${authUser?.token}` },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                },
                signal: abortControllerRef.current.signal
            });
            
            const { fileUrl, fileName, mimeType, size } = uploadRes.data;
            
            // 3. Create JSON payload
            const payload = JSON.stringify({
                text: message.trim(),
                fileUrl,
                fileName: selectedFile.name,
                mimeType: selectedFile.type, // Use original mimeType, not the generic upload stream one
                size,
                fileKeyBase64,
                ivBase64
            });

            const finalMessageType = selectedFile.type.startsWith("image/") ? "image" : "file";
            let messageToSend = payload;
            let isMessageEncrypted = false;

            if (selectedUser?.isGroup) {
                const myKeyObj = selectedUser.encryptedGroupKeys?.find(k => k.userId.toString() === authUser._id.toString());
                if (!myKeyObj || !selectedUser.encryptorPublicKey) throw new Error("Missing group encryption keys.");
                const myPrivateKey = await getPrivateKey(authUser._id.toString());
                if (!myPrivateKey) throw new Error("Could not unlock private key.");

                const encryptorPublicKey = await importPublicKey(selectedUser.encryptorPublicKey);
                const sharedSecret = await deriveSharedSecret(myPrivateKey, encryptorPublicKey);
                const groupKey = await decryptGroupKey(myKeyObj.encryptedKey, sharedSecret);

                messageToSend = await encryptMessage(payload, groupKey);
                isMessageEncrypted = true;
            } else if (selectedUser?.publicKey) {
                const myPrivateKey = authUser?._id ? await getPrivateKey(authUser._id.toString()) : null;
                if (myPrivateKey) {
                    const theirPublicKey = await importPublicKey(selectedUser.publicKey);
                    const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
                    messageToSend = await encryptMessage(payload, sharedSecret);
                    isMessageEncrypted = true;
                }
            }

            const res = await axios.post(
                API_ENDPOINTS.MESSAGE.SEND(selectedUser?._id),
                { message: messageToSend, isEncrypted: isMessageEncrypted, replyTo: replyingTo?._id, messageType: finalMessageType },
                {
                    headers: { Authorization: `Bearer ${authUser?.token}` },
                    withCredentials: true,
                }
            );

            // Optimistically add to UI
            const realMessage = res.data.newMessage;
            realMessage.message = payload; // local plaintext payload
            realMessage.senderId = authUser._id?.toString();
            
            dispatch(setMessages([...(messagesRef.current || []), realMessage]));
            dispatch(updateUserList({
                userId: selectedUser._id,
                isUnread: false,
                lastMessage: mimeType.startsWith("image/") ? "📷 Photo" : "📄 File",
                lastMessageTime: realMessage.createdAt || new Date().toISOString(),
                userObj: selectedUser,
            }));
            
            cancelFile();
            setMessage("");
            dispatch(setReplyingTo(null));
        } catch (error) {
            if (axios.isCancel(error)) {
                toast.success("Upload cancelled");
            } else {
                toast.error("Failed to upload and send file.");
                console.error(error);
            }
        } finally {
            setIsSending(false);
            setUploadProgress(0);
            abortControllerRef.current = null;
        }
        return;
    }

    // Send/Reply mode (Text only)
    const tempMessage = {
      _id: `temp-${Date.now()}`,
      message: text,
      senderId: authUser._id?.toString(),
      receiverId: selectedUser._id?.toString(),
      createdAt: new Date().toISOString(),
      replyTo: replyingTo?._id || null,
    };
    dispatch(setMessages([...(messagesRef.current || []), tempMessage]));
    
    const currentReplyToId = replyingTo?._id;
    dispatch(setReplyingTo(null));

    try {
      let messageToSend = text;
      let isMessageEncrypted = false;

      if (selectedUser?.isGroup) {
          try {
              // Group Message E2EE
              const myKeyObj = selectedUser.encryptedGroupKeys?.find(k => k.userId.toString() === authUser._id.toString());
              if (!myKeyObj || !selectedUser.encryptorPublicKey) {
                  throw new Error("Missing group encryption keys.");
              }
              const myPrivateKey = await getPrivateKey(authUser._id.toString());
              if (!myPrivateKey) throw new Error("Could not unlock private key.");

              const encryptorPublicKey = await importPublicKey(selectedUser.encryptorPublicKey);
              const sharedSecret = await deriveSharedSecret(myPrivateKey, encryptorPublicKey);
              const groupKey = await decryptGroupKey(myKeyObj.encryptedKey, sharedSecret);

              messageToSend = await encryptMessage(text, groupKey);
              isMessageEncrypted = true;
          } catch (cryptoErr) {
              console.error("Group Encryption failed:", cryptoErr);
              toast.error("Encryption failed. Message not sent.");
              dispatch(setMessages(messagesRef.current.filter(m => m._id !== tempMessage._id) || []));
              setIsSending(false);
              return;
          }
      } else if (selectedUser?.publicKey) {
        try {
          const myPrivateKey = authUser?._id ? await getPrivateKey(authUser._id.toString()) : null;
          if (myPrivateKey) {
            const theirPublicKey = await importPublicKey(selectedUser.publicKey);
            const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
            messageToSend = await encryptMessage(text, sharedSecret);
            isMessageEncrypted = true;
          }
        } catch (cryptoErr) {
          console.error("Encryption failed:", cryptoErr);
          toast.error("Encryption failed. Message not sent.");
          dispatch(setMessages(messagesRef.current.filter(m => m._id !== tempMessage._id) || []));
          setIsSending(false);
          return;
        }
      }

      const res = await axios.post(
        API_ENDPOINTS.MESSAGE.SEND(selectedUser?._id),
        { message: messageToSend, isEncrypted: isMessageEncrypted, replyTo: currentReplyToId },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authUser?.token}`,
          },
          withCredentials: true,
        }
      );
      
      const realMessage = res.data.newMessage;
      realMessage.message = text;
      realMessage.senderId = realMessage.senderId?.toString?.() ?? realMessage.senderId;

      const currentMsgs = messagesRef.current || [];
      dispatch(setMessages(currentMsgs.filter(m => m._id !== tempMessage._id).concat(realMessage)));

      dispatch(updateUserList({
        userId: selectedUser._id,
        isUnread: false,
        lastMessage: text,
        lastMessageTime: realMessage.createdAt || new Date().toISOString(),
        userObj: selectedUser,
      }));
    } catch {
      dispatch(setMessages(messagesRef.current.filter(m => m._id !== tempMessage._id) || []));
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      onSubmitHandler(e);
    }
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
    if (!socket || !selectedUser) return;

    if (selectedUser.isGroup) {
      socket.emit("typingGroup", { participants: selectedUser.participants, groupId: selectedUser._id });
    } else {
      socket.emit("typing", { receiverId: selectedUser._id });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (selectedUser.isGroup) {
        socket.emit("stopTypingGroup", { participants: selectedUser.participants, groupId: selectedUser._id });
      } else {
        socket.emit("stopTyping", { receiverId: selectedUser._id });
      }
    }, 2000);
  };

  const handleP2PFileChange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (requestTransfer) {
          requestTransfer(selectedUser._id, file);
      }
      e.target.value = null; // Reset
  };

  return (
    <div className="relative">
      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-[calc(100%+10px)] left-4 z-50 shadow-2xl">
          <Suspense fallback={
            <div className="w-[300px] h-[350px] flex items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-stone-800 shadow-xl">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          }>
            <EmojiPicker onEmojiClick={onEmojiClick} theme="auto" />
          </Suspense>
        </div>
      )}

      {/* Premium Compact Attachment Preview Modal */}
      {selectedFile && (
        <div className="absolute bottom-[calc(100%+16px)] left-4 right-4 sm:right-auto sm:left-4 sm:w-[320px] bg-white/95 dark:bg-[#121212]/95 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-visible z-50 animate-in slide-in-from-bottom-3 fade-in duration-300">
          
          {/* Downward pointing triangle/tail matching the paperclip icon position */}
          <div className="absolute -bottom-2 left-10 w-4 h-4 bg-white/95 dark:bg-[#121212]/95 border-b border-r border-gray-200/50 dark:border-white/10 rotate-45 shadow-sm z-[-1]"></div>

          {/* Close Button (Floating Overlay) */}
          <button 
            type="button" 
            onClick={cancelFile} 
            className="absolute top-4 right-4 z-10 p-1.5 bg-black/40 hover:bg-black/60 text-white rounded-full transition backdrop-blur-md shadow-sm"
          >
            <BsX className="text-xl" />
          </button>

          {/* Content / Preview */}
          <div className="relative h-[240px] w-full p-2">
            {filePreview ? (
              <div className="w-full h-full bg-gray-100 dark:bg-black/40 rounded-2xl overflow-hidden relative">
                 <img src={filePreview} alt="Preview" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-full h-full bg-gray-100/80 dark:bg-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-stone-500">
                <div className="p-4 bg-white dark:bg-black/20 rounded-full shadow-sm">
                   <BsPaperclip className="text-3xl" />
                </div>
                <div className="text-center px-4">
                   <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[250px]">{selectedFile.name}</p>
                   <p className="text-[10px] mt-1.5 uppercase tracking-widest font-bold text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.name.split('.').pop()}</p>
                </div>
              </div>
            )}
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-100 dark:bg-stone-800 rounded-b-3xl overflow-hidden">
              <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={onSubmitHandler}
        className="px-4 sm:px-5 py-4 pb-6 sm:pb-4 bg-white dark:bg-[#111] border-t border-gray-100 dark:border-stone-800 transition-colors flex flex-col relative"
      >

        {/* Banner for Replying / Editing */}
        {(replyingTo || editingMessage) && (
            <div className="flex items-center justify-between bg-gray-100 dark:bg-stone-800 p-2 px-3 rounded-t-xl mb-1 text-sm border-l-4 border-violet-500">
                <div className="flex flex-col overflow-hidden max-w-[90%]">
                    <span className="font-semibold text-violet-600 dark:text-violet-400 text-xs uppercase tracking-wider mb-0.5">
                        {editingMessage ? "Editing Message" : `Replying to ${replyingTo.senderId.toString() === authUser?._id?.toString() ? "yourself" : selectedUser?.fullName}`}
                    </span>
                    <span className="truncate text-gray-600 dark:text-stone-400">
                        {(() => {
                            const msg = editingMessage || replyingTo;
                            if (msg.messageType === 'image') return "📷 Photo";
                            if (msg.messageType === 'file') return "📄 File";
                            if (msg.messageType === 'call') return "📞 Call";
                            return msg.message;
                        })()}
                    </span>
                </div>
                <button type="button" onClick={cancelAction} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-stone-700 transition">
                    <BsX className="text-xl" />
                </button>
            </div>
        )}

        <div
          className={`flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-stone-900 border border-gray-200 dark:border-stone-700 focus-within:border-violet-400 dark:focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 dark:focus-within:ring-violet-900/30 transition-all ${
              (replyingTo || editingMessage) ? "rounded-b-xl rounded-t-none" : "rounded-2xl"
          }`}
        >
          {/* Emoji toggle icon */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="flex-shrink-0 text-gray-400 dark:text-stone-500 hover:text-violet-500 transition-colors"
          >
            <BsEmojiSmile className="text-xl" />
          </button>

          {/* File Attachment toggle icon */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 text-gray-400 dark:text-stone-500 hover:text-violet-500 transition-colors"
          >
            <BsPaperclip className="text-xl" />
          </button>

          {/* P2P Direct File Transfer icon */}
          <button
            type="button"
            onClick={() => p2pFileInputRef.current?.click()}
            className="flex-shrink-0 text-blue-500 hover:text-blue-600 transition-colors bg-blue-100/50 dark:bg-blue-900/20 p-1.5 rounded-lg ml-1 mr-1"
            title="P2P Direct Transfer (No Size Limit)"
          >
            <BsLightningFill className="text-lg" />
          </button>
          <input
            type="file"
            ref={p2pFileInputRef}
            onChange={handleP2PFileChange}
            className="hidden"
          />

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            className="hidden" 
          />

          {/* Input */}
          <input
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            type="text"
            placeholder={`Chat with ${selectedUser?.fullName?.split(" ")[0] || "..."}` }
            className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-stone-100 placeholder-gray-400 dark:placeholder-stone-600"
            style={{ fontFamily: "Inter, system-ui, sans-serif" }}
            autoComplete="off"
          />

          {/* Send/Save button */}
          <button
            type="submit"
            disabled={(!message.trim() && !selectedFile) || isSending}
            className="flex-shrink-0 p-2 rounded-xl transition-all disabled:opacity-30"
            style={{ color: (message.trim() || selectedFile) ? "#7C3AED" : "#9ca3af" }}
          >
            {editingMessage ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SendInput;