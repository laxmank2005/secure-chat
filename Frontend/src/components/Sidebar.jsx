import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import OtherUsers from './OtherUsers';
const NewChatModal = lazy(() => import('./NewChatModal'));
import CreateGroupModal from './CreateGroupModal';
import axios from 'axios';
import { toast } from "react-hot-toast";
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { setAuthUser, setSelectedUser, setOtherUsers } from '../redux/userSlice';
import { setMessages } from '../redux/messageSlice';
import { API_ENDPOINTS } from '../config/api';
import ThemeToggle from './ThemeToggle';
import { clearPrivateKey } from '../utils/keyStore';

const Sidebar = () => {
  const [search, setSearch] = useState("");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const fabMenuRef = useRef(null);
  const profilePicInputRef = useRef(null);
  const [isUpdatingProfilePic, setIsUpdatingProfilePic] = useState(false);
  const { otherUsers, authUser, selectedUser } = useSelector(store => store.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Close profile menu & FAB menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
      if (fabMenuRef.current && !fabMenuRef.current.contains(event.target)) {
        setIsFabMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error("File size should be less than 5MB");
    }

    try {
      setIsUpdatingProfilePic(true);
      const formData = new FormData();
      formData.append("profilePic", file);

      axios.defaults.withCredentials = true;
      const res = await axios.put(API_ENDPOINTS.USER.UPDATE_PROFILE_PIC, formData, {
        headers: { 
          "Authorization": `Bearer ${authUser?.token}` 
        },
        withCredentials: true
      });

      if (res.data.success) {
        toast.success("Profile picture updated!");
        dispatch(setAuthUser(res.data.user));
        localStorage.setItem("authUser", JSON.stringify(res.data.user));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update profile picture");
    } finally {
      setIsUpdatingProfilePic(false);
      if (profilePicInputRef.current) profilePicInputRef.current.value = "";
    }
  };

  const logoutHandler = async () => {
    const authUserObj = JSON.parse(localStorage.getItem("authUser"));
    try {
      await axios.get(API_ENDPOINTS.USER.LOGOUT);
    } catch (error) {
      console.log(error);
    } finally {
      if (authUserObj?._id) {
        await clearPrivateKey(authUserObj._id);
      }
      localStorage.removeItem("authUser");
      navigate("/login");
      dispatch(setAuthUser(null));
      dispatch(setSelectedUser(null));
      dispatch(setOtherUsers(null));
      dispatch(setMessages([]));
    }
  };

  const isLoading = otherUsers === null;
  const nonSelfUsers = otherUsers?.filter(u => u._id !== authUser?._id) ?? [];
  const totalUsers = nonSelfUsers.length;

  return (
    <>
      <div
        className={`relative flex-col h-full bg-white dark:bg-[#111] border-r border-gray-100 dark:border-stone-800 transition-colors duration-300 w-full sm:w-[320px] sm:min-w-[320px] shrink-0
          ${selectedUser ? 'hidden sm:flex' : 'flex'}
        `}
      >
        {/* ── Top bar ── */}
        <div className="px-5 pt-7 pb-4 flex items-center justify-between">
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-none"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Chats{' '}
              <span className="text-violet-500 font-bold">({totalUsers})</span>
            </h1>
          </div>

          <div className="flex items-center gap-1.5 relative" ref={profileMenuRef}>

            {/* Menu Button */}
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              title="Menu"
              className={`p-2.5 rounded-xl transition-all ${isProfileMenuOpen ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white'}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1.5"></circle>
                <circle cx="12" cy="5" r="1.5"></circle>
                <circle cx="12" cy="19" r="1.5"></circle>
              </svg>
            </button>

            {/* Popup Menu */}
            {isProfileMenuOpen && (
              <div className="absolute top-full mt-2 right-0 sm:right-0 -mr-2 sm:mr-0 min-w-[240px] bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-stone-800 rounded-[20px] shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                
                {/* Profile Info inside Menu */}
                <div className="flex items-center gap-3 mb-3 px-2">
                  <div 
                    className="relative w-11 h-11 rounded-full cursor-pointer group flex-shrink-0 bg-gray-100 dark:bg-stone-800"
                    onClick={() => !isUpdatingProfilePic && profilePicInputRef.current?.click()}
                    title="Change Profile Picture"
                  >
                    <img
                      src={authUser?.profilePhoto}
                      alt="me"
                      className={`w-11 h-11 rounded-full object-cover ring-2 ring-violet-200 dark:ring-violet-900/50 transition-all ${isUpdatingProfilePic ? 'opacity-50' : 'group-hover:opacity-60'}`}
                    />
                    {!isUpdatingProfilePic && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                          <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                      </div>
                    )}
                    {isUpdatingProfilePic && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={profilePicInputRef} 
                      onChange={handleProfilePicChange} 
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                      {authUser?.fullName}
                    </p>
                    <p className="text-xs font-medium text-gray-400 dark:text-stone-500 truncate mt-0.5">
                      {authUser?.email}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-stone-800 mb-2"></div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-stone-300 font-medium">
                    <span>Theme</span>
                    <ThemeToggle className="!p-1.5 border-none !bg-transparent shadow-none" />
                  </div>
                  <button
                    onClick={logoutHandler}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-red-600 dark:text-red-500 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                  >
                    <span>Log out</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Search (filters existing conversations) ── */}
        <div className="px-5 pb-5">
          <div className="relative group flex items-center">
            <div className="absolute left-4 text-gray-400 group-focus-within:text-violet-500 transition-colors pointer-events-none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="text"
              placeholder="Search conversations"
              className="w-full pl-11 pr-4 py-3 text-[15px] sm:text-sm rounded-[16px] bg-gray-50 dark:bg-stone-900/60 border border-gray-200 dark:border-stone-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-stone-500 outline-none focus:border-violet-400 dark:focus:border-violet-500 focus:bg-white dark:focus:bg-stone-900 focus:ring-4 focus:ring-violet-50 dark:focus:ring-violet-900/20 transition-all duration-200 shadow-sm"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            />
          </div>
        </div>

        {/* ── User List / Skeleton / Empty State ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
          {/* Always render OtherUsers so the fetch hook mounts */}
          <OtherUsers search={search} />

          {/* Loading skeleton — shown only while first fetch is in flight */}
          {isLoading && (
            <div className="flex flex-col w-full">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 w-full border-b border-gray-50 dark:border-stone-800/50">
                  <div className="w-[50px] h-[50px] rounded-full bg-gray-200/80 dark:bg-stone-800/80 animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1.5 w-full">
                      <div className="h-3.5 bg-gray-200/80 dark:bg-stone-800/80 rounded animate-pulse w-32" />
                      <div className="h-2.5 bg-gray-100 dark:bg-stone-800/50 rounded animate-pulse w-10" />
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-stone-800/50 rounded animate-pulse w-48 max-w-[80%]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state — only shown when fetch is DONE and list is truly empty */}
          {!isLoading && totalUsers === 0 && (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="w-14 h-14 rounded-[1.25rem] bg-violet-100/80 dark:bg-violet-900/20 flex items-center justify-center mb-4 border border-violet-200/50 dark:border-violet-800/30">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <h3 className="text-[15px] font-bold text-gray-800 dark:text-white mb-1.5"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                No conversations yet
              </h3>
              <p className="text-[13px] text-gray-400 dark:text-stone-500 mb-6 leading-relaxed max-w-[220px]">
                Search for someone by their mobile number to start chatting!
              </p>
              <button
                onClick={() => setIsNewChatOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-semibold rounded-xl hover:from-violet-700 hover:to-violet-600 transition-all shadow-[0_8px_20px_rgb(124,58,237,0.25)] hover:shadow-[0_8px_25px_rgb(124,58,237,0.35)] hover:-translate-y-0.5"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Start a New Chat
              </button>
            </div>
          )}

          {/* Floating Action Button */}
          <div className="absolute bottom-6 right-6 z-40" ref={fabMenuRef}>
            {/* FAB Popup Menu */}
            {isFabMenuOpen && (
              <div className="absolute bottom-full mb-4 right-0 w-48 bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-gray-100 dark:border-stone-800 py-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
                <button
                  onClick={() => {
                    setIsNewChatOpen(true);
                    setIsFabMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                  </svg>
                  Chat
                </button>
                <button
                  onClick={() => {
                    setIsCreateGroupOpen(true);
                    setIsFabMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  Group
                </button>
                <button
                  onClick={() => {
                    toast("Broadcasts coming soon!", { icon: "📣" });
                    setIsFabMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path>
                  </svg>
                  Broadcast
                </button>
              </div>
            )}
            
            {/* FAB Button */}
            <button
              onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
              className="w-14 h-14 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.24)] hover:scale-105 active:scale-95 transition-all duration-200"
            >
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className={`transition-transform duration-300 ${isFabMenuOpen ? 'rotate-45' : 'rotate-0'}`}
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* New Chat Modal */}
      {isNewChatOpen && (
        <Suspense fallback={null}>
          <NewChatModal
            isOpen={isNewChatOpen}
            onClose={() => setIsNewChatOpen(false)}
          />
        </Suspense>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal 
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
      />
    </>
  );
};

export default Sidebar;