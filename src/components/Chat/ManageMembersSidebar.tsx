import { UserType, Group } from "@/types";
import { useState, useMemo, useEffect } from "react";
import { X, Search, UserPlus } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useUserStatuses } from "@/hooks/useUserStatuses";

interface Props {
  group: Group;
  users: UserType[];
  onAddMember: (memberIds: string[]) => void;
  onRemoveMember?: (memberId: string) => void;
  onClose: () => void;
}

export default function ManageMembersSidebar({ group, users, onAddMember, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>(users);
  // Real-time listener for users
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), snapshot => {
      const updatedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<UserType, "id">) }));
      setAllUsers(updatedUsers);
    });
    return () => unsubscribe();
  }, []);

  // Real-time user statuses
  const userIds = allUsers.map(u => u.id);
  const userStatuses = useUserStatuses(userIds);

  // Filter users (exclude group members)
  const filteredUsers = useMemo(
    () =>
      allUsers.filter(
        u => !group.members.includes(u.id) && u.username.toLowerCase().includes(search.toLowerCase())
      ),
    [allUsers, group.members, search]
  );

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds(prev => (prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]));
  };

  const handleAddMembers = () => {
    if (!selectedUserIds.length) return;
    onAddMember(selectedUserIds);
    setSelectedUserIds([]);
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 p-4">
      <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
        <h3 className="text-xl font-bold text-[#720455]">Add Members to {group.name}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-xl transition-colors">
          <X size={24} className="opacity-80 hover:opacity-100 transition" />
        </button>
      </div>

      <div className="mb-4 relative">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-300 dark:bg-gray-700 dark:text-gray-100 text-sm"
        />
        <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 opacity-80 hover:opacity-100 transition text-gray-400 dark:text-gray-300" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredUsers.length === 0 ? (
          <p className="text-sm text-gray-500">No users found.</p>
        ) : (
          <ul className="space-y-2">
            {filteredUsers.map(u => {
              const status = userStatuses[u.id] || "offline"; // real-time status
              const statusColor =
                status === "online"
                  ? "bg-green-500"
                  : status === "onBreak"
                  ? "bg-yellow-400"
                  : "bg-gray-400";

              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <img
                        src={u.avatar || "/default-avatar.png"}
                        alt={u.username}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusColor}`}
                      />
                    </div>
                    <span className="text-gray-800 dark:text-gray-100 font-medium">{u.username}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={() => toggleSelectUser(u.id)}
                    className="appearance-none w-5 h-5 rounded-full border border-gray-400 dark:border-gray-600 checked:bg-[#720455] checked:border-[#720455] relative before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-white before:content-['✔']"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedUserIds.length > 0 && (
        <div className="mt-4 p-2 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-gray-700 dark:text-gray-200 font-semibold mb-2">Selected Users</h4>
          <ul className="flex flex-wrap gap-2">
            {selectedUserIds.map(id => {
              const user = allUsers.find(u => u.id === id);
              if (!user) return null;
              return (
                <li key={id} className="flex items-center space-x-2 bg-[#F6F6F6] dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-2 py-1 rounded">
                  <span>{user.username}</span>
                  <button onClick={() => toggleSelectUser(id)} className="w-3 h-3 flex items-center justify-center bg-gray-600 dark:bg-gray-800 text-white rounded-full text-xs">×</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button onClick={handleAddMembers} className="mt-4 w-full py-2 bg-[#720455] hover:bg-[#910A67] text-white rounded font-semibold flex items-center justify-center space-x-2 transition">
        <UserPlus size={16} className="text-white" />
        <span className="text-xs leading-none">Add Selected Members</span>
      </button>
    </div>
  );
}
