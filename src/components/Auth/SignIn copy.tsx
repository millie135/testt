"use client";

import { useState } from "react";
import { auth, db } from "@/firebaseConfig";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { Eye, EyeOff, User, Mail, Lock, Link as LinkIcon } from "lucide-react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPasswordError("");
    let valid = true;

    // Email validation (simple pattern)
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setEmailError("Please enter a valid email address");
      valid = false;
    }

    // Password validation
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      valid = false;
    }

    if (!valid) return; // stop here if validation fails

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) throw new Error("User not found in database");
      const data = userSnap.data();

      // Create local session
      let localSessionId = localStorage.getItem("sessionId");
      if (!localSessionId) {
        localSessionId = uuidv4();
        localStorage.setItem("sessionId", localSessionId);
      }

      // Block login if another session exists
      if (data?.sessionId && data.sessionId !== localSessionId) {
        await auth.signOut();
        setError("Your account is already logged in on another device.");
        return;
      }

      // Update Firestore session
      await updateDoc(userRef, { sessionId: localSessionId, lastSeen: serverTimestamp() });
      sessionStorage.setItem("sessionId", localSessionId);

    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 shadow rounded-md">
      <div className="z-10 w-full max-w-sm text-center">
        <div className="text-white text-8xl font-extrabold mb-10">
          <img src="/logo.png" alt="Logo" className="w-20 h-20 mx-auto" />
        </div>
        {error && <p className="text-red-500 mb-2">{error}</p>}
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="flex flex-col">
            <div className="flex items-center border border-white/60 rounded-md px-3 py-2 text-white">
              <Mail size={18} className="mr-2 opacity-80" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-transparent w-full outline-none placeholder-white/60"
                required
              />
            </div>
            {emailError && <p className="text-red-400 text-sm mt-1 text-left pl-1">{emailError}</p>}
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center border border-white/60 rounded-md px-3 py-2 text-white">
              <Lock size={18} className="mr-2 opacity-80" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-transparent w-full outline-none placeholder-white/60"
                required
              />
              {showPassword ? (
                <EyeOff
                  size={18}
                  className="cursor-pointer opacity-80"
                  onClick={() => setShowPassword(false)}
                />
              ) : (
                <Eye
                  size={18}
                  className="cursor-pointer opacity-80"
                  onClick={() => setShowPassword(true)}
                />
              )}
            </div>
            {passwordError && <p className="text-red-400 text-sm mt-1 text-left pl-1">{passwordError}</p>}
          </div>
          
          <button
            type="submit"
            className="w-full bg-white text-[#3B006A] font-semibold py-2 rounded-md hover:bg-gray-100 transition"
          >
            Sign In
          </button>
        </form>
      </div>
      {/* <h2 className="text-2xl font-bold mb-4 text-center">Sign In</h2> */}
      
    </div>
  );
}

