import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { setMessages, appendMessages } from "../redux/messageSlice";
import { API_ENDPOINTS } from "../config/api";
import { importPublicKey, deriveSharedSecret, decryptMessage, decryptGroupKey } from "../utils/crypto";
import { getPrivateKey } from "../utils/keyStore";

const useGetMessages = () => {
  const { selectedUser } = useSelector((store) => store.user);
  const dispatch = useDispatch();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  const fetchMessages = useCallback(async (pageNum, isInitial = false) => {
    if (!selectedUser?._id || loadingRef.current) return;
    
    loadingRef.current = true;
    if (!isInitial) setIsLoadingMore(true);

    try {
      const authUser = JSON.parse(localStorage.getItem("authUser"));
      axios.defaults.withCredentials = true;
      const res = await axios.get(
        `${API_ENDPOINTS.MESSAGE.GET(selectedUser._id)}?page=${pageNum}&limit=30`, {
          headers: {
            "Authorization": `Bearer ${authUser?.token}`
          }
        }
      );
      
      let messages = res.data.messages || [];
      const totalPages = res.data.totalPages || 1;
      
      setHasMore(pageNum < totalPages);
      
      const myPrivateKey = authUser?._id ? await getPrivateKey(authUser._id.toString()) : null;

      if (messages.length > 0 && selectedUser?.isGroup && selectedUser.encryptedGroupKeys && myPrivateKey) {
          try {
            const myKeyObj = selectedUser.encryptedGroupKeys.find(k => k.userId.toString() === authUser._id.toString());
            if (myKeyObj && selectedUser.encryptorPublicKey) {
                const encryptorPublicKey = await importPublicKey(selectedUser.encryptorPublicKey);
                const sharedSecret = await deriveSharedSecret(myPrivateKey, encryptorPublicKey);
                const groupKey = await decryptGroupKey(myKeyObj.encryptedKey, sharedSecret);

                messages = await Promise.all(
                    messages.map(async (msg) => {
                      if (msg.isEncrypted) {
                        try {
                          const decryptedText = await decryptMessage(msg.message, groupKey);
                          return { ...msg, message: decryptedText };
                        } catch (e) {
                          return { ...msg, message: "[Encrypted group message - could not decrypt]" };
                        }
                      }
                      return msg;
                    })
                  );
            }
          } catch (cryptoErr) {
              console.error("Failed to decrypt group message history:", cryptoErr);
          }
      } else if (messages.length > 0 && selectedUser?.publicKey && myPrivateKey) {
        try {
          const theirPublicKey = await importPublicKey(selectedUser.publicKey);
          const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
          
          messages = await Promise.all(
            messages.map(async (msg) => {
              if (msg.isEncrypted) {
                try {
                  const decryptedText = await decryptMessage(msg.message, sharedSecret);
                  return { ...msg, message: decryptedText };
                } catch (e) {
                  return { ...msg, message: "[Encrypted message - could not decrypt]" };
                }
              }
              return msg;
            })
          );
        } catch (cryptoErr) {
          console.error("Failed to decrypt message history:", cryptoErr);
        }
      } else {
        // If we don't have the keys but the messages are encrypted, hide the raw base64
        messages = messages.map(msg => {
          if (msg.isEncrypted) {
            return { ...msg, message: "[Encrypted message - missing private key]" };
          }
          return msg;
        });
      }

      messages = messages.map(msg => ({
        ...msg,
        senderId: msg.senderId?.toString?.() ?? msg.senderId,
        receiverId: msg.receiverId?.toString?.() ?? msg.receiverId,
      }));

      if (isInitial) {
        dispatch(setMessages(messages));
      } else {
        dispatch(appendMessages(messages));
      }
      
      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching messages:", error);
      if (isInitial) dispatch(setMessages([]));
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [selectedUser?._id, selectedUser?.publicKey, dispatch]);

  useEffect(() => {
    if (selectedUser?._id) {
      setHasMore(true);
      fetchMessages(1, true);
    }
  }, [selectedUser?._id, fetchMessages]);

  const fetchMoreMessages = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      fetchMessages(page + 1, false);
    }
  }, [hasMore, page, fetchMessages]);

  return { fetchMoreMessages, hasMore, isLoadingMore };
};

export default useGetMessages;
