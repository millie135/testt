import { rtdb } from "@/firebaseConfig";
import { ref as rtdbRef, set, onDisconnect } from "firebase/database";

export const setUserOnlineStatus = async (userId: string) => {
  if (!userId) return;

  const statusRef = rtdbRef(rtdb, `/status/${userId}`);

  // Set online immediately
  await set(statusRef, "online");

  // Automatically set offline on disconnect
  onDisconnect(statusRef).set("offline");
};
