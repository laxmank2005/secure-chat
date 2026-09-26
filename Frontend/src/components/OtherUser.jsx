import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { setSelectedUser, clearUnread } from "../redux/userSlice";

/* Returns initials for avatar fallback */
const getInitials = (name = "") =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

/* Deterministic but pleasant color based on name */
const avatarColors = [
  "#7C3AED","#6D28D9","#5B21B6","#4C1D95",
  "#2563EB","#1D4ED8","#DB2777","#B91C1C",
  "#059669","#047857","#D97706","#B45309",
];
const colorFor = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

const OtherUser = ({ user }) => {
  const dispatch = useDispatch();
  const { selectedUser, onlineUsers, typingUsers } = useSelector(store => store.user);
  const isOnline = onlineUsers?.includes(user._id);
  const isSelected = selectedUser?._id === user._id;
  const isTyping = typingUsers?.includes(user._id);

  const selectedUserHandler = () => {
    dispatch(setSelectedUser(user));
    dispatch(clearUnread(user._id));
  };

  return (
    <div
      onClick={selectedUserHandler}
      className="relative flex items-center gap-3 px-4 py-3.5 sm:py-3 cursor-pointer transition-all duration-150 select-none"
      style={{
        background: isSelected
          ? 'linear-gradient(90deg, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0.04) 100%)'
          : undefined,
        borderLeft: isSelected ? '3px solid #7C3AED' : '3px solid transparent',
      }}
    >
      {/* Hover bg via CSS */}
      <div className="absolute inset-0 hover:bg-gray-50 dark:hover:bg-stone-900/60 transition-colors" style={{ pointerEvents: 'none', borderRadius: 0 }} />

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {user.profilePhoto ? (
          <img
            src={user.profilePhoto}
            alt={user.fullName}
            className="w-12 h-12 rounded-full object-cover"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: colorFor(user.fullName) }}
          >
            {getInitials(user.fullName)}
          </div>
        )}
        {/* Online dot */}
        {isOnline && (
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-[#111] rounded-full" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-sm font-semibold text-gray-900 dark:text-white truncate"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {user.fullName}
          </p>
          {user.lastMessageTime && !isTyping && (
            <span className="text-[10px] text-gray-400 dark:text-stone-500 flex-shrink-0">
              {new Date(user.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <p className={`text-xs truncate mt-0.5 ${user.hasUnread || isTyping ? 'font-medium' : 'text-gray-400 dark:text-stone-500'} ${isTyping ? 'text-violet-500' : (user.hasUnread ? 'text-gray-900 dark:text-white' : '')}`}>
          {isTyping ? (
            <span className="italic">Typing...</span>
          ) : user.lastMessage ? (
            user.lastMessage
          ) : isOnline ? (
            <span className="text-emerald-500 font-medium">Online</span>
          ) : (
            'Offline'
          )}
        </p>
      </div>

      {/* Unread badge */}
      {user.hasUnread && (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
          <span className="text-[10px] text-white font-bold">{user.unreadCount || '!'}</span>
        </div>
      )}
    </div>
  );
};

export default OtherUser;
