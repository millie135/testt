"use client";

import { FC, useEffect, useState, useRef } from "react";
import { db } from "@/firebaseConfig";
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, getDoc } from "firebase/firestore";
import { Message } from "./types";
import { X , MessageSquareReply } from 'lucide-react';

interface ThreadChatBoxProps {
  parentMessage: Message;
  currentUserId: string;
  chatWithUserId: string;
  isGroup?: boolean;
  groupName?: string;
  onClose: () => void;
  onThreadSent?: () => void;
}

const ThreadChatBox: FC<ThreadChatBoxProps> = ({ parentMessage, currentUserId, chatWithUserId, isGroup = false, groupName, onClose, onThreadSent }) => {
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Slide-in effect
  useEffect(() => {
    setOpen(true);
  }, []);

  // Build Firestore path helper
  const getThreadCollection = () => {
    if (isGroup) {
      return collection(db, "groupChats", chatWithUserId, "messages", parentMessage.id, "threads");
    } else {
      return collection(db, "chats", currentUserId, chatWithUserId, parentMessage.id, "threads");
    }
  };

  // Listen for thread messages
  useEffect(() => {
    // const basePath = isGroup
    //   ? ["groupChats", chatWithUserId, "messages", parentMessage.id, "threads"]
    //   : ["chats", currentUserId, chatWithUserId, parentMessage.id, "threads"];

    // const tuplePath = (...paths: string[]) => paths as [string, ...string[]];
    //const threadRef = collection(db, ...tuplePath(...basePath));
    const threadRef = getThreadCollection();

    const q = query(threadRef, orderBy("timestamp"));

    const unsubscribe = onSnapshot(q, snapshot => {
      const threads: Message[] = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<Message, "id">) }));
      setThreadMessages(threads);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [parentMessage.id, chatWithUserId, currentUserId, isGroup]);


  const sendMessage = async () => {
    if (!message.trim()) return;

    const senderSnap = await getDoc(doc(db, "users", currentUserId));
    const senderData = senderSnap.data();
    const senderName = senderData?.username || "Unknown";
    const senderAvatar = senderData?.avatar || `https://avatars.dicebear.com/api/identicon/${currentUserId}.svg`;

    const messageData: Message = {
      id: doc(collection(db, "temp")).id,
      text: message,
      senderId: currentUserId,
      senderName,
      senderAvatar,
      timestamp: serverTimestamp(),
      imageUrl: null,
      reactions: {},
      to: chatWithUserId,
      readBy: { [currentUserId]: true },
      parentId: parentMessage.id,
    };

    try {
      if (isGroup) {
        const collectionRef = collection(db, "groupChats", chatWithUserId, "messages", parentMessage.id, "threads");
        const messageRef = doc(collectionRef, messageData.id);
        await setDoc(messageRef, messageData);
      } else {
        const tuplePath = (...paths: string[]) => paths as [string, ...string[]];

        const path1 = tuplePath("chats", currentUserId, chatWithUserId, parentMessage.id, "threads");
        const path2 = tuplePath("chats", chatWithUserId, currentUserId, parentMessage.id, "threads");

        const messageRef1 = doc(collection(db, ...path1), messageData.id);
        const messageRef2 = doc(collection(db, ...path2), messageData.id);

        await Promise.all([setDoc(messageRef1, messageData), setDoc(messageRef2, messageData)]);
      }
      // Refresh thread manually after sending
      //await fetchThreadMessages();
      setMessage("");
      onThreadSent?.();
      scrollToBottom();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 300); // wait for slide-out
  };

  return (
    <>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm bg-opacity-30 z-40" onClick={handleClose} />

      {/* Thread panel */}
      <div className={`absolute top-0 right-0 w-120 h-full bg-white dark:bg-gray-800 shadow-xl flex flex-col z-50 transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        
        
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            Thread | {isGroup ? groupName || "Group" : parentMessage.senderName || "User"}
          </span>
          <button onClick={handleClose}>
            <X size={22} className="mr-2 opacity-80 hover:opacity-100 transition" />
          </button>
        </div>



        {/* Messages */}
        {/* <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {threadMessages.map(msg => {
            const isSender = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"} items-end`}>
                {!isSender && (
                  <img src={msg.senderAvatar} alt={msg.senderName} className="w-6 h-6 rounded-full mr-2 mt-1" />
                )}

                <div className="flex flex-col max-w-xs">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {msg.senderName}
                  </div>

                  <div className={`px-3 py-2 rounded-lg break-words ${isSender ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"}`}>
                    {msg.text}
                  </div>

                  <div className={`text-[10px] text-gray-400 mt-1 self-${isSender ? "end" : "start"}`}>
                    {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                  </div>
                </div>

                {isSender && (
                  <img src={msg.senderAvatar} alt={msg.senderName} className="w-6 h-6 rounded-full ml-2 mt-1" />
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div> */}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {threadMessages.map(msg => {
            const isSender = msg.senderId === currentUserId;
            const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
            return (
              <div key={msg.id} className="flex justify-start items-start space-x-2">
                {/* Avatar */}
                <img
                  src={msg.senderAvatar || "/default-avatar.png"}
                  alt={msg.senderName}
                  className="w-8 h-8 rounded-full mt-1"
                />

                <div className="flex flex-col max-w-xs">
                  {/* Name and Time on the same row */}
                  <div className="flex items-center justify-start space-x-2 text-[12px] text-gray-800 mb-1">
                    <span className="font-semibold">{msg.senderName}</span>
                    <span>{timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Message content */}
                  <div className="break-words text-gray-600 text-[12px] dark:text-gray-100">
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>


        {/* Input */}
        {/* <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Reply..."
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 dark:bg-gray-700 dark:text-white"
          />
          <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Send</button>
        </div> */}

        {/* Thread Input Section */}
        <div className="relative p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {/* Editable message area */}
          <div
            contentEditable
            ref={messageRef}
            onInput={(e: React.FormEvent<HTMLDivElement>) =>
              setMessage(e.currentTarget.innerText)
            }
            onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
                setMessage("");
                if (messageRef.current) messageRef.current.innerText = "";
              }
            }}
            suppressContentEditableWarning={true}
            className="w-full min-h-[70px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 pr-24 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            
          ></div>

          {/* Toolbar inside the box (bottom-right corner) */}
          <div className="absolute bottom-4 right-5 flex space-x-2">
            <button
              type="button"
              onClick={() => document.execCommand("bold")}
              className="font-bold text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => document.execCommand("italic")}
              className="italic text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => document.execCommand("strikeThrough")}
              className="line-through text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              S
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ThreadChatBox;
