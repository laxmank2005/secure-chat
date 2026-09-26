import React, { Suspense, lazy, useEffect, useState } from "react";
import "./index.css";
import { createBrowserRouter, RouterProvider, Navigate, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useDispatch, useSelector } from "react-redux";
import io from 'socket.io-client';
import toast from "react-hot-toast";

import { setOnlineUsers, setAuthUser } from "./redux/userSlice";
import { setSocket } from "./redux/socketSlice";
import { SOCKET_URL } from "./config/api";

const Homepage = lazy(() => import("./components/Homepage"));
const Register = lazy(() => import("./components/Register"));
const Login = lazy(() => import("./components/Login"));
const LandingPage = lazy(() => import("./components/LandingPage"));

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d0d0d]">
    <div className="w-8 h-8 border-4 border-t-transparent border-violet-500 rounded-full animate-spin"></div>
  </div>
);

const VideoCall = lazy(() => import("./components/VideoCall"));

// Only accessible when NOT logged in (login, register)
const PublicOnlyRoute = ({ children }) => {
  const { authUser } = useSelector((store) => store.user);
  return authUser ? <Navigate to="/" replace /> : children;
};

// Only accessible when logged in (homepage)
const PrivateRoute = ({ children }) => {
  const { authUser } = useSelector((store) => store.user);
  return authUser ? children : <Navigate to="/landing" replace />;
};

// Smooth Animated Layout for seamless page-to-page transitions
const AnimatedLayout = () => {
  const location = useLocation();
  const currentOutlet = useOutlet();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{
          duration: 0.24,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full min-h-[100dvh]"
      >
        {currentOutlet}
      </motion.div>
    </AnimatePresence>
  );
};

const router = createBrowserRouter([
  {
    element: <AnimatedLayout />,
    children: [
      {
        path: "/",
        element: <PrivateRoute><Suspense fallback={<LoadingFallback />}><Homepage /></Suspense></PrivateRoute>
      },
      {
        path: "/landing",
        element: <PublicOnlyRoute><Suspense fallback={<LoadingFallback />}><LandingPage /></Suspense></PublicOnlyRoute>
      },
      {
        path: "/register",
        element: <PublicOnlyRoute><Suspense fallback={<LoadingFallback />}><Register /></Suspense></PublicOnlyRoute>
      },
      {
        path: "/login",
        element: <PublicOnlyRoute><Suspense fallback={<LoadingFallback />}><Login /></Suspense></PublicOnlyRoute>
      },
      {
        path: "*",
        element: <Navigate to="/" replace />
      }
    ]
  }
]);

const App = () => {
  const { authUser } = useSelector(store => store.user);
  const { socket } = useSelector(store => store.socket);
  const dispatch = useDispatch();

  const [activeCallData, setActiveCallData] = useState(null);
  const [incomingCallData, setIncomingCallData] = useState(null);

  // Stable callback so VideoCall doesn't unmount on Redux updates
  const handleLeaveCall = React.useCallback(() => {
    setActiveCallData(null);
  }, []);

  // Listen for custom window event to start a call
  useEffect(() => {
    const handleStartCall = (e) => {
      setActiveCallData(e.detail);
    };
    window.addEventListener('startVideoCall', handleStartCall);
    return () => window.removeEventListener('startVideoCall', handleStartCall);
  }, []);

  useEffect(() => {
    if (authUser) {
      const socketInstance = io(SOCKET_URL, {
        auth: {
          token: authUser.token
        }
      });
      dispatch(setSocket(socketInstance));
      
      socketInstance.on('getOnlineUsers', (onlineUsers) => {
        dispatch(setOnlineUsers(onlineUsers))
      });

      // --- Video Call Listeners ---
      socketInstance.on('incomingCall', ({ callerData, roomId, isGroup, groupName }) => {
        setIncomingCallData({ callerData, roomId, isGroup, groupName });
      });

      socketInstance.on('callRejected', () => {
        toast.error("Call was declined.");
        setActiveCallData(null);
      });

      socketInstance.on('connect_error', (err) => {
        console.error("Socket connect error:", err.message);
        // Only log out if it's a hard authentication error (e.g., token expired).
        // Otherwise, it's just a network blip or server restart, and socket.io will auto-reconnect.
        if (err.message.startsWith("Authentication error")) {
          toast.error("Session expired. Please log in again.");
          localStorage.removeItem("authUser");
          dispatch(setAuthUser(null));
        }
      });

      return () => socketInstance.close();
    }
    else {
      if (socket) {
        socket.close();
        dispatch(setSocket(null));
      }
    }
  }, [authUser]);

  return (
    <div className="min-h-[100dvh] w-full">
      <RouterProvider router={router} />

      {/* --- Active Video Call --- */}
      {activeCallData && authUser && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-sm font-medium text-stone-300">Connecting to secure video call...</p>
          </div>
        }>
          <VideoCall 
            roomID={activeCallData.roomId} 
            userID={authUser._id} 
            userName={authUser.fullName}
            isGroup={activeCallData.isGroup}
            onLeave={handleLeaveCall}
          />
        </Suspense>
      )}

      {/* --- Incoming Call Modal --- */}
      {incomingCallData && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-stone-800 rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center transform scale-100 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 mx-auto rounded-full mb-4 bg-gray-100 dark:bg-stone-800 p-1 relative">
              <img 
                src={incomingCallData.callerData.profilePhoto} 
                alt={incomingCallData.callerData.fullName}
                className="w-full h-full rounded-full object-cover"
              />
              <span className="absolute top-0 right-0 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-violet-500 border-2 border-white dark:border-[#111]"></span>
              </span>
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {incomingCallData.isGroup ? incomingCallData.groupName : incomingCallData.callerData.fullName}
            </h2>
            <p className="text-sm text-gray-500 dark:text-stone-400 mb-8">
              {incomingCallData.isGroup 
                ? `Incoming group video call from ${incomingCallData.callerData.fullName}...` 
                : "Incoming video call..."}
            </p>

            <div className="flex items-center justify-center gap-4">
              <button 
                onClick={() => {
                  socket?.emit('rejectCall', { callerId: incomingCallData.callerData._id });
                  setIncomingCallData(null);
                }}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors duration-300 shadow-sm">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                    <line x1="23" y1="1" x2="1" y2="23"></line>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-gray-500 dark:text-stone-400">Decline</span>
              </button>

              <button 
                onClick={() => {
                  setActiveCallData(incomingCallData);
                  setIncomingCallData(null);
                }}
                className="flex flex-col items-center gap-2 group animate-bounce"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/40 hover:bg-emerald-600 transition-colors duration-300">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-gray-700 dark:text-stone-300">Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App