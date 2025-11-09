"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSubmit: (groupData: {
    name: string;
    avatar: string;
    createdBy: string;
    members: string[];
    createdAt: Date;
  }) => void;
}

export default function CreateGroupModal({ onClose, onSubmit }: Props) {
  const [groupName, setGroupName] = useState("");
  const [avatar, setAvatar] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    // Call parent submit with extra data
    onSubmit({
      name: groupName.trim(),
      avatar: avatar.trim() || `https://avatars.dicebear.com/api/identicon/${groupName}.svg`,
      createdBy: "",   // temporarily empty, parent will fill
      members: [],     // parent will fill
      createdAt: new Date(), // parent may override with serverTimestamp
    });

    // Reset form
    setGroupName("");
    setAvatar("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay with blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-md shadow-lg p-6 w-130 z-10">
        <h2
          className="text-xl font-semibold mb-5 text-center"
          style={{ color: "#3C0753" }}
        >
          Create New Group
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Name */}
          <div>
            <label
              className="block mb-1 text-sm font-medium"
              style={{ color: "#3C0753" }}
            >
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-sm text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3C0753]"
              required
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label
              className="block mb-1 text-sm font-medium"
              style={{ color: "#3C0753" }}
            >
              Avatar URL (optional)
            </label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="Enter avatar URL or leave blank"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-sm text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3C0753]"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-sm bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-sm text-white font-medium transition hover:opacity-90"
              style={{ backgroundColor: "#720455" }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
