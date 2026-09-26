import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import { toast } from "react-hot-toast";
import { API_ENDPOINTS } from "../config/api";
import { BsX, BsSearch, BsCheck, BsPencil, BsTrash, BsPersonPlus } from "react-icons/bs";
import { setSelectedUser, setOtherUsers } from "../redux/userSlice";
import {
  encryptGroupKey, 
  decryptGroupKey,
  deriveSharedSecret, 
  importPublicKey,
  generateGroupKey
} from "../utils/crypto";
import { getPrivateKey } from "../utils/keyStore";

const GroupInfoModal = ({ isOpen, onClose, groupId }) => {
  const { authUser, otherUsers } = useSelector(store => store.user);
  const dispatch = useDispatch();
  
  const [group, setGroup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedNewUserIds, setSelectedNewUserIds] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);

  useEffect(() => {
    if (isOpen && groupId) {
      fetchGroupInfo();
    }
  }, [isOpen, groupId]);

  const fetchGroupInfo = async () => {
    try {
      setIsLoading(true);
      axios.defaults.withCredentials = true;
      const res = await axios.get(API_ENDPOINTS.MESSAGE.GET_GROUP_INFO(groupId), {
        headers: { Authorization: `Bearer ${authUser?.token}` }
      });
      if (res.data.success) {
        setGroup(res.data.group);
        setEditName(res.data.group.groupName);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load group details.");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const isAdmin = group?.groupAdmins?.includes(authUser?._id);

  const handleUpdateGroup = async () => {
    if (!editName.trim()) return toast.error("Name cannot be empty");
    try {
      setActionLoading(true);
      const res = await axios.put(API_ENDPOINTS.MESSAGE.UPDATE_GROUP(groupId), 
        { groupName: editName },
        { headers: { Authorization: `Bearer ${authUser?.token}` } }
      );
      if (res.data.success) {
        toast.success("Group updated");
        setGroup(res.data.group);
        setIsEditing(false);
        // We also need to update selectedUser in Redux so the chat header updates
        dispatch(setSelectedUser({ ...group, groupName: editName, fullName: editName }));
      }
    } catch (error) {
      toast.error("Failed to update group");
    } finally {
      setActionLoading(false);
    }
  };

  const executeRemoveMember = async () => {
    if (!memberToRemove) return;
    const memberId = memberToRemove._id;
    try {
      setActionLoading(true);

      let payload = { memberId };

      // Forward Secrecy Key Rotation: If an admin is removing someone else, rotate the group's AES key
      if (isAdmin && memberId !== authUser._id) {
        // 1. Generate new AES group key
        const newGroupKey = await generateGroupKey();
        const myPrivateKey = await getPrivateKey(authUser._id.toString());
        
        // 2. Encrypt for all remaining members (including myself)
        const remainingParticipants = group.participants.filter(p => p._id !== memberId);
        const newEncryptedGroupKeys = [];
        
        for (const p of remainingParticipants) {
          if (!p.publicKey) throw new Error(`${p.fullName} is missing a public key!`);
          const theirPublicKeyObj = await importPublicKey(p.publicKey);
          const theirSharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKeyObj);
          const encryptedKey = await encryptGroupKey(newGroupKey, theirSharedSecret);
          newEncryptedGroupKeys.push({ userId: p._id, encryptedKey, encryptedBy: authUser._id });
        }
        
        payload.newEncryptedGroupKeys = newEncryptedGroupKeys;
      }

      const res = await axios.post(API_ENDPOINTS.MESSAGE.REMOVE_GROUP_MEMBER(groupId), 
        payload,
        { headers: { Authorization: `Bearer ${authUser?.token}` } }
      );
      if (res.data.success) {
        toast.success("Member removed");
        setGroup(res.data.group);
        // If I removed myself, close chat and remove from sidebar
        if (memberId === authUser._id) {
          dispatch(setSelectedUser(null));
          // Remove from the sidebar list locally
          const updatedOtherUsers = otherUsers.filter(u => u._id !== groupId);
          dispatch(setOtherUsers(updatedOtherUsers));
          onClose();
        }
      }
    } catch (error) {
      toast.error("Failed to remove member");
    } finally {
      setActionLoading(false);
      setMemberToRemove(null);
    }
  };

  const handleUpdateAdmin = async (memberId, action) => {
    try {
      setActionLoading(true);
      const res = await axios.put(API_ENDPOINTS.MESSAGE.UPDATE_GROUP_ADMIN(groupId), 
        { memberId, action },
        { headers: { Authorization: `Bearer ${authUser?.token}` } }
      );
      if (res.data.success) {
        toast.success(`Admin role updated`);
        setGroup(res.data.group);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update admin role");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedNewUserIds.length === 0) return toast.error("Select members to add");
    
    try {
      setActionLoading(true);
      // CRYPTO MAGIC TO ADD MEMBERS
      // 1. Get My Private Key
      const myPrivateKey = await getPrivateKey(authUser._id.toString());
      if (!myPrivateKey) throw new Error("Could not unlock your private key.");

      // 2. Get my encrypted AES key segment
      const myKeyObj = group.encryptedGroupKeys.find(k => k.userId.toString() === authUser._id.toString());
      if (!myKeyObj || !group.encryptorPublicKey) throw new Error("Cannot find group keys to invite new members.");

      // 3. Decrypt the AES Group Key
      if (!group.encryptorPublicKey) throw new Error("Missing encryptor public key");
      const encryptorPublicKey = await importPublicKey(group.encryptorPublicKey);
      const mySharedSecret = await deriveSharedSecret(myPrivateKey, encryptorPublicKey);
      const groupKey = await decryptGroupKey(myKeyObj.encryptedKey, mySharedSecret);

      // 4. Encrypt the Group Key for each new member
      const newEncryptedGroupKeys = [];
      const newParticipants = otherUsers.filter(u => selectedNewUserIds.includes(u._id));
      
      for (const p of newParticipants) {
        if (!p.publicKey) throw new Error(`${p.fullName} has no public key. Cannot add to E2EE group.`);
        const theirPublicKeyObj = await importPublicKey(p.publicKey);
        const theirSharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKeyObj);
        const newEncryptedKey = await encryptGroupKey(groupKey, theirSharedSecret);
        newEncryptedGroupKeys.push({ userId: p._id, encryptedKey: newEncryptedKey, encryptedBy: authUser._id });
      }

      // 5. Send to backend
      const res = await axios.post(API_ENDPOINTS.MESSAGE.ADD_GROUP_MEMBER(groupId), 
        { 
          newParticipants: selectedNewUserIds,
          encryptedGroupKeys: newEncryptedGroupKeys
        },
        { headers: { Authorization: `Bearer ${authUser?.token}` } }
      );

      if (res.data.success) {
        toast.success("Members added!");
        setGroup(res.data.group);
        setIsAddingMode(false);
        setSelectedNewUserIds([]);
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to add members");
    } finally {
      setActionLoading(false);
    }
  };

  // Helper arrays
  const currentMemberIds = group?.participants?.map(p => p._id) || [];
  const addableUsers = otherUsers?.filter(u => !u.isGroup && !currentMemberIds.includes(u._id) && (
    u.fullName.toLowerCase().includes(search.toLowerCase())
  )) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-0 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-stone-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-stone-800 flex items-center justify-between bg-gray-50 dark:bg-stone-900/50">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white font-inter">Group Info</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-stone-300 rounded-full hover:bg-gray-200 dark:hover:bg-stone-800 transition">
            <BsX className="text-xl" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"/></div>
        ) : !group ? (
          <div className="p-10 text-center text-gray-500">Group not found</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            
            {/* Group Profile / Header */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-24 h-24 rounded-full bg-violet-100 text-violet-600 text-3xl font-bold flex items-center justify-center mb-4">
                {group.groupName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              
              {isEditing ? (
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <input 
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                  <button onClick={handleUpdateGroup} disabled={actionLoading} className="p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
                    <BsCheck />
                  </button>
                  <button onClick={() => setIsEditing(false)} className="p-2 bg-gray-200 dark:bg-stone-700 text-gray-600 dark:text-gray-300 rounded-lg">
                    <BsX />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{group.groupName}</h3>
                  {isAdmin && (
                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-gray-400 hover:text-violet-500 rounded-full hover:bg-violet-50 dark:hover:bg-violet-900/30">
                      <BsPencil />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-500 mt-1">{group.participants.length} members</p>
            </div>

            {/* Content: Either Members List or Add Member view */}
            {isAddingMode ? (
              <div className="flex flex-col h-[300px]">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Add New Members</h4>
                  <button onClick={() => setIsAddingMode(false)} className="text-sm text-violet-600 hover:underline">Cancel</button>
                </div>
                
                <div className="relative mb-3">
                  <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-stone-700 bg-gray-50 dark:bg-stone-800 text-gray-900 dark:text-white outline-none focus:border-violet-500"
                  />
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-stone-800/50 rounded-xl border border-gray-100 dark:border-stone-800">
                  {addableUsers.length === 0 ? (
                    <p className="p-4 text-center text-sm text-gray-500">No users found</p>
                  ) : addableUsers.map(u => (
                    <div key={u._id} onClick={() => setSelectedNewUserIds(prev => prev.includes(u._id) ? prev.filter(id => id !== u._id) : [...prev, u._id])} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-800">
                      <div className="w-8 h-8 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center font-bold text-xs">{u.fullName?.charAt(0) || "?"}</div>
                      <div className="flex-1"><p className="text-sm font-semibold dark:text-white">{u.fullName}</p></div>
                      {selectedNewUserIds.includes(u._id) && <div className="text-violet-600"><BsCheck className="text-xl" /></div>}
                    </div>
                  ))}
                </div>
                
                <button 
                  onClick={handleAddMembers} disabled={actionLoading || selectedNewUserIds.length === 0}
                  className="mt-4 w-full py-2.5 bg-violet-600 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {actionLoading ? "Adding..." : `Add ${selectedNewUserIds.length} Members`}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wider">Members</h4>
                  {isAdmin && (
                    <button onClick={() => setIsAddingMode(true)} className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 px-3 py-1.5 rounded-lg transition-colors">
                      <BsPersonPlus /> Add
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {group.participants.map(member => {
                    if (!member) return null;
                    return (
                    <div key={member._id} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-stone-800/50 rounded-lg group/member transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        {member.profilePhoto ? (
                          <img src={member.profilePhoto} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                            {member.fullName?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {member.fullName || "Unknown User"} {member._id === authUser._id && "(You)"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {group.groupAdmins.includes(member._id) ? "Admin" : "Member"}
                          </p>
                        </div>
                      </div>
                      
                      {/* Actions: Admin can promote/demote/remove others. Anyone can remove themselves (leave) */}
                      <div className="flex items-center gap-2">
                        {isAdmin && member._id !== authUser._id && (
                          <button
                            onClick={() => handleUpdateAdmin(member._id, group.groupAdmins.includes(member._id) ? 'demote' : 'promote')}
                            disabled={actionLoading}
                            className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 hover:bg-gray-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-gray-700 dark:text-stone-300 sm:opacity-0 sm:group-hover/member:opacity-100 transition-all"
                          >
                            {group.groupAdmins.includes(member._id) ? "Dismiss Admin" : "Make Admin"}
                          </button>
                        )}
                        
                        {(isAdmin && member._id !== authUser._id) || (member._id === authUser._id) ? (
                          <button 
                            onClick={() => setMemberToRemove(member)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg sm:opacity-0 sm:group-hover/member:opacity-100 transition-all"
                            title={member._id === authUser._id ? "Leave Group" : "Remove Member"}
                          >
                            {member._id === authUser._id ? <span className="text-xs font-semibold px-2">Leave</span> : <BsTrash />}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Custom Remove Confirmation Overlay */}
            {memberToRemove && (
              <div className="absolute inset-0 bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200 rounded-2xl">
                <div className="bg-white dark:bg-stone-800 border border-gray-100 dark:border-stone-700 rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BsTrash className="text-2xl" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                    {memberToRemove._id === authUser._id ? "Leave & Delete Group?" : "Remove Member?"}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-stone-400 mb-6">
                    {memberToRemove._id === authUser._id 
                      ? "Are you sure you want to leave? This group will be permanently removed from your chat list." 
                      : `Are you sure you want to remove ${memberToRemove.fullName} from the group?`}
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setMemberToRemove(null)}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-stone-700 dark:hover:bg-stone-600 text-gray-700 dark:text-stone-300 font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={executeRemoveMember}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-red-600/20 flex items-center justify-center disabled:opacity-50"
                    >
                      {actionLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : "Confirm"}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default GroupInfoModal;
