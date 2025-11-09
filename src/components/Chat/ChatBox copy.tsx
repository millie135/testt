"use client";

import { FC, useEffect, useState, useRef } from "react";
import { auth, db, rtdb, storage } from "@/firebaseConfig";
import { ref as rtdbRef, onValue } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocs
} from "firebase/firestore";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import ThreadChatBox from "./ThreadChatBox";

// ---- TYPES ----
interface ChatBoxProps {
  chatWithUserId: string;
  chatWithUsername?: string;
  currentUserId: string;
  isGroup?: boolean;
  groupMembers?: string[];
  onOpenThread?: (message: any) => void;
  threadState?: { messageId: string; message: Message } | null;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: any;
  imageUrl: string | null;
  reactions?: Record<string, string>;
  to: string;
  readBy?: Record<string, boolean>;
  threadCount?: number;
}

interface UserProfile {
  id?: string;
  username: string;
  avatar: string;
  onlineStatus?: "online" | "onBreak" | "offline";
}

// ---- CONSTANTS ----
const emojiReactions = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const emojiMap: Record<string, string> = {
  ":)": "😊",
  ":D": "😄",
  ":(": "☹️",
  ";)": "😉",
  ":P": "😛",
  "<3": "❤️",
  ":O": "😮",
  ":/": "😕",
};

