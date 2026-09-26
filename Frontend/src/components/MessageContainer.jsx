import React, { useEffect, useState } from "react";
import SendInput from "./SendInput";
import Messages from "./Messages";
import GroupInfoModal from "./GroupInfoModal";
import P2PTransferModal from "./P2PTransferModal";
import { useDispatch, useSelector } from "react-redux";
import { setSelectedUser } from "../redux/userSlice";
import { clearUnread } from "../redux/userSlice";
import { setMessages, addMessage } from "../redux/messageSlice";
import { API_ENDPOINTS } from "../config/api";
import axios from "axios";
import { useWebRTC } from "../hooks/useWebRTC";

const MessageContainer = () => {
  const { selectedUser, authUser, onlineUsers, typingUsers } = useSelector((store) => store.user);
  const { socket } = useSelector(store => store.socket);
  const dispatch = useDispatch();
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const isOnline = onlineUsers?.includes(selectedUser?._id) || false;
  const isTyping = typingUsers?.includes(selectedUser?._id) || false;

  // Initialize WebRTC P2P Hook
  const { incomingTransfer, activeTransfer, requestTransfer, acceptTransfer, rejectTransfer, resetTransfer } = useWebRTC();

  /* Initials avatar fallback */
  const getInitials = (name = "") =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  // Reset messages to null when switching conversations (shows skeleton instead of stale data)
  useEffect(() => {
    dispatch(setMessages(null));
  }, [selectedUser?._id, dispatch]);

  // Mark messages as read when this conversation is opened
  useEffect(() => {
    if (!selectedUser?._id) return;

    const markRead = async () => {
      try {
        const authUserData = JSON.parse(localStorage.getItem("authUser"));
        await fetch(API_ENDPOINTS.MESSAGE.MARK_READ(selectedUser._id), {
          method: "PUT",
          credentials: "include",
          headers: { Authorization: `Bearer ${authUserData?.token}` },
        });
        dispatch(clearUnread(selectedUser._id));
      } catch (e) {
        console.error("Failed to mark messages as read:", e);
      }
    };
    markRead();
  }, [selectedUser?._id, dispatch]);

  if (!selectedUser) {
    return (
      <div className="flex-1 hidden sm:flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0d0d0d] transition-colors">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Welcome back, {authUser?.fullName?.split(' ')[0]}!
          </h2>
          <p className="text-sm text-gray-400 dark:text-stone-500">
            Pick a conversation to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex flex-col bg-white dark:bg-[#0d0d0d] h-full transition-colors duration-300 ${selectedUser ? 'flex' : 'hidden sm:flex'}`}
      style={{ minWidth: 0 }}
    >
      {/* ── Chat Header ── */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-white dark:bg-[#111] border-b border-gray-100 dark:border-stone-800 transition-colors"
        style={{ minHeight: '68px' }}
      >
        <div 
          className={`flex items-center gap-2 sm:gap-3 ${selectedUser?.isGroup ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-stone-800/50 p-1.5 -ml-1.5 rounded-xl transition-colors' : ''}`}
          onClick={() => { if (selectedUser?.isGroup) setIsGroupInfoOpen(true) }}
        >
          {/* Back button (mobile) */}
          <button
            onClick={(e) => { e.stopPropagation(); dispatch(setSelectedUser(null)); }}
            className="sm:hidden p-2.5 -ml-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-stone-800 transition active:scale-95"
            aria-label="Back to messages"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>

          {/* Avatar */}
          <div className="relative">
            {selectedUser?.profilePhoto ? (
              <img
                src={selectedUser.profilePhoto}
                alt={selectedUser.fullName}
                className="w-10 h-10 rounded-full object-cover"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white font-bold text-sm">
                {getInitials(selectedUser?.fullName)}
              </div>
            )}
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-[#111] rounded-full" />
            )}
          </div>

          {/* Name & status / typing indicator */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-bold text-gray-900 dark:text-white leading-tight truncate"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {selectedUser?.fullName}
            </h3>
            {isTyping ? (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-violet-500 font-medium">typing</span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full bg-violet-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </div>
            ) : (
              <p className="text-xs mt-0.5 truncate" style={{ color: isOnline ? '#10b981' : '#9ca3af' }}>
                {selectedUser?.isGroup ? 'Group' : (isOnline ? 'Online' : 'Offline')}
              </p>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              const isGroup = selectedUser.isGroup;
              const roomId = isGroup ? selectedUser._id : [authUser._id, selectedUser._id].sort().join('_');
              
              const callEvent = isGroup ? 'callGroup' : 'callUser';
              const callData = {
                callerData: { _id: authUser._id, fullName: authUser.fullName, profilePhoto: authUser.profilePhoto },
                roomId
              };
              if (isGroup) {
                callData.groupId = selectedUser._id;
                callData.groupName = selectedUser.fullName;
                callData.participants = selectedUser.participants;
              } else {
                callData.receiverId = selectedUser._id;
              }
              
              socket.emit(callEvent, callData);

              // Dispatch a global event or update Redux to show the VideoCall UI
              window.dispatchEvent(new CustomEvent('startVideoCall', { detail: { roomId, isGroup } }));

              // Log call history message
              axios.post(
                API_ENDPOINTS.MESSAGE.SEND(selectedUser._id),
                { message: "Video call started", messageType: "call", isEncrypted: false },
                {
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${authUser?.token}` },
                  withCredentials: true,
                }
              ).then((res) => {
                  const realMessage = res.data.newMessage;
                  realMessage.message = "Video call started"; // plain text for local view
                  realMessage.senderId = realMessage.senderId?.toString?.() ?? realMessage.senderId;
                  
                  // Instantly show the call message in local chat window
                  dispatch(addMessage(realMessage));
              }).catch(err => console.error("Failed to log call message:", err));
            }}
            className="p-2 rounded-xl text-violet-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition"
            title="Start Video Call"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </button>
          <button className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-stone-200 hover:bg-gray-100 dark:hover:bg-stone-800 transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages Area ── */}
      <Messages />

      {/* ── Input ── */}
      <SendInput requestTransfer={requestTransfer} />

      {/* ── Group Info Modal ── */}
      {selectedUser?.isGroup && (
        <GroupInfoModal 
          isOpen={isGroupInfoOpen} 
          onClose={() => setIsGroupInfoOpen(false)} 
          groupId={selectedUser._id} 
        />
      )}

      {/* ── P2P Transfer Modal ── */}
      <P2PTransferModal 
        incomingTransfer={incomingTransfer}
        activeTransfer={activeTransfer}
        acceptTransfer={acceptTransfer}
        rejectTransfer={rejectTransfer}
        resetTransfer={resetTransfer}
      />
    </div>
  );
};

export default MessageContainer;

