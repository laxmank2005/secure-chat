import React, { useRef, useLayoutEffect } from "react";
import Message from "./Message";
import useGetMessages from "../hooks/useGetMessages";
import { useSelector } from "react-redux";

const Messages = () => {
  const { fetchMoreMessages, hasMore, isLoadingMore } = useGetMessages();
  const { messages } = useSelector((store) => store.message);

  const containerRef = useRef(null);
  const endRef = useRef(null);
  const prevScrollHeight = useRef(0);

  const isFirstLoad = useRef(true);

  // When selected user changes, messages is set to null, reset the flag.
  useLayoutEffect(() => {
    if (messages === null) {
      isFirstLoad.current = true;
    }
  }, [messages]);

  // Auto-scroll to bottom
  useLayoutEffect(() => {
    if (prevScrollHeight.current === 0 && messages?.length > 0) {
      endRef.current?.scrollIntoView({ 
        behavior: isFirstLoad.current ? "auto" : "smooth" 
      });
      isFirstLoad.current = false;
    }
  }, [messages]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop === 0 && hasMore && !isLoadingMore) {
      prevScrollHeight.current = containerRef.current.scrollHeight;
      fetchMoreMessages();
    }
  };

  useLayoutEffect(() => {
    if (containerRef.current && prevScrollHeight.current > 0) {
      const scrollDiff = containerRef.current.scrollHeight - prevScrollHeight.current;
      if (scrollDiff > 0) {
        containerRef.current.scrollTop += scrollDiff;
      }
      prevScrollHeight.current = 0;
    }
  }, [messages]);

  const formatDateLabel = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 bg-white dark:bg-[#0d0d0d] transition-colors duration-300"
    >
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <div className="w-5 h-5 border-2 border-t-transparent border-violet-500 rounded-full animate-spin"></div>
        </div>
      )}
      {/* Initial Loading Spinner */}
      {messages === null && (
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-violet-100 dark:border-violet-900/30 border-t-violet-500 rounded-full animate-spin"></div>
        </div>
      )}

      {/* Messages list */}
      {messages !== null && messages.length > 0 ? (
        messages.map((message, index) => {
          const currentDate = new Date(message.createdAt).toDateString();
          const previousDate =
            index > 0
              ? new Date(messages[index - 1].createdAt).toDateString()
              : null;
          const showDivider = currentDate !== previousDate;
          
          const getSenderIdStr = (msg) => (msg.senderId?._id ? msg.senderId._id.toString() : msg.senderId?.toString());

          return (
            <React.Fragment key={message._id}>
              {showDivider && (
                <div className="flex items-center gap-4 my-5">
                  <div className="flex-1 h-px bg-gray-100 dark:bg-stone-800" />
                  <span
                    className="text-[11px] font-semibold text-gray-400 dark:text-stone-500 whitespace-nowrap"
                    style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                  >
                    {formatDateLabel(message.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-stone-800" />
                </div>
              )}
              <Message 
                message={message} 
                isConsecutive={
                  index > 0 && 
                  getSenderIdStr(messages[index - 1]) === getSenderIdStr(message) && 
                  !showDivider
                } 
              />
            </React.Fragment>
          );
        })
      ) : messages !== null ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-gray-300 dark:text-stone-600"
            style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
            No messages yet — say hello! 👋
          </p>
        </div>
      ) : null}
      
      {/* Invisible element to scroll to */}
      <div ref={endRef} />
    </div>
  );
};

export default Messages;