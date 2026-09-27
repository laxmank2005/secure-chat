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
  const [isProfilePicViewerOpen, setIsProfilePicViewerOpen] = useState(false);
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
      <div className="flex-1 hidden sm:flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0d0d0d] transition-colors p-8">
        <div className="text-center w-full max-w-lg">
          {/* Custom Illustration */}
          <div className="relative w-72 h-72 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-[60px] animate-pulse"></div>
            <svg viewBox="0 0 200 200" className="w-full h-full z-10" xmlns="http://www.w3.org/2000/svg">
              {/* Main central device */}
              <rect x="65" y="40" width="70" height="120" rx="12" fill="#ffffff" stroke="#e5e7eb" strokeWidth="2" className="dark:fill-[#1a1a1a] dark:stroke-[#333]" />
              <rect x="70" y="45" width="60" height="110" rx="8" fill="#f9fafb" className="dark:fill-[#0a0a0a]" />
              <circle cx="100" cy="148" r="3" fill="#d1d5db" className="dark:fill-[#444]" />
              
              {/* Chat Bubbles */}
              <g className="animate-[bounce_3s_ease-in-out_infinite]">
                <rect x="25" y="60" width="55" height="32" rx="12" fill="#8b5cf6" />
                <polygon points="80,85 90,95 70,90" fill="#8b5cf6" />
                <circle cx="40" cy="76" r="3" fill="#ffffff" />
                <circle cx="52" cy="76" r="3" fill="#ffffff" opacity="0.7" />
                <circle cx="64" cy="76" r="3" fill="#ffffff" opacity="0.4" />
              </g>

              <g className="animate-[bounce_4s_ease-in-out_infinite]" style={{ animationDelay: '1s' }}>
                <rect x="120" y="90" width="55" height="32" rx="12" fill="#10b981" />
                <polygon points="120,115 110,125 130,120" fill="#10b981" />
                <path d="M135 106 L155 106 M135 112 L145 112" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
              </g>

              <g className="animate-[bounce_3.5s_ease-in-out_infinite]" style={{ animationDelay: '0.5s' }}>
                <rect x="40" y="115" width="45" height="26" rx="10" fill="#f59e0b" />
                <polygon points="85,135 95,145 75,140" fill="#f59e0b" />
                <path d="M52 128 L72 128" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              </g>

              {/* Decorative elements */}
              <circle cx="160" cy="50" r="4" fill="#8b5cf6" opacity="0.6" className="animate-pulse" />
              <circle cx="30" cy="150" r="6" fill="#10b981" opacity="0.4" className="animate-pulse" style={{ animationDelay: '1s' }} />
              <path d="M165 150 L175 160 M175 150 L165 160" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            </svg>
          </div>

          <h2 className="text-[26px] font-bold text-gray-900 dark:text-white mb-4 tracking-tight"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Hi there! It seems you had a very busy day!
          </h2>
          
          <p className="text-[15px] text-gray-500 dark:text-stone-400 max-w-[420px] mx-auto leading-relaxed">
            Welcome back, <span className="font-semibold text-violet-500 dark:text-violet-400">{authUser?.fullName?.split(' ')[0]}</span>.
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
      {/* Profile Picture Viewer Modal */}
      {isProfilePicViewerOpen && selectedUser?.profilePhoto && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsProfilePicViewerOpen(false)}
        >
          <div className="relative max-w-3xl max-h-[80vh] p-4 flex flex-col items-center">
            <button 
              className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors bg-black/40 rounded-full hover:bg-black/60"
              onClick={() => setIsProfilePicViewerOpen(false)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <img
              src={selectedUser.profilePhoto}
              alt={selectedUser.fullName}
              className="w-full h-full max-h-[70vh] object-contain rounded-full sm:rounded-3xl shadow-2xl ring-4 ring-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

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
          <div 
            className="relative cursor-pointer"
            onClick={(e) => {
              if (selectedUser?.profilePhoto) {
                e.stopPropagation();
                setIsProfilePicViewerOpen(true);
              }
            }}
          >
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

