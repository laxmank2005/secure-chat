import React, { useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "react-hot-toast";
import { API_ENDPOINTS } from "../config/api";
import { 
  generateGroupKey, 
  encryptGroupKey, 
  deriveSharedSecret, 
  importPublicKey 
} from "../utils/crypto";
import { getPrivateKey } from "../utils/keyStore";
import { BsX, BsSearch, BsCheck } from "react-icons/bs";

const CreateGroupModal = ({ isOpen, onClose }) => {
  const { otherUsers, authUser } = useSelector(store => store.user);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter users based on search
  const filteredUsers = otherUsers?.filter(user => 
    !user.isGroup && (
      user.fullName.toLowerCase().includes(search.toLowerCase()) || 
      user.mobile?.includes(search)
    )
  ) || [];

  const handleToggleUser = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      return toast.error("Group name is required");
    }
    if (selectedUserIds.length < 1) {
      return toast.error("Select at least 1 other member");
    }

    setIsLoading(true);
    try {
      // 1. Get my private key from IndexedDB
      const myPrivateKey = await getPrivateKey(authUser._id);
      if (!myPrivateKey) {
        throw new Error("Could not unlock your private key. Please re-login.");
      }

      // 2. Generate a random AES-GCM group key
      const groupKey = await generateGroupKey();

      // 3. Prepare the list of participants (including myself)
      const allParticipants = [authUser, ...otherUsers.filter(u => selectedUserIds.includes(u._id))];
      const encryptedGroupKeys = [];

      // 4. Encrypt the group key for every participant
      for (const participant of allParticipants) {
        if (!participant.publicKey) {
          throw new Error(`${participant.fullName} does not have a public key setup.`);
        }
        
        // Import their public key
        const theirPublicKey = await importPublicKey(participant.publicKey);
        
        // Derive shared secret (My Private Key + Their Public Key)
        // If participant is myself, it derives My Private Key + My Public Key (which is valid ECDH)
        const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
        
        // Encrypt the AES group key using this shared secret
        const encryptedKey = await encryptGroupKey(groupKey, sharedSecret);

        encryptedGroupKeys.push({
          userId: participant._id,
          encryptedKey: encryptedKey,
          encryptedBy: authUser._id
        });
      }

      // 5. Send to backend
      const payload = {
        groupName: groupName.trim(),
        participants: allParticipants.map(u => u._id),
        encryptedGroupKeys
      };

      const authUserObj = JSON.parse(localStorage.getItem("authUser"));
      axios.defaults.withCredentials = true;
      const res = await axios.post(API_ENDPOINTS.MESSAGE.CREATE_GROUP, payload, {
        headers: { "Authorization": `Bearer ${authUserObj?.token}` }
      });

      if (res.data.success) {
        toast.success("Group created successfully!");
        onClose();
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message || error.response?.data?.message || "Failed to create group");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-stone-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-stone-800 flex items-center justify-between bg-gray-50 dark:bg-stone-900/50">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white font-inter">Create New Group</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-stone-300 rounded-full hover:bg-gray-200 dark:hover:bg-stone-800 transition">
            <BsX className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col gap-4">
          
          {/* Group Name Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5">Group Name</label>
            <input 
              type="text" 
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="E.g. Weekend Plan 🚀"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-inter"
            />
          </div>

          {/* Search Members */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5">
              Add Members <span className="text-gray-400 font-normal">({selectedUserIds.length} selected)</span>
            </label>
            
            <div className="relative mb-3">
              <BsSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-stone-700 bg-gray-50 dark:bg-stone-900/50 text-sm text-gray-900 dark:text-white outline-none focus:border-violet-500 transition-all"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-stone-800 rounded-xl bg-gray-50 dark:bg-stone-900/30">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">No users found</div>
              ) : (
                filteredUsers.map(user => {
                  const isSelected = selectedUserIds.includes(user._id);
                  return (
                    <div 
                      key={user._id}
                      onClick={() => handleToggleUser(user._id)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-100 dark:border-stone-800 last:border-0 transition-colors ${isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-gray-100 dark:hover:bg-stone-800'}`}
                    >
                      <div className="relative">
                        {user.profilePhoto ? (
                          <img src={user.profilePhoto} alt={user.fullName} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 font-bold flex items-center justify-center">
                            {user.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-violet-600 text-white rounded-full flex items-center justify-center border-2 border-white dark:border-stone-900">
                            <BsCheck className="text-sm" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate font-inter ${isSelected ? 'font-semibold text-violet-700 dark:text-violet-400' : 'font-medium text-gray-900 dark:text-white'}`}>
                          {user.fullName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{user.mobile}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-stone-800 bg-gray-50 dark:bg-stone-900/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-200 dark:hover:bg-stone-800 transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleCreateGroup}
            disabled={isLoading}
            className="flex items-center justify-center min-w-[100px] px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-violet-600/20 transition-all"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Create Group"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupModal;
