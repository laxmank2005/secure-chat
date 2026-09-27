import React, { useState, useRef, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setSelectedUser } from "../redux/userSlice";
import { API_ENDPOINTS } from "../config/api";

/* Deterministic avatar color from name */
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
const getInitials = (name = "") =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const NewChatModal = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const dispatch = useDispatch();
  const { authUser } = useSelector(store => store.user);

  // Auto-focus the input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setHasSearched(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Debounced search
  const searchUsers = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(API_ENDPOINTS.USER.SEARCH(searchQuery), {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${authUser?.token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        // Safety: filter out self from results in case of edge cases
        const filtered = data.users.filter(u => u._id !== authUser?._id);
        setResults(filtered);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  }, [authUser]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce the search by 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchUsers(value);
    }, 300);
  };

  const handleSelectUser = (user) => {
    dispatch(setSelectedUser(user));
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 mt-16 sm:mt-0 bg-white dark:bg-[#111] rounded-2xl shadow-2xl border border-gray-200 dark:border-stone-800 overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            New Chat
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-stone-200 hover:bg-gray-100 dark:hover:bg-stone-800 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-6 pb-4">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-stone-500 pointer-events-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              type="text"
              placeholder="Search by mobile number or name"
              className="w-full pl-11 pr-4 py-3 text-sm rounded-xl bg-gray-50 dark:bg-stone-900 border border-gray-200 dark:border-stone-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-stone-500 outline-none focus:border-violet-400 dark:focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30 transition-all"
              autoComplete="off"
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto custom-scrollbar border-t border-gray-100 dark:border-stone-800">
          {/* Hint when nothing typed yet */}
          {!hasSearched && query.length < 2 && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-stone-400 font-medium">
                Enter a mobile number or name
              </p>
              <p className="text-xs text-gray-400 dark:text-stone-500 mt-1">
                to find someone and start chatting
              </p>
            </div>
          )}

          {/* No results */}
          {hasSearched && results.length === 0 && !isSearching && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-stone-800 flex items-center justify-center mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 dark:text-stone-500">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-stone-400 font-medium">
                No user found
              </p>
              <p className="text-xs text-gray-400 dark:text-stone-500 mt-1">
                Check the mobile number or name and try again
              </p>
            </div>
          )}

          {/* Results list */}
          {results.map((user) => (
            <div
              key={user._id}
              onClick={() => handleSelectUser(user)}
              className="flex items-center gap-3 px-6 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-stone-900/60 transition-colors border-b border-gray-50 dark:border-stone-800/50 last:border-b-0"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {user.profilePhoto ? (
                  <img
                    src={user.profilePhoto}
                    alt={user.fullName}
                    className="w-11 h-11 rounded-full object-cover"
                    style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }}
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: colorFor(user.fullName) }}
                  >
                    {getInitials(user.fullName)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {user.fullName}
                </p>
                <p className="text-xs text-gray-400 dark:text-stone-500 truncate mt-0.5">
                  {user.mobile}
                </p>
              </div>

              {/* Arrow */}
              <div className="flex-shrink-0 text-gray-300 dark:text-stone-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;
