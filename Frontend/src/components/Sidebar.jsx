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
  const profileMenuRef = useRef(null);
  const { otherUsers, authUser, selectedUser } = useSelector(store => store.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        className={`flex-col h-full bg-white dark:bg-[#111] border-r border-gray-100 dark:border-stone-800 transition-colors duration-300 w-full sm:w-[320px] sm:min-w-[320px] shrink-0
          ${selectedUser ? 'hidden sm:flex' : 'flex'}
        `}
      >
        {/* ── Top bar ── */}
        <div className="px-5 pt-7 pb-4 flex items-center justify-between">
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-none"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Messages{' '}
              <span className="text-violet-500 font-bold">({totalUsers})</span>
            </h1>
          </div>

          <div className="flex items-center gap-1.5 relative" ref={profileMenuRef}>
            {/* New Group button */}
            <button
              onClick={() => setIsCreateGroupOpen(true)}
              title="New Group"
              className="p-2.5 rounded-xl text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 dark:text-stone-400 transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </button>

            {/* New Chat button */}
            <button
              onClick={() => setIsNewChatOpen(true)}
              title="New Chat"
              className="p-2.5 rounded-xl text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 dark:text-stone-400 transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            
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
                  <img
                    src={authUser?.profilePhoto}
                    alt="me"
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-violet-200 dark:ring-violet-900/50"
                  />
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
            <div className="flex flex-col gap-1 px-2 pt-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-stone-800 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded-full bg-gray-100 dark:bg-stone-800 animate-pulse w-2/3" />
                    <div className="h-2.5 rounded-full bg-gray-100 dark:bg-stone-800 animate-pulse w-1/2" />
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
                Search for someone by their mobile number or email to start chatting!
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