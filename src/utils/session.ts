import { rtdb } from "@/firebaseConfig";
import { ref as rtdbRef, set as rtdbSet, get as rtdbGet, onDisconnect, serverTimestamp } from "firebase/database";

export async function startSession(uid: string, sessionId: string) {
  const sessionRef = rtdbRef(rtdb, `/sessions/${uid}`);
  const statusRef = rtdbRef(rtdb, `/status/${uid}`);

  // Check existing session
  const snap = await rtdbGet(sessionRef);
  const now = Date.now();
  if (snap.exists()) {
    const session = snap.val();
    const lastSeen = session.lastSeen?.toMillis ? session.lastSeen.toMillis() : session.lastSeen;

    if (lastSeen && now - lastSeen < 2 * 60 * 1000 && session.sessionId !== sessionId) {
      throw new Error("Your account is already logged in on another device.");
    }
  }

  // Set session & status
  await rtdbSet(sessionRef, { sessionId, lastSeen: serverTimestamp() });
  onDisconnect(sessionRef).remove();

  await rtdbSet(statusRef, "online");
  onDisconnect(statusRef).set("offline");

  // Periodically update lastSeen
  const interval = setInterval(() => {
    rtdbSet(sessionRef, { sessionId, lastSeen: serverTimestamp() });
  }, 30 * 1000);

  return () => clearInterval(interval); // returns stop function
}

export async function endSession(uid: string) {
  const sessionRef = rtdbRef(rtdb, `/sessions/${uid}`);
  const statusRef = rtdbRef(rtdb, `/status/${uid}`);
  await rtdbSet(statusRef, "offline");
  await rtdbSet(sessionRef, null);
}
