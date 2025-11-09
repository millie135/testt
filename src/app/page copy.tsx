"use client";

import { useState, useEffect, useRef } from "react";
import SignUp from "@/components/Auth/SignUp";
import SignIn from "@/components/Auth/SignIn";
import ChatBox from "@/components/Chat/ChatBox";
import ManageMembersSidebar from "@/components/Chat/ManageMembersSidebar";
import AddMemberModal from "@/components/Modals/AddMemberModal";
import CreateGroupModal from "@/components/Modals/CreateGroupModal";
import TimeManagement, { TimeManagementHandle } from "@/components/Time/TimeManagement";
import { UserType, Group } from "@/types";
import { auth, db, rtdb } from "@/firebaseConfig";
import { signOutUser } from "@/utils/auth";
import { MessageSquare, House, Bell, ChevronDown, ChevronRight, Search } from "lucide-react";
import ThreadChatBox from "@/components/Chat/ThreadChatBox";
import { usePresence } from "@/hooks/usePresence";


import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
  getDocs,
  arrayUnion,
  addDoc,
  runTransaction,
  QuerySnapshot,
  DocumentData,
  arrayRemove, 
} from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";


export default function Home() {
  const [showSignUp, setShowSignUp] = useState(true);
  const [user, setUser] = useState<UserType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [chatUser, setChatUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  //const [userStatuses, setUserStatuses] = useState<{ [key: string]: boolean }>({});
  type StatusType = "online" | "onBreak" | "offline";

  const [userStatuses, setUserStatuses] = useState<{ [key: string]: StatusType }>({});

  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});
  const prevUnreadCounts = useRef<{ [key: string]: number }>({});
  const [groups, setGroups] = useState<Group[]>([]);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const isManualLogout = useRef(false);
  const groupListenersRef = useRef<{ [groupId: string]: () => void }>({});
  // inside Home component
  const timeManagementRef = useRef<TimeManagementHandle>(null);
  const [activeMenu, setActiveMenu] = useState<"home" | "notifications" | "logo">("home");
  const [isPrivateChatsOpen, setIsPrivateChatsOpen] = useState(false);
  const [isGroupChatsOpen, setIsGroupChatsOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  
  // ------------------------
  // Thread state (new unified state)
  // ------------------------
  const [threadState, setThreadState] = useState<{
    messageId: string;
    message: any;
  } | null>(null);

  usePresence(user?.uid);

  // After user login (inside auth.onAuthStateChanged)
  //timeManagementRef.current?.autoCheckIn();
  useEffect(() => {
    timeManagementRef.current?.autoCheckIn();
  }, [user]);

  useEffect(() => {
    if (user) {
      setActiveMenu("home");
      timeManagementRef.current?.autoCheckIn();
    }
  }, [user]);

  // -------------------
  // Firebase: Auth State + Single Session
  // -------------------
  useEffect(() => {
    // Safe UUID generator (works even if crypto.randomUUID is missing)
    function generateUUID(): string {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        // Fallback RFC4122-like random string
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      // Final fallback: basic random string
      return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", u.uid);
        await runTransaction(db, async (transaction) => {
          const userSnap = await transaction.get(userRef);

          let localSessionId = localStorage.getItem("sessionId");
          if (!localSessionId) {
            localSessionId = generateUUID();
            localStorage.setItem("sessionId", localSessionId);
          }

          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data?.sessionId && data.sessionId !== "" && data.sessionId !== localSessionId) {
              throw new Error("Your account is already logged in on another device.");
            }
            transaction.update(userRef, { sessionId: localSessionId });
          } else {
            transaction.set(userRef, { sessionId: localSessionId, createdAt: serverTimestamp() });
          }

          sessionIdRef.current = localSessionId;
        });

        const tokenResult = await u.getIdTokenResult();
        const roleFromToken = (tokenResult.claims.role as string) || "user";

        const userSnap = await getDoc(doc(db, "users", u.uid));
        const data = userSnap.data();

        setUser({
          id: u.uid,
          uid: u.uid,
          username: data?.username || u.email?.split("@")[0] || "User",
          avatar: data?.avatar || `https://avatars.dicebear.com/api/identicon/${u.uid}.svg`,
          email: data?.email || undefined,
          role: data?.role || roleFromToken || "user",
        });
      } catch (err: any) {
        alert(err.message);
        await auth.signOut();
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // -------------------
  // Real-time logout if sessionId changes
  // -------------------
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      const data = snap.data();
      if (!data) return;

      if (data.sessionId && data.sessionId !== sessionIdRef.current) {
        if (!isManualLogout.current) {
          alert("You have been logged out because your account was signed in on another device.");
        }
        auth.signOut();
        localStorage.removeItem("sessionId");
        sessionIdRef.current = null;
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // ------------------------
  // Fetch Users
  // ------------------------
  useEffect(() => {
    if (!user) return;

    // Clear old listeners
    unsubscribersRef.current.forEach((fn) => fn());
    unsubscribersRef.current = [];

    // -------------------
    // Users
    // -------------------
    const usersQuery =
      user.role === "Leader"
        ? collection(db, "users") // Leader sees all
        : query(collection(db, "users"), where("role", "==", "Leader")); // User sees only leaders

    const unsubUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        const allUsers = snapshot.docs
          .filter((doc) => doc.id !== user.uid)
          .map((doc) => ({
            id: doc.id,
            uid: doc.id,
            username: doc.data().username,
            email: doc.data().email,
            avatar: doc.data().avatar,
            role: doc.data().role,
          }));
        setUsers(allUsers);
      },
      (error) => {
        console.warn("Users query error:", error.code);
      }
    );
    unsubscribersRef.current.push(unsubUsers);

    // -------------------
    // Groups
    // -------------------
    const groupsQuery =
      user.role === "Leader"
        ? collection(db, "groups") // Leader sees all groups
        : query(collection(db, "groups"), where("members", "array-contains", user.uid)); // User sees only groups they belong to

    const unsubGroups = onSnapshot(
      groupsQuery,
      (snapshot) => {
        const fetchedGroups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Group));
        setGroups(fetchedGroups);

        // Deselect chat if removed
        if (chatUser?.isGroup && !fetchedGroups.find((g) => g.id === chatUser.id)) {
          setChatUser(null);
        }
      },
      (error) => {
        console.warn("Groups query error:", error.code);
      }
    );
    unsubscribersRef.current.push(unsubGroups);

    // -------------------
    // Cleanup
    // -------------------
    return () => {
      unsubscribersRef.current.forEach((fn) => fn());
    };
  }, [user, chatUser]);

  // ------------------------
  // Fetch Groups
  // ------------------------
  useEffect(() => {
    if (!user) return;

    const groupsRef = collection(db, "groups");
    const queryRef =
      user.role === "Leader" ? groupsRef : query(groupsRef, where("members", "array-contains", user.uid));

    const unsub = onSnapshot(
      queryRef,
      (snapshot) => {
        const fetchedGroups = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as Group));

        setGroups(fetchedGroups);

        // Deselect chat if removed
        if (chatUser?.isGroup && !fetchedGroups.find((g) => g.id === chatUser.id)) {
          setChatUser(null);
        }
      },
      (error: any) => {
        if (error.code === "permission-denied") {
          console.warn("Some groups are not accessible for this user.");
        } else console.error("Error fetching groups:", error);
      }
    );

    return () => unsub();
  }, [user, chatUser]);

  // ------------------------
  // Subscribe to chats
  // ------------------------
  useEffect(() => {
    if (!user || !users.length || !groups.length) return;

    const unsubscribers: (() => void)[] = [];

    // ---- One-to-One Chats ----
    users.forEach((u) => {
      const path = `chats/${user.uid}/${u.id}`;
      const messagesRef = collection(db, path);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      try {
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            let unreadCount = 0;
            snapshot.docs.forEach((doc) => {
              const msg = doc.data() as any;
              if (!msg.read && msg.senderId === u.id) unreadCount++;
            });
            setUnreadCounts((prev) => ({ ...prev, [u.id]: unreadCount }));
          },
          (error) => {
            if (error.code === "permission-denied") {
              console.warn(`No access to chat with ${u.username}`);
            } else console.error(error);
          }
        );
        unsubscribers.push(unsub);
      } catch (err) {
        console.error(`Failed to subscribe to chat with ${u.username}:`, err);
      }
    });

    // ---- Group Chats ----
    groups.forEach((g) => {
      if (!g.members?.includes(user.uid) && user.role !== "Leader") return;

      const path = `groupChats/${g.id}/messages`;
      const messagesRef = collection(db, path);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      try {
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            let unreadCount = 0;
            snapshot.docs.forEach((doc) => {
              const msg = doc.data() as any;
              if (!msg.readBy?.[user.uid] && msg.senderId !== user.uid) unreadCount++;
            });
            setUnreadCounts((prev) => ({ ...prev, [g.id]: unreadCount }));
          },
          (error: any) => {
            if (error.code === "permission-denied") {
              console.warn(`No access to group chat ${g.name}`);
            } else console.error(error);
          }
        );
        unsubscribers.push(unsub);
      } catch (err) {
        console.error(`Failed to subscribe to group chat ${g.name}:`, err);
      }
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [user, users, groups]);

  // Subscribe to chats once users/groups are loaded
  useEffect(() => {
    if (!user || users.length === 0) return;

    // ONE-TO-ONE CHATS
    users.forEach(u => {
      const messagesRef = collection(db, "chats", user.uid, u.id);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const unreadCount = snapshot.docs.filter(doc => doc.data().senderId === u.id && !doc.data().read).length;
        setUnreadCounts(prev => ({ ...prev, [u.id]: unreadCount }));
      }, (error) => {
        if (error.code === "permission-denied") console.warn(`No access to chat with ${u.username}`);
        else console.error(error);
      });

      unsubscribersRef.current.push(unsubscribe);
    });

  }, [user, users]);

  // -------------------
  // Track Online Status
  // -------------------

  useEffect(() => {
    if (!user) return;

    // Listen for connection state
    const connectedRef = ref(rtdb, ".info/connected");
    const userStatusRef = ref(rtdb, `/status/${user.uid}`);

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        // Set online when connected
        rtdbSet(userStatusRef, "online").catch(console.error);

        // Set offline when disconnected
        onDisconnect(userStatusRef).set("offline").catch(console.error);
      }
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!users || users.length === 0) return;

    const allUsers = [user, ...users].filter((u): u is UserType => u !== null);
    const unsubscribers: (() => void)[] = [];

    allUsers.forEach((u) => {
      const statusRef = ref(rtdb, `/status/${u.id}`);

      const unsubscribe = onValue(statusRef, (snap) => {
        const val = snap.val();

        let status: StatusType = "offline";
        if (val === true || val === "online") status = "online";
        else if (val === "onBreak") status = "onBreak";

        setUserStatuses((prev) => ({
          ...prev,
          [u.id]: status,
        }));
      });

      unsubscribers.push(() => unsubscribe());
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users, user]);

  useEffect(() => {
    if (!user || (!users.length && !groups.length)) return;

    const unsubscribers: (() => void)[] = [];

    // -------------------
    // One-to-One Chats
    // -------------------
    const chatUsers = users.filter(u => 
      user.role === "Leader" || u.role === "Leader"
    );

      chatUsers.forEach((u) => {
        const messagesRef = collection(db, "chats", user.uid, u.id);
        const q = query(messagesRef, orderBy("timestamp", "desc"));

        try {
          const unsubscribe = onSnapshot(q, async (snapshot) => {
            const unreadDocs = snapshot.docs.filter(
              (doc) => doc.data().senderId === u.id && !doc.data().read
            );

            if (chatUser?.id === u.id && unreadDocs.length > 0) {
              const updates = unreadDocs.map((docSnap) =>
                updateDoc(docSnap.ref, { read: true })
              );
              await Promise.all(updates);
            }

            const unreadCount = chatUser?.id === u.id ? 0 : unreadDocs.length;

            setUnreadCounts((prev) => ({ ...prev, [u.id]: unreadCount }));

            if (unreadCount > (prevUnreadCounts.current[u.id] || 0) && chatUser?.id !== u.id) {
              notificationAudio.current?.play().catch(() => {});
            }
            prevUnreadCounts.current[u.id] = unreadCount;
          });

          unsubscribers.push(unsubscribe);
          unsubscribersRef.current.push(unsubscribe);

        } catch (error: any) {
          if (error.code !== "permission-denied") console.error(error);
        }
      });

    // -------------------
    // Group Chats
    // -------------------
    groups.forEach((g) => {
      // Skip if user is not allowed by rules
      if (!(g.members?.includes(user.uid) || user.role === "Leader")) return;

      // Unsubscribe previous listener if exists
      if (groupListenersRef.current[g.id]) {
        groupListenersRef.current[g.id]();
        delete groupListenersRef.current[g.id];
      }

      const messagesRef = collection(db, "groupChats", g.id, "messages");
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      try {
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            let unreadCount = 0;
            snapshot.docs.forEach((doc) => {
              const msg = doc.data() as any;
              if (!msg.readBy?.[user.uid] && msg.senderId !== user.uid) unreadCount += 1;
            });

            setUnreadCounts((prev) => ({ ...prev, [g.id]: unreadCount }));

            if (unreadCount > (prevUnreadCounts.current[g.id] || 0) && chatUser?.id !== g.id) {
              const audio = new Audio("/notify.mp3");
              audio.play().catch(() => {});
            }

            prevUnreadCounts.current[g.id] = unreadCount;
          },
          (error: any) => {
            if (error.code === "permission-denied") {
              // Gracefully remove unread count and unsubscribe
              setUnreadCounts((prev) => {
                const newCounts = { ...prev };
                delete newCounts[g.id];
                return newCounts;
              });
              if (groupListenersRef.current[g.id]) {
                groupListenersRef.current[g.id]();
                delete groupListenersRef.current[g.id];
              }
            } else console.error("Error fetching group messages:", error);
          }
        );

        groupListenersRef.current[g.id] = unsubscribe;

      } catch (error: any) {
        if (error.code !== "permission-denied") console.error(error);
      }
    });

    return () => {
      unsubscribers.forEach((fn) => fn());
      Object.values(groupListenersRef.current).forEach((fn) => fn());
      groupListenersRef.current = {};
    };
  }, [users, groups, user, chatUser]);


  // -------------------
  // Handlers
  // -------------------
  const handleSelectUser = async (u: UserType) => {
    if (!user) return; // <--- add this line
    // Prevent users from chatting with non-leaders
    if (user.role === "user" && u.role !== "Leader") {
      alert("You can only chat privately with leaders.");
      return;
    }
    if (chatUser?.id === u.id) return;

    setChatUser(u);
    setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));

    const q = query(collection(db, "chats", user!.uid, u.id), where("read", "==", false));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) => updateDoc(docSnap.ref, { read: true }));
    await Promise.all(updates);
  };

  const handleSelectGroup = async (g: Group) => {
    setChatUser({
      id: g.id,
      username: g.name,
      isGroup: true,
      members: g.members,
      avatar: g.avatar || `https://avatars.dicebear.com/api/identicon/${g.id}.svg`,
    });

    const messagesRef = collection(db, "groupChats", g.id, "messages");
    const q = query(messagesRef, where(`readBy.${user!.uid}`, "==", false));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) =>
      updateDoc(docSnap.ref, { [`readBy.${user!.uid}`]: true })
    );
    await Promise.all(updates);

    setUnreadCounts((prev) => ({ ...prev, [g.id]: 0 }));
  };

  const handleSignOut = async () => {
    if (!user) return;

    try {
      await signOutUser(user.uid);
      setUser(null); // Update local state after logout
    } catch (err) {
      //console.error("Error signing out:", err);
      alert("Error signing out.");
    }
  };


  const handleAddMember = async (groupId: string, memberId: string) => {
    const groupRef = doc(db, "groups", groupId);
    await updateDoc(groupRef, {
      members: arrayUnion(memberId),
    });
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    const groupRef = doc(db, "groups", groupId);
    await updateDoc(groupRef, {
      members: arrayRemove(memberId),
    });
  };

  const handleCreateGroupSubmit = async (groupName: string, avatar: string) => {
    if (!user || user.role !== "Leader") return alert("Only leaders can create groups");
    if (!groupName.trim()) return;
    try {
      await addDoc(collection(db, "groups"), {
        name: groupName.trim(),
        members: [user.uid],
        avatar,
        createdAt: serverTimestamp(),
      });
      setNewGroupName("");
      setShowCreateGroupModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create group.");
    }
  };

  // -------------------
  // Render
  // -------------------
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300 text-lg animate-pulse">Loading...</p>
      </div>
    );

  if (!user)
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen space-y-6 px-4" style={{ backgroundColor: '#3C0753' }}>
        <img
          src="/Vector.png"
          alt="Top Right"
          className="absolute top-0 right-0 h-screen pointer-events-none"
          style={{
            width: "auto",       
            objectFit: "contain",   
            objectPosition: "top right",
            zIndex: 0,
          }}
        />

        <div className="bottom-0 left-0 w-1/4 h-1/3  pointer-events-none" style={{ zIndex: 0 }}>
          <img
            src="/BGG.png"
            alt="Bottom Left"
            className="absolute bottom-0 left-0 w-1/4 h-1/2"
            style={{
              objectFit: "cover",
            }}
          />
        </div>
        <div className="w-full max-w-md relative z-10">{showSignUp ? <SignUp /> : <SignIn />}</div>
        <button
          className="text-white hover:underline relative z-10"
          onClick={() => setShowSignUp(!showSignUp)}
        >
          {showSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        </button>
      </div>
    );

    return (
      <div className="bg-[#3C0753] min-h-screen w-full flex justify-center items-start overflow-hidden">
        <aside className="flex flex-col w-20 bg-[#3C0753] py-4 items-center space-y-4 pt-9">
          <button
            className={`p-2 rounded transition hover:bg-gray-400/20 hover:backdrop-blur-sm ${
              activeMenu === "logo" ? "bg-gray-500/20" : ""
            }`}
            onClick={() => setActiveMenu("logo")}
          >
            <img src="/logo.png" alt="Logo" className="w-5 h-5 mx-auto" />
          </button>
          <button
            className={`p-2 rounded transition hover:bg-gray-400/20 hover:backdrop-blur-sm ${
              activeMenu === "home" ? "bg-gray-500/40" : ""
            }`}
            onClick={() => setActiveMenu("home")}
          >
            <House size={22} strokeWidth={2.5} className="text-white" />
          </button>

          <button
            className={`p-2 rounded transition hover:bg-gray-400/20 hover:backdrop-blur-sm ${
              activeMenu === "notifications" ? "bg-gray-500/40" : ""
            }`}
            onClick={() => setActiveMenu("notifications")}
          >
            <Bell size={22} strokeWidth={2.5} className="text-white" />
          </button>
        </aside>
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-4/5 max-w-[600px] z-20">
          <div className="relative">
            <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-300">
              <Search size={14} className="mr-2 opacity-80" />
            </span>

            <input
              type="text"
              placeholder="Search..."
              className="w-full h-7 pl-8 pr-3 rounded-sm bg-[#58375C] text-white placeholder:text-xs placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex w-full pt-11 pr-14 pb-6 pl-0 h-screen relative">
          
          {/* {activeMenu === "home" && (
            <>
            <aside className="flex-[1] border border-white/50 bg-[#030637] flex flex-col rounded-l-md overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative w-10 h-10">
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />

                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white
                        ${
                          userStatuses[user.uid] === "online"
                            ? "bg-green-500"
                            : userStatuses[user.uid] === "onBreak"
                            ? "bg-yellow-400 shadow-md"
                            : "bg-gray-400"
                        }`}
                      title={
                        userStatuses[user.uid] === "online"
                          ? "Online"
                          : userStatuses[user.uid] === "onBreak"
                          ? "On Break"
                          : "Offline"
                      }
                    ></span>
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user.username}</p>
                    <p className="text-xs text-gray-500">{user.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-sm px-3 py-1 bg-[#720455] hover:bg-[#910A67] text-white rounded"
                >
                  Sign out
                </button>
              </div>

              
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2 cursor-pointer justify-between w-full" onClick={() => setIsGroupChatsOpen(!isGroupChatsOpen)}>
                      <div className="flex items-center">
                        <div className="flex items-center">
                          
                          {isGroupChatsOpen ? (
                            <ChevronDown className="w-4 h-4 text-white" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-white" />
                          )}
                          <h3 className="text-sm uppercase tracking-wide text-white px-2">Group Chats</h3>
                        </div>
                      </div>
                      <div>
                        {user.role === "Leader" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); 
                            setShowCreateGroupModal(true);
                          }}
                          className="text-xs px-2 py-1 bg-[#720455] hover:bg-[#910A67] text-white rounded"
                        >
                          + New
                        </button>
                      )}
                      </div>
                    </div>
                  </div>
                  <ul
                    className={`space-y-1 overflow-hidden transition-[max-height] duration-300 ${
                      isGroupChatsOpen ? "max-h-[1000px]" : "max-h-0"
                    }`}
                  >
                    {groups.map((g) => (
                      <li
                        key={g.id}
                        className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer transition ${
                          chatUser?.id === g.id
                            ? "bg-gray-800"
                            : "hover:bg-gray-600 dark:hover:bg-gray-700"
                        }`}
                        onClick={() => handleSelectGroup(g)}
                      >
                        <div className="flex items-center space-x-2">
                          <img
                            src={g.avatar || `https://api.dicebear.com/9.x/lorelei/svg?seed=${g.name}`}
                            alt={g.name}
                            className="w-8 h-8 rounded-full"
                          />
                          <span className="text-white">{g.name}</span>
                        </div>

                        <div className="flex items-center space-x-1">
                          {unreadCounts[g.id] > 0 && (
                            <span className="text-xs font-bold text-red-500">
                              {unreadCounts[g.id]}
                            </span>
                          )}
                          {user.role === "Leader" && (
                            <button
                              className="text-xs px-2 py-0.5 bg-[#910A67] text-white rounded hover:bg-[#910A67]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedGroup(g);
                                setShowManageMembers(true);
                              }}
                            >
                              Manage
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <div
                    className="flex items-center justify-start cursor-pointer mb-2 space-x-2"
                    onClick={() => setIsPrivateChatsOpen(!isPrivateChatsOpen)}
                  >
                    
                    {isPrivateChatsOpen ? (
                      <ChevronDown className="w-4 h-4 text-white" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-white" />
                    )}
                    <h3 className="text-sm uppercase tracking-wide text-white">Private Chats</h3>
                  </div>
                  <ul
                    className={`space-y-1 overflow-hidden transition-[max-height] duration-300 ${
                      isPrivateChatsOpen ? "max-h-[1000px]" : "max-h-0"
                    }`}
                  >
                    {users.map((u) => (
                      <li
                        key={u.id}
                        className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer transition ${
                          chatUser?.id === u.id
                            ? "bg-gray-800"
                            : "hover:bg-gray-600 dark:hover:bg-gray-700"
                        }`}
                        onClick={() => handleSelectUser(u)}
                      >
                        <div className="flex items-center space-x-2">
                          <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full" />
                          <span className="text-white">{u.username}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${
                              userStatuses[u.id] === "online"
                                ? "bg-green-500"
                                : userStatuses[u.id] === "onBreak"
                                ? "bg-yellow-400"
                                : "bg-gray-400"
                            }`}
                          ></span>
                          {unreadCounts[u.id] > 0 && (
                            <span className="text-xs font-bold text-red-500">
                              {unreadCounts[u.id]}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>

            <main className="relative flex-[6] flex flex-col bg-white dark:border-gray-800 rounded-r-md overflow-hidden">
              {chatUser ? (
                <>
                <ChatBox
                  key={chatUser.id}
                  chatWithUserId={chatUser.id}
                  chatWithUsername={chatUser.username}
                  currentUserId={user.uid}
                  isGroup={chatUser.isGroup || false}
                  groupMembers={chatUser.members || []}
                  onOpenThread={(message) => setThreadState({ messageId: message.id, message })}
                  threadState={threadState}
                />

                {threadState && (
                  <ThreadChatBox
                    parentMessage={threadState.message}
                    currentUserId={user.uid}
                    chatWithUserId={chatUser.id}
                    isGroup={chatUser.isGroup || false}
                    // onClose={() => setSelectedMessageId(null)}
                    // onThreadSent={() => setSelectedMessageId(null)}
                    onClose={() => setThreadState(null)}
                    onThreadSent={() => setThreadState(null)}
                  />
                )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-gray-500">  
                  <MessageSquare size={60} className="text-gray-400 mb-6" />
                  <p className="text-2xl font-semibold text-gray-800 mb-2">You have no conversations yet</p>
                  <p className="text-sm text-gray-500">Start a chat to see messages here</p>
                </div>

              )}
            </main>
            </>
          )}
          {activeMenu === "notifications" && user && (
            <main className="flex-1 flex flex-col md:flex-row bg-white dark:bg-neutral-800 rounded-md overflow-visible p-4">
              <aside className="flex-1 md:flex-[5] p-4">
                <TimeManagement userId={user.uid} ref={timeManagementRef} />
              </aside>
              <div className="flex-1" /> 
            </main>
          )} */}

          <main className="flex-1 flex flex-col md:flex-row bg-white dark:bg-neutral-800 rounded-md overflow-visible p-4 relative">

            {/* Sidebar + Chat */}
            <div
              className={`absolute inset-0 transition-all duration-500 ease-in-out transform flex flex-1 md:flex-row
                ${activeMenu === "home" ? "opacity-100 translate-x-0 z-10 pointer-events-auto" : "opacity-0 -translate-x-full z-0 pointer-events-none"}`}
            >
              <aside className="flex-[1] border border-white/50 bg-[#030637] flex flex-col rounded-l-md overflow-hidden">
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative w-10 h-10">
                      <img
                        src={user.avatar}
                        alt={user.username}
                        className="w-10 h-10 rounded-full object-cover"
                      />

                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white
                          ${
                            userStatuses[user.uid] === "online"
                              ? "bg-green-500"
                              : userStatuses[user.uid] === "onBreak"
                              ? "bg-yellow-400 shadow-md"
                              : "bg-gray-400"
                          }`}
                        title={
                          userStatuses[user.uid] === "online"
                            ? "Online"
                            : userStatuses[user.uid] === "onBreak"
                            ? "On Break"
                            : "Offline"
                        }
                      ></span>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{user.username}</p>
                      <p className="text-xs text-gray-500">{user.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="text-sm px-3 py-1 bg-[#720455] hover:bg-[#910A67] text-white rounded"
                  >
                    Sign out
                  </button>
                </div>

                        
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 cursor-pointer justify-between w-full" onClick={() => setIsGroupChatsOpen(!isGroupChatsOpen)}>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            
                            {isGroupChatsOpen ? (
                              <ChevronDown className="w-4 h-4 text-white" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white" />
                            )}
                            <h3 className="text-sm uppercase tracking-wide text-white px-2">Group Chats</h3>
                          </div>
                        </div>
                        <div>
                          {user.role === "Leader" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); 
                              setShowCreateGroupModal(true);
                            }}
                            className="text-xs px-2 py-1 bg-[#720455] hover:bg-[#910A67] text-white rounded"
                          >
                            + New
                          </button>
                        )}
                        </div>
                      </div>
                    </div>
                    <ul
                      className={`space-y-1 overflow-hidden transition-[max-height] duration-300 ${
                        isGroupChatsOpen ? "max-h-[1000px]" : "max-h-0"
                      }`}
                    >
                      {groups.map((g) => (
                        <li
                          key={g.id}
                          className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer transition ${
                            chatUser?.id === g.id
                              ? "bg-gray-800"
                              : "hover:bg-gray-600 dark:hover:bg-gray-700"
                          }`}
                          onClick={() => handleSelectGroup(g)}
                        >
                          <div className="flex items-center space-x-2">
                            <img
                              src={g.avatar || `https://api.dicebear.com/9.x/lorelei/svg?seed=${g.name}`}
                              alt={g.name}
                              className="w-8 h-8 rounded-full"
                            />
                            <span className="text-white">{g.name}</span>
                          </div>

                          <div className="flex items-center space-x-1">
                            {unreadCounts[g.id] > 0 && (
                              <span className="text-xs font-bold text-red-500">
                                {unreadCounts[g.id]}
                              </span>
                            )}
                            {user.role === "Leader" && (
                              <button
                                className="text-xs px-2 py-0.5 bg-[#910A67] text-white rounded hover:bg-[#910A67]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedGroup(g);
                                  setShowManageMembers(true);
                                }}
                              >
                                Manage
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <div
                      className="flex items-center justify-start cursor-pointer mb-2 space-x-2"
                      onClick={() => setIsPrivateChatsOpen(!isPrivateChatsOpen)}
                    >
                      
                      {isPrivateChatsOpen ? (
                        <ChevronDown className="w-4 h-4 text-white" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-white" />
                      )}
                      <h3 className="text-sm uppercase tracking-wide text-white">Private Chats</h3>
                    </div>
                    <ul
                      className={`space-y-1 overflow-hidden transition-[max-height] duration-300 ${
                        isPrivateChatsOpen ? "max-h-[1000px]" : "max-h-0"
                      }`}
                    >
                      {users.map((u) => (
                        <li
                          key={u.id}
                          className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer transition ${
                            chatUser?.id === u.id
                              ? "bg-gray-800"
                              : "hover:bg-gray-600 dark:hover:bg-gray-700"
                          }`}
                          onClick={() => handleSelectUser(u)}
                        >
                          <div className="flex items-center space-x-2">
                            <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full" />
                            <span className="text-white">{u.username}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span
                              className={`inline-block w-3 h-3 rounded-full ${
                                userStatuses[u.id] === "online"
                                  ? "bg-green-500"
                                  : userStatuses[u.id] === "onBreak"
                                  ? "bg-yellow-400"
                                  : "bg-gray-400"
                              }`}
                            ></span>
                            {unreadCounts[u.id] > 0 && (
                              <span className="text-xs font-bold text-red-500">
                                {unreadCounts[u.id]}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </aside>

              <main className="relative flex-[6] flex flex-col bg-white dark:border-gray-800 rounded-r-md overflow-hidden">
                {chatUser ? (
                  <>
                  <ChatBox
                    key={chatUser.id}
                    chatWithUserId={chatUser.id}
                    chatWithUsername={chatUser.username}
                    currentUserId={user.uid}
                    isGroup={chatUser.isGroup || false}
                    groupMembers={chatUser.members || []}
                    onOpenThread={(message) => setThreadState({ messageId: message.id, message })}
                    threadState={threadState}
                  />

                  {threadState && (
                    <ThreadChatBox
                      parentMessage={threadState.message}
                      currentUserId={user.uid}
                      chatWithUserId={chatUser.id}
                      isGroup={chatUser.isGroup || false}
                      // onClose={() => setSelectedMessageId(null)}
                      // onThreadSent={() => setSelectedMessageId(null)}
                      onClose={() => setThreadState(null)}
                      onThreadSent={() => setThreadState(null)}
                    />
                  )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-gray-500">  
                    <MessageSquare size={60} className="text-gray-400 mb-6" />
                    <p className="text-2xl font-semibold text-gray-800 mb-2">You have no conversations yet</p>
                    <p className="text-sm text-gray-500">Start a chat to see messages here</p>
                  </div>

                )}
              </main>
            </div>

            {/* Time Management */}
            <div
              className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out transform
                ${activeMenu === "notifications" ? "opacity-100 translate-x-0 z-10 pointer-events-auto" : "opacity-0 translate-x-full z-0 pointer-events-none"}`}
            >
              <TimeManagement userId={user.uid} ref={timeManagementRef} />
            </div>


          </main>




          {/* === Right Sidebar (free space) === */}
          {/* <aside className="hidden md:flex flex-[5] bg-gray-50 dark:bg-gray-900 p-4">
            <TimeManagement userId={user.uid} ref={timeManagementRef} />
          </aside> */}

        {/* === Manage Members Modal (centered) === */}
        {showManageMembers && selectedGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Darker but clearer blur overlay */}
            <div
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setShowManageMembers(false)}
            />

            {/* Modal content */}
            <div className="relative bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg w-96 z-10">
              <ManageMembersSidebar
                group={selectedGroup}
                users={users}
                onAddMember={(memberId) => handleAddMember(selectedGroup.id, memberId)}
                onRemoveMember={(memberId) => handleRemoveMember(selectedGroup.id, memberId)}
                onClose={() => setShowManageMembers(false)}
              />
            </div>
          </div>
        )}

        {/* === Modals === */}
        {showCreateGroupModal && (
          <CreateGroupModal
            onClose={() => setShowCreateGroupModal(false)}
            onSubmit={handleCreateGroupSubmit}
          />
        )}

        {showAddMemberModal && selectedGroup && (
          <AddMemberModal
            group={selectedGroup}
            users={users}
            onAddMember={(memberId) => handleAddMember(selectedGroup.id, memberId)}
            onClose={() => setShowAddMemberModal(false)}
          />
        )}
        </div>
      </div>
    );

}
