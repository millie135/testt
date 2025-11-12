"use client";

import { FC, useEffect, useState, useRef } from "react";
import { auth, db, rtdb } from "@/firebaseConfig";
import { ref as rtdbRef, onValue } from "firebase/database";
//import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocs,
  limit
} from "firebase/firestore";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
//import ThreadChatBox from "./ThreadChatBox";
import { MessageSquareReply, LockKeyhole, User, SendHorizontal, Smile } from "lucide-react";
import GroupUserModal from "@/components/GroupUserModal";

import { useUserStatuses } from "@/hooks/useUserStatuses";

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
  createdBy?: string;
  createdAt?: Date | string;
}

// ---- CONSTANTS ----
const emojiReactions = ["👍", "❤️", "😮", "✅", "🙏"];

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
  const [unreadCount, setUnreadCount] = useState(0);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: "online" | "onBreak" | "offline" }>({});
  //const [showUserModal, setShowUserModal] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{ createdBy?: string; createdAt?: any } | null>(null);

  // ---- REFS ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const memberListRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const messageRef = useRef<HTMLDivElement>(null); // define the ref
  const [groupCreatorName, setGroupCreatorName] = useState<string>("");
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // inside ChatBox component
  const userIds = isGroup ? groupMembers : [chatWithUserId]; 
  const statuses = useUserStatuses(userIds);

  // ---- HELPERS ----
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    if (!messageRef.current) return;

    // Focus the contentEditable div
    messageRef.current.focus();

    const sel = window.getSelection();
    if (!sel) return;

    let range: Range;
    if (sel.rangeCount === 0) {
      // Create a new range at the end if nothing is selected
      range = document.createRange();
      range.selectNodeContents(messageRef.current);
      range.collapse(false); // collapse to end
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      range = sel.getRangeAt(0);
    }

    // Insert emoji
    const emojiNode = document.createTextNode(emojiData.emoji);
    range.deleteContents();
    range.insertNode(emojiNode);

    // Move cursor after inserted emoji
    range.setStartAfter(emojiNode);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

    // Update state
    setMessage(messageRef.current.innerText);
  };

  const chatStartTime = messages.length
    ? messages[0].timestamp?.toDate
      ? messages[0].timestamp.toDate().toLocaleString()
      : new Date().toLocaleString()
    : new Date().toLocaleString();

  // In ChatBox component
  const handleReplyClick = (msg: Message) => {
    onOpenThread?.(msg);
    setSelectedMessageId(msg.id);

    // Subscribe to thread count dynamically
    const threadRef = isGroup
      ? collection(db, "groupChats", chatWithUserId, "messages", msg.id, "threads")
      : collection(db, "chats", currentUserId, chatWithUserId, msg.id, "threads");

    const unsubscribe = onSnapshot(threadRef, (snap) => {
      const count = snap.size;
      setMessages(prev =>
        prev.map(m => m.id === msg.id ? { ...m, threadCount: count } : m)
      );
    });

    // Clean up on thread close
    return () => unsubscribe();
  };


  const applyFormat = (type: "bold" | "italic" | "strike") => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    let tag: string;
    switch (type) {
      case "bold":
        tag = "b";
        break;
      case "italic":
        tag = "i";
        break;
      case "strike":
        tag = "s";
        break;
    }

    const selectedText = range.extractContents();
    const wrapper = document.createElement(tag);
    wrapper.appendChild(selectedText);
    range.insertNode(wrapper);

    // Move cursor after inserted node
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    // Update state
    setMessage(messageRef.current?.innerText || "");
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
  useEffect(() => {
    if (!currentUserId || !chatWithUserId) return;

    if (isGroup) {
      const groupRef = doc(db, "groups", chatWithUserId);
      const unsubscribe = onSnapshot(groupRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as { name: string; avatar: string; createdBy: string };
          setProfile({
            username: data.name,
            avatar: data.avatar || `https://avatars.dicebear.com/api/identicon/${chatWithUserId}.svg`,
          });

          // Only fetch creator if createdBy exists
          if (data.createdBy) {
            try {
              const creatorSnap = await getDoc(doc(db, "users", data.createdBy));
              if (creatorSnap.exists()) {
                const creatorData = creatorSnap.data();
                setGroupCreatorName(creatorData?.username || "Unknown");
              } else {
                setGroupCreatorName("Unknown");
              }
            } catch (err) {
              console.error("Failed to fetch group creator:", err);
              setGroupCreatorName("Unknown");
            }
          } else {
            setGroupCreatorName("Unknown");
          }
        }
      });
      profileUnsubRef.current = unsubscribe;
      return () => profileUnsubRef.current?.();
    }

    const setupPrivateListeners = () => {
      const profileRef = doc(db, "users", chatWithUserId);
      const statusRef = rtdbRef(rtdb, `/status/${chatWithUserId}`);

      // PROFILE
      profileUnsubRef.current = onSnapshot(profileRef, (docSnap) => {
        if (!auth.currentUser) return; // user logged out
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setProfile(prev => ({
            ...prev,
            id: chatWithUserId,
            username: data.username,
            avatar: data.avatar,
          }));
        }
      });

      // STATUS
      statusUnsubRef.current = onValue(statusRef, (snap) => {
        const statusVal = snap.val(); // "online", "onBreak", "offline", null
        let status: "online" | "onBreak" | "offline" = "offline";

        if (statusVal === "online" || statusVal === true) status = "online";
        else if (statusVal === "onBreak") status = "onBreak";
        else if (statusVal === "offline" || statusVal === false) status = "offline";

        // Merge safely with existing profile
        setProfile(prev => ({
          id: prev?.id || chatWithUserId,
          username: prev?.username || "",
          avatar: prev?.avatar || `https://avatars.dicebear.com/api/identicon/${chatWithUserId}.svg`,
          onlineStatus: status,
        }));
      });
    };

    setupPrivateListeners();

    return () => {
      profileUnsubRef.current?.();
      statusUnsubRef.current?.();
    };
  }, [chatWithUserId, isGroup, currentUserId]);

  useEffect(() => {
    if (!isGroup || !groupMembers.length) return;

    const unsubscribers: (() => void)[] = [];

    groupMembers.forEach((memberId) => {
      const statusRef = rtdbRef(rtdb, `/status/${memberId}`);
      const unsubscribe = onValue(statusRef, (snap) => {
        const statusVal = snap.val();
        let status: "online" | "onBreak" | "offline" = "offline";

        if (statusVal === "online" || statusVal === true) status = "online";
        else if (statusVal === "onBreak") status = "onBreak";
        else status = "offline";

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

  useEffect(() => {
    if (!isGroup) return;

    const groupRef = doc(db, "groups", chatWithUserId);
    const unsubscribeGroup = onSnapshot(groupRef, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() as any;
      const members: string[] = data.members || [];

      // Fetch profiles
      const fetchProfiles = async () => {
        const profiles: UserProfile[] = [];
        for (const id of members) {
          const docSnap = await getDoc(doc(db, "users", id));
          if (docSnap.exists()) profiles.push({ id, ...(docSnap.data() as UserProfile) });
        }
        setGroupMemberProfiles(profiles);
      };
      fetchProfiles();

      // Subscribe to statuses
      members.forEach((id) => {
        const statusRef = rtdbRef(rtdb, `/status/${id}`);
        onValue(statusRef, (snap) => {
          const val = snap.val();
          let status: "online" | "onBreak" | "offline" = "offline";
          if (val === "online" || val === true) status = "online";
          else if (val === "onBreak") status = "onBreak";
          setUserStatuses(prev => ({ ...prev, [id]: status }));
        });
      });
    });

    return () => unsubscribeGroup();
  }, [chatWithUserId, isGroup]);

  useEffect(() => {
    if (!currentUserId || !chatWithUserId) return;

    const messagesRef = isGroup
      ? collection(db, "groupChats", chatWithUserId, "messages")
      : collection(db, "chats", currentUserId, chatWithUserId);

    // Get last 20 messages, newest first
    const q = query(messagesRef, orderBy("timestamp", "desc"), limit(20));

    let unsubThreadListeners: (() => void)[] = [];

    const unsubscribe = onSnapshot(q, async snapshot => {
      // Clear previous thread listeners
      unsubThreadListeners.forEach(fn => fn());
      unsubThreadListeners = [];

      // Map messages and reverse for chronological order
      const msgs: Message[] = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<Message, "id">) }))
        .reverse();

      // Update messages state
      setMessages(msgs);

      // Mark unread messages as read in batch
      const batch: Promise<any>[] = [];
      msgs.forEach(msg => {
        if (!msg.readBy?.[currentUserId] && msg.senderId !== currentUserId) {
          const msgRef = isGroup
            ? doc(db, "groupChats", chatWithUserId, "messages", msg.id)
            : doc(db, "chats", currentUserId, chatWithUserId, msg.id);

          batch.push(
            setDoc(msgRef, { readBy: { ...(msg.readBy || {}), [currentUserId]: true } }, { merge: true })
          );
        }

        // Thread listener
        const threadRef = isGroup
          ? collection(db, "groupChats", chatWithUserId, "messages", msg.id, "threads")
          : collection(db, "chats", currentUserId, chatWithUserId, msg.id, "threads");

        const unsubscribeThread = onSnapshot(threadRef, snap => {
          const count = snap.size;
          setMessages(prev =>
            prev.map(m => m.id === msg.id ? { ...m, threadCount: count } : m)
          );
        });

        unsubThreadListeners.push(unsubscribeThread);
      });

      if (batch.length) await Promise.all(batch);
    });

    return () => {
      unsubscribe();
      unsubThreadListeners.forEach(fn => fn());
    };
  }, [chatWithUserId, currentUserId, isGroup]);




  useEffect(scrollToBottom, [messages]);

  // ---- SEND MESSAGE ----
  const sendMessage = async (text?: string, imageUrl?: string) => {
    if (!text?.trim() && !imageUrl) return;
    if (!currentUserId) return;

    const senderSnap = await getDoc(doc(db, "users", currentUserId));
    const senderData = senderSnap.data();
    const senderName = senderData?.username || "Unknown";
    const senderAvatar = senderData?.avatar || `https://avatars.dicebear.com/api/identicon/${currentUserId}.svg`;

    const messageDocRef = isGroup
      ? doc(collection(db, "groupChats", chatWithUserId, "messages"))
      : doc(collection(db, "chats", currentUserId, chatWithUserId));

    const messageData: Message = {
      id: messageDocRef.id,
      text: text || "",
      senderId: currentUserId,
      senderName,
      senderAvatar,
      timestamp: serverTimestamp(),
      imageUrl: imageUrl ?? null,
      reactions: {},
      to: chatWithUserId,
      readBy: { [currentUserId]: true },
      threadCount: 0,
    };

    // Optimistic UI update
    setMessages(prev => [...prev, messageData]);

    try {
      if (isGroup) {
        await setDoc(messageDocRef, messageData);
      } else {
        await Promise.all([
          setDoc(messageDocRef, messageData),
          setDoc(doc(db, "chats", chatWithUserId, currentUserId, messageDocRef.id), messageData),
        ]);
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }

    setMessage("");
    if (messageRef.current) messageRef.current.innerHTML = "";
    scrollToBottom();
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

  // ---- RENDER ----
  if (!profile || !currentUserProfile) return null;

  return (
    <div className="flex flex-col h-full max-h-screen bg-white dark:bg-gray-800 shadow-md rounded-md border border-gray-200 dark:border-gray-700 relative">
      {/* HEADER */}
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 justify-between">
        <div className="flex items-center">
          <img src={profile.avatar || "/default-avatar.png"} alt={profile.username} className="w-6 h-6 rounded-full mr-3" />
          <div>
            {!isGroup && (
            <div className="text-md md:text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100 truncate">{profile.username}</div>
            )}
            {isGroup && (
              <>
                <div className="flex items-center space-x-2 font-semibold text-gray-900 dark:text-gray-100">
                  <span>{profile.username}</span>
                  <button
                    onClick={() => setShowGroupInfo(true)}
                    className="flex items-center space-x-1 px-2 py-1 rounded transition hover:opacity-90 bg-[#910a6730] text-gray-900 dark:text-gray-100"
                  >
                    {/* User icon */}
                      <User size={18} className="opacity-80" strokeWidth={2.5} />
                      {/* Total members count */}
                      <span className="text-sm font-medium">
                        {groupMemberProfiles.length}
                      </span>

                  </button>
                </div>
                {/* Modal */}
                <GroupUserModal
                  isOpen={showGroupInfo}
                  onClose={() => setShowGroupInfo(false)}
                  groupId={chatWithUserId}
                  groupName={profile.username}
                  currentUserId={currentUserId}
                  groupNum={groupMemberProfiles.length}
                  userStatuses={userStatuses}  
                />
              </>
            )}
          </div>
        </div>
      </div>
      {!isGroup && (        
        <div className="flex flex-col items-center dark:border-gray-700 space-y-2 pt-14">
          {/* Avatar with status dot */}
          <div className="relative">
            <img
              src={profile.avatar || "/default-avatar.png"}
              alt={profile.username}
              className="w-16 h-16 rounded-full border-2 border-white shadow-md dark:border-gray-700"
            />
            <span
              className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                profile.onlineStatus === "online" ? "bg-green-500" : profile.onlineStatus === "onBreak" ? "bg-yellow-400" : "bg-gray-400"
              }`}
            />
          </div>

          {/* Username */}
          <div className="text-lg md:text-xl font-semibold tracking-tight leading-tight text-gray-900 dark:text-gray-100 truncate">
            {profile.username}
          </div>

          {/* Direct message info */}
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 max-w-lg pb-4">
            This is the start of your direct message history with {profile.username}. Messages and files shared here are not shown to anyone else.
          </div>

          {/* Chat start time */}
          <div className="flex items-center w-full my-4 text-xs text-gray-400 dark:text-gray-500">
            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
            <div className="px-2 whitespace-nowrap text-center">{`Chat started at ${chatStartTime || "10:30 AM"}`}</div>
            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
          </div>
        </div>
      )}
      {isGroup && (
        <div className="flex flex-col items-center dark:border-gray-700 space-y-2 pt-14">
          {/* Avatar with status dot */}
          <div className="relative">
            <img
              src={profile.avatar || "/default-avatar.png"}
              alt={profile.username}
              className="w-16 h-16 rounded-full border-2 border-white shadow-md dark:border-gray-700"
            />
          </div>

          {/* Username */}
          <div className="font-bold text-gray-900 dark:text-gray-100 text-lg">
            {profile.username}
          </div>

          {/* Group info */}
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 max-w-xl pb-4 mx-auto">
            {/* First line with icon */}
            <div className="inline-flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 space-x-1">
              <LockKeyhole size={16} className="opacity-80 self-center" />
              <span>
                Private group created by <span className="font-semibold">{groupCreatorName}</span> on {chatStartTime || "10:30 AM"}.
              </span>
            </div>

            {/* Second line */}
            <div className="mt-2 text-center text-sm">
              This is the start of <span className="font-semibold">{profile.username}</span>. Only invited members can see this private group.
            </div>
          </div>

          {/* Chat start time */}
          <div className="flex items-center w-full my-4 text-xs text-gray-400 dark:text-gray-500">
            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
            <div className="px-2 whitespace-nowrap text-center">{`Chat started at ${chatStartTime || "10:30 AM"}`}</div>
            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
          </div>
        </div>
      )}  
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => {
          const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
          return (
            <div key={msg.id} className="flex justify-start items-start space-x-2 relative">
              {/* Sender Avatar */}
              <img
                src={msg.senderAvatar || "/default-avatar.png"}
                alt={msg.senderName}
                className="w-8 h-8 rounded-full mt-1"
              />

              <div className="flex flex-col max-w-xs relative">
                {/* Username and Timestamp */}
                <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{msg.senderName}</span>
                  <span>{timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Message content */}
                <div
                  className="break-words cursor-pointer text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: msg.text }}
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    setHoveredMessageId(msg.id);
                  }}
                  onMouseLeave={() => {
                    hoverTimeoutRef.current = setTimeout(() => {
                      if (!popupRef.current?.matches(':hover')) setHoveredMessageId(null);
                    }, 300);
                  }}
                >
                  {/* {msg.text} */}
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
                        const isStillOnMessage = messageRefs.current[msg.id]?.matches(':hover');
                        if (!isStillOnMessage) setHoveredMessageId(null);
                      }, 300);
                    }}
                    className="absolute left-0 flex items-center bg-white border border-gray-300 shadow-sm rounded-md px-2 py-1 z-50 -top-4 space-x-1 transition-all duration-200"
                  >
                    {emojiReactions.map((emoji) => (
                      <button
                        key={emoji}
                        className="text-base px-1 hover:scale-125 transition-transform"
                        onClick={() => toggleReaction(msg, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      className="text-xs ml-1 text-blue-500 hover:text-blue-600 hover:underline transition"
                      onClick={() => handleReplyClick(msg)}
                    >
                      <MessageSquareReply size={18} className="mr-1 opacity-80" />
                    </button>
                  </div>
                )}

                {/* Thread button */}
                {(msg.threadCount ?? 0) > 0 && (
                  <button
                    className="flex items-center text-blue-500 text-xs mt-1 hover:underline"
                    onClick={() => onOpenThread?.(msg)}
                  >
                    <MessageSquareReply size={18} className="mr-1 opacity-80" />
                    {msg.threadCount} {msg.threadCount! > 1 ? "Replies" : "Reply"}
                  </button>
                )}

                {/* Reactions */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex space-x-1 mt-1">
                    {Object.entries(msg.reactions).map(([userId, emoji]) => (
                      <span key={userId} className="text-sm px-1 py-0.5 rounded-full">{emoji}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="w-full p-3 border-t border-gray-200 dark:border-gray-700 relative bg-gray-50 dark:bg-gray-900">
        {/* Content Editable Div */}
        <div
          contentEditable
          ref={messageRef}
          onInput={(e: React.FormEvent<HTMLDivElement>) =>
            setMessage(e.currentTarget.innerText)
          }
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault(); 
              if (messageRef.current?.innerHTML.trim()) {
                sendMessage(messageRef.current.innerHTML);
                setMessage("");
                messageRef.current.innerHTML = "";
              }
            }
          }}
          suppressContentEditableWarning={true}
          className="w-full min-h-[80px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 pr-24 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        ></div>

        <div className="absolute right-4 bottom-4 flex items-center space-x-2">
          {/* Emoji Button */}
          <button
            type="button"
            ref={emojiButtonRef}
            onClick={() => setShowEmojiPicker(prev => !prev)}
            className="dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-xl"
          >
            <Smile size={20} className="opacity-80" />
          </button>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-12 right-0 z-50 shadow-lg"
              style={{ minWidth: "280px" }}
            >
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}

          {/* Send Button */}
          <button
            type="button"
            onClick={() => {
              if (messageRef.current?.innerText.trim()) {
                sendMessage(messageRef.current.innerHTML);
                setMessage("");
                messageRef.current.innerHTML = "";
              }
            }}
            disabled={!messageRef.current?.innerText.trim()}
            className={`p-1.5 rounded-sm transition ${
              messageRef.current?.innerText.trim()
                ? "bg-blue-500 hover:bg-blue-600 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            <SendHorizontal size={18} className="opacity-80" />
          </button>
        </div>
        {/* Toolbar inside the textarea */}
        <div className="absolute bottom-3 left-4 flex space-x-2">
          <button
            type="button"
            onClick={() => applyFormat("bold")}
            className="font-bold px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => applyFormat("italic")}
            className="italic px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => applyFormat("strike")}
            className="line-through px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            S
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;