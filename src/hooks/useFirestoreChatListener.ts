"use client";

import { useEffect, useState } from "react";
import { collection, doc, query, orderBy, onSnapshot, getDocs, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";

export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: Timestamp;
  imageUrl: string | null;
  reactions?: Record<string, string>;
  to: string;
  readBy?: Record<string, boolean>;
  threadCount?: number;
}

interface UseFirestoreChatListenerProps {
  chatWithUserId: string;
  currentUserId: string;
  isGroup?: boolean;
}

export const useFirestoreChatListener = ({
  chatWithUserId,
  currentUserId,
  isGroup = false
}: UseFirestoreChatListenerProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubscribeMessages: (() => void) | null = null;
    let threadUnsubscribers: (() => void)[] = [];

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        if (unsubscribeMessages) unsubscribeMessages();
        threadUnsubscribers.forEach((fn) => fn());
        setMessages([]);
        setUnreadCount(0);
        return;
      }

      const messagesRef = isGroup
        ? collection(db, "groupChats", chatWithUserId, "messages")
        : collection(db, "chats", currentUserId, chatWithUserId);

      const q = query(messagesRef, orderBy("timestamp"));

      unsubscribeMessages = onSnapshot(
        q,
        async (snapshot) => {
          const msgs: Message[] = [];

          for (const docSnap of snapshot.docs) {
            const data = docSnap.data() as Omit<Message, "id">;
            const messageId = docSnap.id;

            // Threads reference
            const threadRef = isGroup
              ? collection(db, "groupChats", chatWithUserId, "messages", messageId, "threads")
              : collection(db, "chats", currentUserId, chatWithUserId, messageId, "threads");

            // Get current thread count
            const threadSnapshot = await getDocs(threadRef);
            let threadCount = threadSnapshot.size;

            // Real-time thread updates
            const unsubThread = onSnapshot(threadRef, (threadSnap) => {
              const count = threadSnap.size;
              setMessages((prev: Message[]) =>
                prev.map((m) => (m.id === messageId ? { ...m, threadCount: count } : m))
              );
            });
            threadUnsubscribers.push(unsubThread);

            msgs.push({ id: messageId, ...data, threadCount });
          }

          setMessages(msgs);

          // Handle unread messages
          const currentUid = auth.currentUser?.uid;
          if (currentUid) {
            let newUnread = 0;
            const batch: Promise<any>[] = [];

            msgs.forEach((msg) => {
              if (!msg.readBy?.[currentUid] && msg.senderId !== currentUid) newUnread += 1;

              if (!msg.readBy?.[currentUid]) {
                const msgRef = isGroup
                  ? doc(db, "groupChats", chatWithUserId, "messages", msg.id)
                  : doc(db, "chats", currentUserId, chatWithUserId, msg.id);
                batch.push(
                  setDoc(
                    msgRef,
                    { readBy: { ...(msg.readBy || {}), [currentUid]: true } },
                    { merge: true }
                  )
                );
              }
            });

            setUnreadCount(newUnread);
            if (batch.length > 0) await Promise.all(batch);
          }
        },
        (error) => {
          if (error.code !== "permission-denied") console.error(error);
        }
      );
    });

    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
      threadUnsubscribers.forEach((fn) => fn());
      unsubscribeAuth();
    };
  }, [chatWithUserId, currentUserId, isGroup]);

  return { messages, setMessages, unreadCount, setUnreadCount };
};
