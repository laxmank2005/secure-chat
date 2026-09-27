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
import { BsEmojiSmile, BsX, BsPaperclip, BsLightningFill, BsPlus } from "react-icons/bs";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const SendInput = ({ requestTransfer }) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const attachmentMenuRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target)) {
        setShowAttachmentMenu(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target) && emojiButtonRef.current && !emojiButtonRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
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
    
    setShowEmojiPicker(false);

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
        <div ref={emojiPickerRef} className="absolute bottom-[calc(100%+10px)] right-2 sm:right-6 z-50 shadow-2xl">
          <Suspense fallback={
            <div className="w-[300px] h-[350px] flex items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-stone-800 shadow-xl">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          }>
            <EmojiPicker onEmojiClick={onEmojiClick} theme="auto" />
          </Suspense>
        </div>
      )}

      {/* Sleek Compact Attachment Preview */}
      {selectedFile && (
        <div className="absolute bottom-full left-4 sm:left-6 mb-2 flex items-center gap-3 bg-white dark:bg-[#1a1a1a] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-stone-800 rounded-2xl p-2 pr-3 z-40 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-black/20 flex-shrink-0 border border-black/5 dark:border-white/5">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-violet-500">
                <BsPaperclip className="text-xl" />
              </div>
            )}
          </div>
          
          <div className="flex flex-col justify-center min-w-[120px] max-w-[200px]">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">{selectedFile.name}</p>
            <p className="text-[11px] text-gray-500 dark:text-stone-400 mt-0.5 font-medium">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>

          <button 
            type="button" 
            onClick={cancelFile} 
            className="p-1.5 ml-1 hover:bg-gray-100 dark:hover:bg-stone-800 rounded-full text-gray-400 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
          >
            <BsX className="text-xl" />
          </button>
          
          {uploadProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent rounded-b-2xl overflow-hidden">
              <div className="bg-violet-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={onSubmitHandler}
        className="px-2 sm:px-4 py-3 sm:py-4 pb-5 sm:pb-4 bg-white dark:bg-[#111] border-t border-gray-100 dark:border-stone-800 transition-colors flex flex-col relative w-full box-border"
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
                <button 
                  type="button" 
                  onClick={cancelAction} 
                  className="p-1.5 rounded-full text-gray-500 dark:text-stone-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-stone-700 bg-black/5 dark:bg-white/5 transition-colors"
                >
                    <BsX className="text-xl font-bold" />
                </button>
            </div>
        )}

        <div className={`flex items-center gap-1 transition-all ${(replyingTo || editingMessage) ? "pt-2" : ""}`}>
          
          {/* Attachment Menu Wrapper */}
          <div className="relative flex-shrink-0" ref={attachmentMenuRef}>
            <button
              type="button"
              onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
              className="flex-shrink-0 p-1 px-1.5 text-gray-500 hover:text-gray-800 dark:text-stone-400 dark:hover:text-white transition-colors"
            >
              <BsPlus className={`text-[28px] transition-transform duration-200 ${showAttachmentMenu ? 'rotate-45' : 'rotate-0'}`} />
            </button>
            
            {showAttachmentMenu && (
              <div className="absolute bottom-full mb-3 left-0 w-52 bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-stone-800 py-2 animate-in slide-in-from-bottom-2 fade-in duration-200 z-50">
                <button
                  type="button"
                  onClick={() => { fileInputRef.current?.click(); setShowAttachmentMenu(false); }}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <BsPaperclip className="text-[17px] text-violet-500" />
                  Upload Files
                </button>
                <button
                  type="button"
                  onClick={() => { p2pFileInputRef.current?.click(); setShowAttachmentMenu(false); }}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <BsLightningFill className="text-[17px] text-amber-500" />
                  Fast File Sharing
                </button>
              </div>
            )}
          </div>

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

          {/* Input Pill */}
          <div className="flex-1 flex items-center gap-2 bg-gray-100 dark:bg-[#1a1a1a] border border-transparent focus-within:border-violet-300 dark:focus-within:border-stone-600 rounded-full px-4 py-2 transition-all min-w-0">
            <input
              ref={inputRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              type="text"
              placeholder="Type Message"
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px] py-1 text-gray-800 dark:text-stone-100 placeholder-gray-400 dark:placeholder-stone-500"
              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              autoComplete="off"
            />
            
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex-shrink-0 text-gray-400 dark:text-stone-500 hover:text-gray-600 dark:hover:text-stone-300 transition-colors ml-1"
            >
              <BsEmojiSmile className="text-xl" />
            </button>
          </div>

          {/* Send/Save button */}
          <button
            type="submit"
            disabled={(!message.trim() && !selectedFile) || isSending}
            className={`flex-shrink-0 p-2.5 ml-1 mr-3 sm:mr-6 rounded-full transition-all disabled:opacity-40 disabled:scale-100 active:scale-95 ${message.trim() || selectedFile ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20' : 'bg-transparent text-gray-400 dark:text-stone-500'}`}
          >
            {editingMessage ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`${message.trim() || selectedFile ? 'translate-x-[1px] translate-y-[-1px]' : ''}`}>
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