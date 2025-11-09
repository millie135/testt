import { useEffect, useState, useMemo } from "react";
import { rtdb } from "@/firebaseConfig"; // your Firebase Realtime Database import
import { ref, onValue, off } from "firebase/database";

type Status = "online" | "onBreak" | "offline";

export const useUserStatuses = (uids: string[]) => {
  const [statuses, setStatuses] = useState<{ [userId: string]: Status }>({});

  // Memoize uids to avoid triggering useEffect on every render
  const stableUids = useMemo(() => uids, [uids.join(",")]);

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    stableUids.forEach(uid => {
      const statusRef = ref(rtdb, `status/${uid}`);

      const unsubscribe = onValue(statusRef, snapshot => {
        const val = snapshot.val();
        let status: Status = "offline";

        if (val === "online") status = "online";
        else if (val === "onBreak") status = "onBreak";

        setStatuses(prev => {
          // Only update state if value changed to avoid extra re-renders
          if (prev[uid] === status) return prev;
          return { ...prev, [uid]: status };
        });
      });

      // Store cleanup function
      unsubscribers.push(() => off(statusRef, "value"));
    });

    // Cleanup all listeners on unmount or when uids change
    return () => unsubscribers.forEach(fn => fn());
  }, [stableUids]);

  return statuses;
};
