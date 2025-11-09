import { useEffect } from "react";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";
import { rtdb } from "@/firebaseConfig";

export function usePresence(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const connectedRef = ref(rtdb, ".info/connected");
    const statusRef = ref(rtdb, `/status/${userId}`);

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        rtdbSet(statusRef, "online").catch(console.error);
        onDisconnect(statusRef).set("offline").catch(console.error);
      }
    });

    return () => unsubscribe();
  }, [userId]);
}
