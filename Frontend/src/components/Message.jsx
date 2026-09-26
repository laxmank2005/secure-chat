import React from "react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setReplyingTo, setEditingMessage, updateMessageReactions, updateMessage } from "../redux/messageSlice";
import axios from "axios";
import { API_ENDPOINTS } from "../config/api";
import { BsReplyFill, BsPencilSquare, BsTrashFill, BsEmojiSmile, BsCheck2All, BsCheck2 } from "react-icons/bs";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const Message = ({ message }) => {
  const scroll = useRef();
  const containerRef = useRef();
  const dispatch = useDispatch();
  
  const { authUser, selectedUser } = useSelector(store => store.user);
  const { messages } = useSelector(store => store.message);
  
  const [showActions, setShowActions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // In a 1-on-1 chat: if the sender is NOT the selected user, it must be MY message.
  const isMyMessage = message?.senderId?.toString() !== selectedUser?._id?.toString();

  // Find replied-to message if any
  const repliedMessage = message?.replyTo 
    ? messages?.find(m => m._id === message.replyTo) 
    : null;

  useEffect(() => {
    scroll.current?.scrollIntoView({ behavior: "smooth" });
  }, [message]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowActions(false);
      }
    };
    if (showActions) {
      document.addEventListener("mousedown", handleClickOutside);
      // Also handle touch events for mobile
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showActions]);

  const timeStr = message?.createdAt
    ? new Date(message.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  const handleReply = () => dispatch(setReplyingTo(message));
  const handleEdit = () => dispatch(setEditingMessage(message));
  
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      const authUserObj = JSON.parse(localStorage.getItem("authUser"));
      axios.defaults.withCredentials = true;
      await axios.delete(API_ENDPOINTS.MESSAGE.DELETE(message._id), {
        headers: { "Authorization": `Bearer ${authUserObj?.token}` }
      });
      // Optimistic update
      dispatch(updateMessage({ messageId: message._id, isDeleted: true, message: "" }));
    } catch (error) {
      console.error("Failed to delete message", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReact = async (emoji) => {
    try {
      const authUserObj = JSON.parse(localStorage.getItem("authUser"));
      axios.defaults.withCredentials = true;
      const res = await axios.post(API_ENDPOINTS.MESSAGE.REACT(message._id), { emoji }, {
        headers: { "Authorization": `Bearer ${authUserObj?.token}` }
      });
      dispatch(updateMessageReactions({ messageId: message._id, reactions: res.data.reactions }));
    } catch (error) {
      console.error("Failed to react", error);
    }
  };

  // Group reactions by emoji
  const groupedReactions = (message?.reactions || []).reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
  }, {});

  return (
    <div
      ref={scroll}
      className={`flex items-start gap-2.5 mb-4 ${isMyMessage ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Other user's avatar */}
      {!isMyMessage && (
        <div className="flex-shrink-0 mt-0.5">
          {selectedUser?.profilePhoto ? (
            <img
              src={selectedUser.profilePhoto}
              alt={selectedUser?.fullName}
              className="w-8 h-8 rounded-full object-cover"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.10)" }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs font-bold">
              {(selectedUser?.fullName || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Bubble group */}
      <div
        ref={containerRef}
        className={`flex flex-col gap-1 max-w-[75%] ${isMyMessage ? "items-end" : "items-start"}`}
      >
        {/* Sender label + time */}
        {!isMyMessage && (
          <div className="flex items-center gap-2 px-1">
            <span
              className="text-xs font-semibold text-gray-700 dark:text-stone-300"
              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
            >
              {selectedUser?.fullName?.split(" ")[0]}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-stone-500">{timeStr}</span>
          </div>
        )}
        {isMyMessage && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-gray-400 dark:text-stone-500">{timeStr}</span>
            <span
              className="text-xs font-semibold text-gray-700 dark:text-stone-300"
              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
            >
              You
            </span>
          </div>
        )}

        {/* Reply Preview */}
        {repliedMessage && !message.isDeleted && (
          <div 
            className={`text-xs p-2 rounded-lg bg-gray-100 dark:bg-stone-800 text-gray-500 dark:text-stone-400 mb-0.5 max-w-full truncate border-l-4 cursor-pointer hover:opacity-80 transition ${isMyMessage ? "border-violet-500" : "border-gray-400"}`}
          >
             <span className="font-semibold">{repliedMessage.senderId.toString() === authUser?._id?.toString() ? "You" : selectedUser?.fullName}:</span> {repliedMessage.isDeleted ? "🚫 This message was deleted" : repliedMessage.message}
          </div>
        )}

        {/* Bubble Row (Actions + Bubble) */}
        <div className={`relative flex items-center group w-full ${isMyMessage ? "justify-end" : "justify-start"}`}>
            
            {/* Actions Menu (Absolute overlay to prevent layout shift) */}
            {showActions && !message.isDeleted && message.messageType !== 'call' && (
                <div className={`absolute top-full mt-1 ${isMyMessage ? "right-0" : "left-0"} flex items-center gap-1 bg-white dark:bg-stone-800 shadow-xl border border-gray-100 dark:border-stone-700 rounded-lg p-1 z-50`}>
                    <div className="relative flex items-center group/react">
                        <button className="p-1.5 text-gray-500 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-stone-700 rounded transition peer"><BsEmojiSmile /></button>
                        <div className="absolute hidden peer-hover:flex hover:flex bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white dark:bg-stone-800 shadow-lg border border-gray-100 dark:border-stone-700 rounded-full p-1 gap-1 z-[60]">
                            {QUICK_REACTIONS.map(emoji => (
                                <button key={emoji} onClick={(e) => { e.stopPropagation(); handleReact(emoji); setShowActions(false); }} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-stone-700 rounded-full transition text-lg">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleReply(); setShowActions(false); }} className="p-1.5 text-gray-500 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-stone-700 rounded transition"><BsReplyFill /></button>
                    {isMyMessage && <button onClick={(e) => { e.stopPropagation(); handleEdit(); setShowActions(false); }} className="p-1.5 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-stone-700 rounded transition"><BsPencilSquare /></button>}
                    {isMyMessage && <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(); setShowActions(false); }} disabled={isDeleting} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-stone-700 rounded transition"><BsTrashFill /></button>}
                </div>
            )}

            {/* Bubble */}
            <div
              onClick={() => setShowActions(!showActions)}
              onContextMenu={(e) => { e.preventDefault(); setShowActions(!showActions); }}
              className={`relative px-4 py-2.5 cursor-pointer text-sm break-words leading-relaxed shrink-1 transition-transform active:scale-[0.98] ${
                message.isDeleted 
                  ? "text-gray-400 dark:text-stone-500 bg-gray-50 dark:bg-stone-800/50 rounded-2xl border border-gray-100 dark:border-stone-700 italic"
                  : isMyMessage
                  ? "text-white rounded-2xl rounded-br-sm"
                  : "text-gray-800 dark:text-stone-100 bg-gray-50 dark:bg-stone-800/80 rounded-2xl rounded-bl-sm border border-gray-100 dark:border-stone-700"
              }`}
              style={
                !message.isDeleted && isMyMessage
                  ? {
                      background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                      boxShadow: "0 4px 14px rgba(109,40,217,0.25)",
                      fontFamily: "Inter, system-ui, sans-serif",
                    }
                  : {
                      fontFamily: "Inter, system-ui, sans-serif",
                    }
              }
            >
              <div className="flex items-end gap-2">
                <span className="break-all break-words whitespace-pre-wrap min-w-0 flex-1">
                    {message.isDeleted ? "🚫 This message was deleted" : 
                        (message.messageType === 'call' ? 
                            <span className="flex items-center gap-2 font-medium">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                                </svg>
                                {message?.message}
                            </span> 
                        : message?.message)}
                </span>
                
                {message.isEdited && !message.isDeleted && (
                    <span className="text-[10px] opacity-70 ml-1 italic flex-shrink-0">(edited)</span>
                )}

                {isMyMessage && !message.isDeleted && (
                  <span className="flex-shrink-0 mb-0.5 ml-1 flex items-center justify-center">
                    {message?.status === "read" ? (
                      <BsCheck2All className="text-blue-300 text-[16px] drop-shadow-sm" />
                    ) : message?.status === "delivered" ? (
                      <BsCheck2All className="text-white/70 text-[16px]" />
                    ) : (
                      <BsCheck2 className="text-white/70 text-[16px]" />
                    )}
                  </span>
                )}
              </div>
            </div>
        </div>

        {/* Reactions Display */}
        {Object.keys(groupedReactions).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-0.5 ${isMyMessage ? "justify-end" : "justify-start"}`}>
                {Object.entries(groupedReactions).map(([emoji, count]) => (
                    <button 
                      key={emoji} 
                      onClick={() => handleReact(emoji)} 
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition ${
                        (message.reactions || []).some(r => r.emoji === emoji && r.userId.toString() === authUser?._id?.toString())
                          ? "bg-violet-100 dark:bg-violet-900/40 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300"
                          : "bg-gray-50 dark:bg-stone-800 hover:bg-gray-100 dark:hover:bg-stone-700 border-gray-200 dark:border-stone-700 text-gray-600 dark:text-stone-300"
                      }`}
                    >
                        <span>{emoji}</span>
                        {count > 1 && <span className="font-medium opacity-80">{count}</span>}
                    </button>
                ))}
            </div>
        )}

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-gray-100 dark:border-stone-800 transform transition-all scale-100 opacity-100">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-inter">Delete Message</h3>
            <p className="text-sm text-gray-500 dark:text-stone-400 mb-6 font-inter leading-relaxed">
              Are you sure you want to delete this message? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-stone-300 hover:bg-gray-100 dark:hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 shadow-md shadow-red-500/20 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;
