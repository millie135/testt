"use client";

import { FC, useEffect, useState } from "react";
import { X, Users, UserPlus } from "lucide-react";
import { db } from "@/firebaseConfig";
import { doc, getDoc, collection, getDocs, updateDoc, onSnapshot } from "firebase/firestore";
import ManageMembersSidebar from "@/components/Chat/ManageMembersSidebar";
import { UserType, Group } from "@/types";

interface GroupUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  currentUserId: string;
  groupNum: number;
  userStatuses: { [userId: string]: "online" | "onBreak" | "offline" };
}

const GroupUserModal: FC<GroupUserModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  currentUserId,
  groupNum,
  userStatuses,
}) => {
  const [open, setOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>("member");
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [groupData, setGroupData] = useState<Group | null>(null);
  const [showManageSidebar, setShowManageSidebar] = useState(false);

  useEffect(() => { if (isOpen) setOpen(true); }, [isOpen]);

  // Fetch current user role
  useEffect(() => {
    if (!currentUserId) return;
    const fetchUserRole = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", currentUserId));
        if (userDoc.exists()) setUserRole(userDoc.data().role || "member");
      } catch (err) {
        console.error(err);
      }
    };
    fetchUserRole();
  }, [currentUserId]);

  // Fetch all users (real-time optional if you want, for now just once)
  useEffect(() => {
    const fetchUsers = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<UserType, "id">) })));
    };
    fetchUsers();
  }, []);

  // Real-time listener for group
  useEffect(() => {
    if (!groupId) return;
    const groupRef = doc(db, "groups", groupId);
    const unsubscribe = onSnapshot(groupRef, (snap) => {
      if (!snap.exists()) return;
      setGroupData(snap.data() as Group);
    });
    return () => unsubscribe();
  }, [groupId]);

  if (!isOpen) return null;

  const handleClose = () => { setOpen(false); setTimeout(onClose, 300); };

  const handleAddMember = async (memberIds: string[]) => {
    if (!groupData) return;
    const updatedMembers = Array.from(new Set([...groupData.members, ...memberIds]));
    await updateDoc(doc(db, "groups", groupId), { members: updatedMembers });
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!groupData) return;
    const updatedMembers = groupData.members.filter((id) => id !== memberId);
    await updateDoc(doc(db, "groups", groupId), { members: updatedMembers });
  };

  // Get admin
  const adminId = groupData?.createdBy;
  const admin = allUsers.find(u => u.id === adminId);

  

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40" onClick={handleClose} />

      {/* Modal */}
      <div className={`fixed top-0 right-0 w-[480px] h-full bg-white dark:bg-gray-800 shadow-xl flex flex-col z-50 transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2 truncate">
            <Users size={18} className="opacity-80" />
            <span>Members | {groupName}</span>
          </span>
          <button onClick={handleClose}><X size={22} className="opacity-80 hover:opacity-100 transition" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {userRole === "Leader" && (
            <div>
              <h3 className="text-gray-900 dark:text-gray-100 mb-2">Manage Members | {groupNum} members</h3>
              <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setShowManageSidebar(true)}>
                <span title="Add Member" className="bg-[#E7D4E1] w-8 h-8 flex items-center justify-center rounded-full cursor-pointer hover:bg-[#D8C1D3] transition">
                  <UserPlus size={18} className="text-[#910A67]" />
                </span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">Add People</span>
              </div>
            </div>
          )}

          {/* Admin */}
          {admin && (
            <div>
              <h3 className="text-gray-900 dark:text-gray-100">Group Admin</h3>
              <ul className="space-y-2 mt-2">
                <li className="flex items-center space-x-3 rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <div className="relative w-8 h-8">
                    <img src={admin.avatar || "/default-avatar.png"} alt={admin.username} className="w-8 h-8 rounded-full" />
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                      userStatuses[admin.id] === "online" ? "bg-green-500" :
                      userStatuses[admin.id] === "onBreak" ? "bg-yellow-500" : "bg-gray-400"
                    }`} />
                  </div>
                  <div className="flex-1 text-sm text-gray-900 dark:text-gray-100">{admin.username} <span className="text-xs text-blue-500">(Admin)</span></div>
                </li>
              </ul>
            </div>
          )}

          {/* Members */}
          <div>
            <h3 className="text-gray-900 dark:text-gray-100 mb-2">Group Members</h3>
            <ul className="space-y-2">
              {groupData?.members
                .filter(uid => uid !== adminId)
                .map(uid => {
                  const user = allUsers.find(u => u.id === uid);
                  if (!user) return null;
                  const status = userStatuses[uid] || "offline";

                  return (
                    <li key={uid} className="flex items-center justify-between space-x-3 rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <div className="flex items-center space-x-3">
                        <div className="relative w-8 h-8">
                          <img src={user.avatar || "/default-avatar.png"} alt={user.username} className="w-8 h-8 rounded-full" />
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                            status === "online" ? "bg-green-500" :
                            status === "onBreak" ? "bg-yellow-500" : "bg-gray-400"
                          }`} />
                        </div>
                        <div className="flex-1 text-sm text-gray-900 dark:text-gray-100">{user.username}</div>
                      </div>
                      {/* Remove button (only if current user is admin/leader) */}
                      {userRole === "Leader" && (
                        <button
                          onClick={() => handleRemoveMember(uid)}
                          className="text-red-500 text-xs hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      </div>

      {/* Manage Members Sidebar */}
      {showManageSidebar && groupData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="w-[500px] max-w-full h-[600px] bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
            <ManageMembersSidebar
              group={groupData}
              users={allUsers}
              //userStatuses={userStatuses}
              onAddMember={handleAddMember}
              onRemoveMember={handleRemoveMember}
              onClose={() => setShowManageSidebar(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default GroupUserModal;
