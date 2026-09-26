import React, { useRef, useEffect } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

const VideoCall = ({ roomID, userID, userName, isGroup, onLeave }) => {
  const videoContainerRef = useRef(null);

  useEffect(() => {
    let zp = null;

    const initVideoCall = async () => {
      // ⚠️ IMPORTANT: Get these from zegocloud.com (Create an account -> create project)
      // For security, these should eventually be in your .env file
      const appID = Number(import.meta.env.VITE_ZEGO_APP_ID) || 0; // Replace 0 with your actual AppID
      const serverSecret = import.meta.env.VITE_ZEGO_SERVER_SECRET || ""; // Replace with your ServerSecret

      if (!appID || !serverSecret) {
        console.error("ZegoCloud AppID and ServerSecret are missing!");
        alert("Video calling is not fully configured yet. Missing API keys.");
        if (onLeave) onLeave();
        return;
      }

      // Generate a Kit Token (This tells ZegoCloud who is joining which room)
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        appID,
        serverSecret,
        roomID,
        userID,
        userName
      );

      // Create the ZegoCloud instance
      zp = ZegoUIKitPrebuilt.create(kitToken);

      // Start the call UI and attach it to our div reference
      zp.joinRoom({
        container: videoContainerRef.current,
        sharedLinks: [
          {
            name: 'Copy link',
            url: window.location.origin + '?roomID=' + roomID,
          },
        ],
        turnOnMicrophoneWhenJoining: true,
        turnOnCameraWhenJoining: true,
        showMyCameraToggleButton: true,
        showMyMicrophoneToggleButton: true,
        showAudioVideoSettingsButton: true,
        showScreenSharingButton: true,
        showTextChat: true,
        showUserList: true,
        maxUsers: isGroup ? 10 : 2,
        layout: "Auto",
        showLayoutButton: isGroup,
        scenario: {
          mode: isGroup ? ZegoUIKitPrebuilt.GroupCall : ZegoUIKitPrebuilt.OneONoneCall,
          config: {
            role: "Host",
          },
        },
        showPreJoinView: false, // Go straight to the call
        onLeaveRoom: () => {
          if (onLeave) onLeave();
        },
      });
    };

    if (videoContainerRef.current) {
      initVideoCall();
    }

    // Cleanup when component unmounts
    return () => {
      if (zp) {
        zp.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomID, userID, userName]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* ZegoCloud will inject its UI directly into this div */}
      <div 
        ref={videoContainerRef} 
        className="w-full h-full max-w-[1200px] max-h-[800px] mx-auto shadow-2xl rounded-lg overflow-hidden" 
      />
    </div>
  );
};

export default VideoCall;
