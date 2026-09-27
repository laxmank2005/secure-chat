import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';

export const useWebRTC = () => {
  const { socket } = useSelector(store => store.socket);
  const { authUser } = useSelector(store => store.user);

  // State for UI to react to
  const [incomingTransfer, setIncomingTransfer] = useState(null);
  const [activeTransfer, setActiveTransfer] = useState(null); // { fileName, progress, speed, status }
  
  // WebRTC core refs
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  
  // Receiving State Refs
  const receivedChunksRef = useRef([]);
  const receivedSizeRef = useRef(0);
  const expectedSizeRef = useRef(0);
  const currentFileNameRef = useRef('');
  const currentMimeTypeRef = useRef('');

  // Sending State Refs
  const fileToSendRef = useRef(null);
  const currentPeerIdRef = useRef(null);
  const lastProgressRef = useRef(0);

  const resetTransfer = useCallback((isManualCancel = false) => {
    if (isManualCancel && currentPeerIdRef.current && socket) {
        socket.emit('p2pTransferCanceled', { targetId: currentPeerIdRef.current });
    }

    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (dataChannelRef.current) dataChannelRef.current.close();
    peerConnectionRef.current = null;
    dataChannelRef.current = null;
    currentPeerIdRef.current = null;
    lastProgressRef.current = 0;
    
    receivedChunksRef.current = [];
    receivedSizeRef.current = 0;
    expectedSizeRef.current = 0;
    
    setIncomingTransfer(null);
    setActiveTransfer(null);
    fileToSendRef.current = null;
  }, [socket]);

  const createPeerConnection = useCallback((targetId) => {
    // 1. Setup standard WebRTC peer connection (using public Google STUN servers)
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('p2pSignal', { targetId, signal: { type: 'candidate', candidate: event.candidate }, senderId: authUser._id });
      }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            toast.error("P2P Connection Lost");
            resetTransfer();
        }
    };

    return pc;
  }, [socket, authUser, resetTransfer]);

  // ------------- SENDER LOGIC ------------- //
  
  // 1. Sender initiates transfer request
  const requestTransfer = useCallback((receiverId, file) => {
    if (!socket) return;
    fileToSendRef.current = file;
    currentPeerIdRef.current = receiverId;
    setActiveTransfer({ fileName: file.name, progress: 0, status: 'waiting_for_acceptance' });
    
    socket.emit('p2pTransferRequest', {
        receiverId,
        senderId: authUser._id,
        fileInfo: { name: file.name, size: file.size, type: file.type }
    });
  }, [socket, authUser]);

  // 2. Receiver accepts -> Sender starts WebRTC Offer
  const startSendingFile = useCallback(async (targetId) => {
    const pc = createPeerConnection(targetId);
    peerConnectionRef.current = pc;

    // Create a data channel for transferring the binary file
    const dc = pc.createDataChannel('fileTransfer', { negotiated: true, id: 0 });
    dataChannelRef.current = dc;
    dc.binaryType = 'arraybuffer';
    
    setupDataChannelForSending(dc);

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('p2pSignal', { targetId, signal: offer, senderId: authUser._id });
    } catch (err) {
        console.error("Error creating offer", err);
    }
  }, [createPeerConnection, socket, authUser]);

  const setupDataChannelForSending = (dc) => {
    dc.onopen = () => {
        const file = fileToSendRef.current;
        if (!file) return;
        
        setActiveTransfer(prev => ({ ...prev, status: 'sending', progress: 0 }));
        lastProgressRef.current = 0;
        
        const chunkSize = 256 * 1024; // 256 KB chunks for maximum throughput
        let offset = 0;

        const sendNextChunks = async () => {
            while (offset < file.size) {
                if (dc.readyState !== 'open') return; // Stop if disconnected

                // Keep pushing to the C++ buffer until it hits 16MB
                if (dc.bufferedAmount > 16 * 1024 * 1024) {
                    return; // Wait for onbufferedamountlow
                }

                const slice = file.slice(offset, offset + chunkSize);
                const buffer = await slice.arrayBuffer(); // Faster than FileReader
                dc.send(buffer);
                offset += buffer.byteLength;

                // PERFORMANCE: Only trigger React re-render if percentage integer changes
                const progressPercent = Math.round((offset / file.size) * 100);
                if (progressPercent !== lastProgressRef.current) {
                    setActiveTransfer(prev => ({ ...prev, progress: progressPercent }));
                    lastProgressRef.current = progressPercent;
                }
            }

            if (offset >= file.size) {
                toast.success(`Successfully sent ${file.name}`);
                setTimeout(resetTransfer, 2000);
            }
        };

        dc.bufferedAmountLowThreshold = 8 * 1024 * 1024; // Resume when buffer drops to 8MB
        dc.onbufferedamountlow = sendNextChunks;

        // Start blazing fast streaming!
        sendNextChunks();
    };
  };


  // ------------- RECEIVER LOGIC ------------- //

  // 1. Receiver explicitly accepts transfer
  const acceptTransfer = useCallback((senderId) => {
    if (!incomingTransfer) return;
    expectedSizeRef.current = incomingTransfer.fileInfo.size;
    currentFileNameRef.current = incomingTransfer.fileInfo.name;
    currentMimeTypeRef.current = incomingTransfer.fileInfo.type;
    currentPeerIdRef.current = senderId;
    lastProgressRef.current = 0;

    setActiveTransfer({ fileName: incomingTransfer.fileInfo.name, progress: 0, status: 'receiving' });
    setIncomingTransfer(null);
    
    socket.emit('p2pTransferResponse', { senderId, accepted: true, receiverId: authUser._id });
  }, [incomingTransfer, socket, authUser]);

  const rejectTransfer = useCallback((senderId) => {
    setIncomingTransfer(null);
    socket.emit('p2pTransferResponse', { senderId, accepted: false, receiverId: authUser._id });
  }, [socket, authUser]);

  // 2. Setup Data channel for receiving
  const setupDataChannelForReceiving = (pc) => {
    const dc = pc.createDataChannel('fileTransfer', { negotiated: true, id: 0 });
    dataChannelRef.current = dc;
    dc.binaryType = 'arraybuffer';
    
    dc.onmessage = (event) => {
        receivedChunksRef.current.push(event.data);
        receivedSizeRef.current += event.data.byteLength;

        // PERFORMANCE: Only trigger React re-render if percentage integer changes!
        const progressPercent = Math.round((receivedSizeRef.current / expectedSizeRef.current) * 100);
        if (progressPercent !== lastProgressRef.current) {
            setActiveTransfer(prev => ({ ...prev, progress: progressPercent }));
            lastProgressRef.current = progressPercent;
        }

        // Check if finished
        if (receivedSizeRef.current === expectedSizeRef.current) {
            const blob = new Blob(receivedChunksRef.current, { type: currentMimeTypeRef.current });
            const downloadUrl = URL.createObjectURL(blob);
            
            // Trigger Automatic Download
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = currentFileNameRef.current;
            a.click();
            URL.revokeObjectURL(downloadUrl);

            toast.success(`Successfully received ${currentFileNameRef.current}`);
            setTimeout(resetTransfer, 2000);
        }
    };
  };

  // ------------- SIGNALING LISTENER ------------- //
  
  useEffect(() => {
    if (!socket) return;

    const onTransferRequest = ({ senderId, fileInfo }) => {
      setIncomingTransfer({ senderId, fileInfo });
    };

    const onTransferResponse = ({ accepted, receiverId }) => {
      if (!accepted) {
        toast.error("Transfer rejected by receiver");
        resetTransfer();
        return;
      }
      startSendingFile(receiverId);
    };

    const onSignal = async ({ senderId, signal }) => {
        if (signal.type === 'offer') {
            // Receiver got an offer!
            const pc = createPeerConnection(senderId);
            peerConnectionRef.current = pc;
            setupDataChannelForReceiving(pc);

            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('p2pSignal', { targetId: senderId, signal: answer, senderId: authUser._id });
        } 
        else if (signal.type === 'answer' && peerConnectionRef.current) {
            // Sender got an answer!
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        } 
        else if (signal.type === 'candidate' && peerConnectionRef.current) {
            // New ICE candidate to help connect the peers
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    };

    const onTransferCanceled = () => {
        toast.error("The transfer was canceled by the other peer.");
        resetTransfer(false);
    };

    socket.on('incomingP2PTransfer', onTransferRequest);
    socket.on('p2pTransferResponse', onTransferResponse);
    socket.on('p2pSignal', onSignal);
    socket.on('p2pTransferCanceled', onTransferCanceled);

    return () => {
      socket.off('incomingP2PTransfer', onTransferRequest);
      socket.off('p2pTransferResponse', onTransferResponse);
      socket.off('p2pSignal', onSignal);
      socket.off('p2pTransferCanceled', onTransferCanceled);
    };
  }, [socket, authUser, startSendingFile, createPeerConnection, resetTransfer]);

  return {
    incomingTransfer,
    activeTransfer,
    requestTransfer,
    acceptTransfer,
    rejectTransfer,
    resetTransfer
  };
};