const parseEmojis = (text: string) => {
  let parsed = text;
  Object.keys(emojiMap).forEach((shortcut) => {
    const regex = new RegExp(escapeRegExp(shortcut), "g");
    parsed = parsed.replace(regex, emojiMap[shortcut]);
  });
  return parsed;
};

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ChatBox: FC<ChatBoxProps> = ({
  chatWithUserId,
  currentUserId,
  isGroup = false,
  groupMembers = [],
  onOpenThread
}) => {
  // ---- STATE ----
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [groupMemberProfiles, setGroupMemberProfiles] = useState<UserProfile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: "online" | "onBreak" | "offline" }>({});

  // ---- REFS ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const memberListRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // ---- HELPERS ----
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const input = document.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newText = message.slice(0, start) + emojiData.emoji + message.slice(end);
    setMessage(newText);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length);
    }, 0);
  };

  // In ChatBox component
  const handleReplyClick = (message: Message) => {
    onOpenThread?.(message); 
    setSelectedMessageId(message.id);
  };

  // ---- EFFECT: CLOSE EMOJI / MEMBERS ON OUTSIDE CLICK ----
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) setShowEmojiPicker(false);

      if (
        memberListRef.current &&
        !memberListRef.current.contains(event.target as Node)
      ) setShowMembers(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---- REFS TO TRACK UNSUBSCRIBES ----
  const profileUnsubRef = useRef<(() => void) | null>(null);
  const statusUnsubRef = useRef<(() => void) | null>(null);

  // ---- EFFECT: FETCH PROFILE AND STATUS ----
  // Fetch profile first
useEffect(() => {
  if (!currentUserId || !chatWithUserId) return;

  const profileRef = doc(db, "users", chatWithUserId);
  const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data() as UserProfile;
      setProfile({
        id: chatWithUserId,
        username: data.username,
        avatar: data.avatar,
        onlineStatus: "offline", // default until real-time status loads
      });
    }
  });

  // Listen for status updates
  const statusRef = rtdbRef(rtdb, `/status/${chatWithUserId}`);
  const unsubscribeStatus = onValue(statusRef, (snap) => {
    const val = snap.val();
    if (!val) return;

    let status: "online" | "onBreak" | "offline" = "offline";
    if (val === true || val?.state === "online") status = "online";
    else if (val === "break" || val?.state === "break" || val?.state === "onBreak") status = "onBreak";

    setProfile(prev => {
      if (!prev) return prev; // profile not loaded yet
      return { ...prev, onlineStatus: status };
    });
  });

  return () => {
    unsubscribeProfile();
    unsubscribeStatus();
  };
}, [chatWithUserId, currentUserId]);


  

  // ---- EFFECT: GROUP MEMBER STATUS ----
  useEffect(() => {
    if (!isGroup || !groupMembers.length) return;

    const unsubscribers: (() => void)[] = [];
    groupMembers.forEach((memberId) => {
      const statusRef = rtdbRef(rtdb, `/status/${memberId}`);
      const unsubscribe = onValue(statusRef, (snap) => {
        const status = snap.val() || "offline";
        setUserStatuses(prev => ({ ...prev, [memberId]: status }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach(fn => fn());
  }, [isGroup, groupMembers]);

  // ---- EFFECT: FETCH CURRENT USER PROFILE ----
  useEffect(() => {
    if (!currentUserId) return;
    const userRef = doc(db, "users", currentUserId);
    const unsubscribe = onSnapshot(userRef, docSnap => {
      if (docSnap.exists()) setCurrentUserProfile(docSnap.data() as UserProfile);
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // ---- EFFECT: FETCH GROUP MEMBER PROFILES ----
  useEffect(() => {
    if (!isGroup || !groupMembers.length) return;
    const fetchProfiles = async () => {
      const profiles: UserProfile[] = [];
      for (const memberId of groupMembers) {
        const docSnap = await getDoc(doc(db, "users", memberId));
        if (docSnap.exists()) profiles.push({ id: memberId, ...(docSnap.data() as UserProfile) });
      }
      setGroupMemberProfiles(profiles);
    };
    fetchProfiles();
  }, [isGroup, groupMembers]);

  // ---- EFFECT: LISTEN TO MESSAGES (SAFE GUARD + CLEANUP) ----
  useEffect(() => {
    if (!currentUserId || !chatWithUserId) return;

    let threadUnsubscribers: (() => void)[] = [];

    const messagesRef = isGroup
      ? collection(db, "groupChats", chatWithUserId, "messages")
      : collection(db, "chats", currentUserId, chatWithUserId);

    const q = query(messagesRef, orderBy("timestamp"));

    const unsubscribe = onSnapshot(q, async snapshot => {
      const msgs: Message[] = [];

      // Cleanup previous thread listeners before adding new
      threadUnsubscribers.forEach(fn => fn());
      threadUnsubscribers = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Omit<Message, "id">;
        const messageId = docSnap.id;

        const threadRef = isGroup
          ? collection(db, "groupChats", chatWithUserId, "messages", messageId, "threads")
          : collection(db, "chats", currentUserId, chatWithUserId, messageId, "threads");

        const threadSnapshot = await getDocs(threadRef);
        const threadUnsub = onSnapshot(threadRef, threadSnap => {
          const count = threadSnap.size;
          setMessages(prev =>
            prev.map(m => m.id === messageId ? { ...m, threadCount: count } : m)
          );
        });
        threadUnsubscribers.push(threadUnsub);

        msgs.push({ id: messageId, ...data, threadCount: threadSnapshot.size });
      }

      setMessages(msgs);

      // Mark as read
      let newUnread = 0;
      const batch: Promise<any>[] = [];
      msgs.forEach(msg => {
        if (!msg.readBy?.[currentUserId] && msg.senderId !== currentUserId) newUnread++;
        if (!msg.readBy?.[currentUserId]) {
          const msgRef = isGroup
            ? doc(db, "groupChats", chatWithUserId, "messages", msg.id)
            : doc(db, "chats", currentUserId, chatWithUserId, msg.id);
          batch.push(setDoc(msgRef, { readBy: { ...(msg.readBy || {}), [currentUserId]: true } }, { merge: true }));
        }
      });
      setUnreadCount(newUnread);
      if (batch.length) await Promise.all(batch);
    });

    // Cleanup on unmount or logout
    return () => {
      unsubscribe();
      threadUnsubscribers.forEach(fn => fn());
    };
  }, [chatWithUserId, currentUserId, isGroup]);

  useEffect(scrollToBottom, [messages]);

  // ---- SEND MESSAGE ----
  const sendMessage = async (text?: string, imageUrl?: string) => {
    if (!text?.trim() && !imageUrl) return;
    if (!currentUserId) return; // guard on logout

    const senderSnap = await getDoc(doc(db, "users", currentUserId));
    const senderData = senderSnap.data();
    const senderName = senderData?.username || "Unknown";
    const senderAvatar = senderData?.avatar || `https://avatars.dicebear.com/api/identicon/${currentUserId}.svg`;

    const messageRef = isGroup
      ? doc(collection(db, "groupChats", chatWithUserId, "messages"))
      : doc(collection(db, "chats", currentUserId, chatWithUserId));

    const messageData: Message = {
      id: messageRef.id,
      text: text || "",
      senderId: currentUserId,
      senderName,
      senderAvatar,
      timestamp: serverTimestamp(),
      imageUrl: imageUrl ?? null,
      reactions: {},
      to: chatWithUserId,
      readBy: { [currentUserId]: true },
    };

    try {
      if (isGroup) await setDoc(messageRef, messageData);
      else await Promise.all([
        setDoc(messageRef, messageData),
        setDoc(doc(db, "chats", chatWithUserId, currentUserId, messageRef.id), messageData),
      ]);
      setMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // ---- REACTIONS ----
  const toggleReaction = async (msg: Message, emoji: string) => {
    const messageRef = isGroup
      ? doc(db, "groupChats", chatWithUserId, "messages", msg.id)
      : doc(db, "chats", currentUserId, chatWithUserId, msg.id);

    const updated = { ...(msg.reactions || {}) };
    if (updated[currentUserId] === emoji) delete updated[currentUserId];
    else updated[currentUserId] = emoji;

    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: updated } : m));

    try {
      await setDoc(messageRef, { reactions: updated }, { merge: true });
    } catch (err) {
      console.error("Failed to update reactions:", err);
    }
  };

  // ---- IMAGE UPLOAD ----
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const fileRef = storageRef(storage, `chatImages/${currentUserId}-${Date.now()}-${file.name}`);
    setUploading(true);
    try {
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await sendMessage("", url);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // ---- RENDER ----
  if (!profile || !currentUserProfile) return null;

  return (
    <div className="flex flex-col h-full max-h-screen bg-white dark:bg-gray-800 shadow-md rounded-md border border-gray-200 dark:border-gray-700 relative">
      {/* HEADER */}
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 justify-between">
        <div className="flex items-center">
          <img src={profile.avatar || "/default-avatar.png"} alt={profile.username} className="w-10 h-10 rounded-full mr-3" />
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">{profile.username}</div>
            
            {!isGroup && (
              <div className={`text-sm ${
                profile.onlineStatus === "online" ? "text-green-500" :
                profile.onlineStatus === "onBreak" ? "text-yellow-400" :
                "text-gray-500"
              }`}>
                {profile.onlineStatus === "online" ? "Online" :
                 profile.onlineStatus === "onBreak" ? "On Break" :
                 "Offline"}
              </div>
            )}
            {isGroup && (
              <div className="flex dark:border-gray-700">
                <div className="flex items-center space-x-2">
                  <div
                    className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer relative"
                    onClick={() => setShowMembers(prev => !prev)}
                  >
                    {groupMemberProfiles.length} members
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-4 bg-red-500 text-white text-xs font-bold rounded-full px-2">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex -space-x-2">
                  {groupMemberProfiles.map((member) => {
                    //const status = userStatuses[member.id!] || "offline";
                    const rawStatus = userStatuses[member.id!]; // could be anything
                    const status = typeof rawStatus === "string" ? rawStatus : "offline";

                    return (
                      <img
                        key={member.id}
                        src={member.avatar || `https://avatars.dicebear.com/api/identicon/${member.id}.svg`}
                        alt={member.username}
                        className={`w-6 h-6 rounded-full border-2 border-white ${
                          status === "online" ? "ring-2 ring-green-500" :
                          status === "onBreak" ? "ring-2 ring-yellow-400" :
                          "ring-2 ring-gray-400"
                        }`}
                        title={status.charAt(0).toUpperCase() + status.slice(1)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => {
          const isSender = msg.senderId === currentUserId;
          const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(); 
          return (
            <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"} items-end`}>
              {!isSender && (
                <img
                  src={msg.senderAvatar || "/default-avatar.png"}
                  alt={msg.senderName}
                  className="w-8 h-8 rounded-full mr-2"
                />
              )}
              <div className="flex flex-col max-w-xs relative">
                <div
                  className={`px-4 py-2 rounded-lg break-words cursor-pointer ${isSender ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"}`}
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    setHoveredMessageId(msg.id);
                  }}
                  onMouseLeave={() => {
                    hoverTimeoutRef.current = setTimeout(() => {
                      // only hide if not hovering popup
                      if (!popupRef.current?.matches(':hover')) {
                        setHoveredMessageId(null);
                      }
                    }, 300);
                  }}
                >
                  {msg.text}
                </div>

                {/* Timestamp */}
                <div className={`text-xs text-gray-500 mt-1 ${isSender ? "text-right" : "text-left"}`}>
                  {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                {hoveredMessageId === msg.id && (
                  <div
                  ref={popupRef}
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                      setHoveredMessageId(msg.id);
                    }}
                    onMouseLeave={() => {
                      hoverTimeoutRef.current = setTimeout(() => {
                        // only close if not hovering message
                        const isStillOnMessage = messageRefs.current[msg.id]?.matches(':hover');
                        if (!isStillOnMessage) {
                          setHoveredMessageId(null);
                        }
                      }, 300);
                    }} 
                    className={`absolute ${isSender ? "right-0" : "left-0"} flex bg-white shadow-lg rounded-full p-1 z-50 -top-10`}>
                    {emojiReactions.map((emoji) => (
                      <button
                        key={emoji}
                        className="text-lg px-1 hover:scale-125 transition-transform"
                        onClick={() => toggleReaction(msg, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      className="text-xs ml-2 text-blue-500 hover:underline"
                      onClick={() => handleReplyClick(msg)}
                    >
                      Reply
                    </button>
                  </div>
                )}

                {(msg.threadCount ?? 0) > 0 && (
                  <button
                    className="text-blue-500 text-xs mt-1 hover:underline"
                    //onClick={() => setSelectedMessageId(msg.id)}
                    onClick={() => onOpenThread?.(msg)}
                  >
                    {msg.threadCount} {msg.threadCount! > 1 ? "Replies" : "Reply"}
                  </button>
                )}

                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex space-x-1 mt-1">
                    {Object.entries(msg.reactions).map(([userId, emoji]) => (
                      <span key={userId} className="text-sm px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full">{emoji}</span>
                    ))}
                  </div>
                )}

                
              </div>
              {isSender && (
                <img
                  src={msg.senderAvatar || "/default-avatar.png"}
                  alt={msg.senderName}
                  className="w-8 h-8 rounded-full ml-2"
                />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="relative w-full">
        <div className="relative w-full flex items-center border-t border-gray-200 dark:border-gray-700 p-3">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage(message)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <button type="button" ref={emojiButtonRef} onClick={() => setShowEmojiPicker(prev => !prev)} className="mr-2 text-xl">😀</button>
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="absolute bottom-12 left-0 z-50 shadow-lg" style={{ minWidth: "280px" }}>
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
          <label className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 px-3 py-2 rounded cursor-pointer text-sm">
            {uploading ? "Uploading..." : "📷"}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <button onClick={() => sendMessage(message)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
            Send
          </button>
        </div>
      </div>
</div>
  );
};

export default ChatBox;