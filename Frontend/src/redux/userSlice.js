import { createSlice } from "@reduxjs/toolkit";

const userSlice = createSlice({
  name: "user",
  initialState: {
    authUser: localStorage.getItem("authUser") ? JSON.parse(localStorage.getItem("authUser")) : null,
    otherUsers: null,   // null = not yet loaded, [] = loaded but empty
    selectedUser: sessionStorage.getItem("selectedUser") ? JSON.parse(sessionStorage.getItem("selectedUser")) : null,
    onlineUsers: [],
    typingUsers: [], // Array of user IDs currently typing
  },
  reducers: {
    setAuthUser: (state, action) => {
      state.authUser = action.payload;
    },
    setOtherUsers: (state, action) => {
      state.otherUsers = action.payload;
    },
    setOnlineUsers: (state, action) => {
      state.onlineUsers = action.payload;
    },
    setSelectedUser: (state, action) => {
      state.selectedUser = action.payload;
      // Persist to sessionStorage so refresh keeps the chat open
      if (action.payload) {
        sessionStorage.setItem("selectedUser", JSON.stringify(action.payload));
      } else {
        sessionStorage.removeItem("selectedUser");
      }
    },
    updateUserList: (state, action) => {
      if (!state.otherUsers) return;
      const { userId, isUnread, lastMessage, lastMessageTime, userObj } = action.payload;
      const userIndex = state.otherUsers.findIndex((u) => u._id === userId);
      
      let user;
      if (userIndex !== -1) {
        [user] = state.otherUsers.splice(userIndex, 1);
      } else if (userObj) {
        user = { ...userObj };
      }

      if (user) {
        if (isUnread) {
          user.unreadCount = (user.unreadCount || 0) + 1;
          user.hasUnread = true;
        }
        if (lastMessage !== undefined) {
          user.lastMessage = lastMessage;
          user.lastMessageTime = lastMessageTime || new Date().toISOString();
        }
        state.otherUsers.unshift(user);
      }
    },
    clearUnread: (state, action) => {
      if (!state.otherUsers) return;
      const user = state.otherUsers.find((u) => u._id === action.payload);
      if (user) {
        user.hasUnread = false;
        user.unreadCount = 0;
      }
    },
    addTypingUser: (state, action) => {
      if (!state.typingUsers.includes(action.payload)) {
        state.typingUsers.push(action.payload);
      }
    },
    removeTypingUser: (state, action) => {
      state.typingUsers = state.typingUsers.filter((id) => id !== action.payload);
    },
  },
});

export const { setAuthUser, setOtherUsers, setSelectedUser, setOnlineUsers, updateUserList, clearUnread, addTypingUser, removeTypingUser } = userSlice.actions;

export default userSlice.reducer;
