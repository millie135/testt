"use client";

import { useState } from "react";
import { auth, db, rtdb } from "@/firebaseConfig";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ref as rtdbRef, set as rtdbSet } from "firebase/database";
import { Eye, EyeOff, User, Mail, Lock, Link as LinkIcon } from "lucide-react";


export default function SignUp() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setEmailError("");
    setPasswordError("");
    setUsernameError("");
    let valid = true;

    // Username validation
    if (username.trim().length < 3) {
      setUsernameError("Username must be at least 3 characters");
      valid = false;
    }

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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      //const uid = userCredential.user.uid;

      const avatarUrl =
      avatar.trim() !== ""
        ? avatar.trim()
        : `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`;

      // Save additional info in Firestore
      await setDoc(doc(db, "users", user.uid), {
        username: username,
        email,
        role: "user", // default role
        avatar: avatarUrl,
        createdAt: new Date()
      });

      // Set Realtime DB status immediately
      const statusRef = rtdbRef(rtdb, `/status/${user.uid}`);
      await rtdbSet(statusRef, "online"); // or true if you use boolean

      setSuccess("Account created successfully!");
      setEmail(""); setPassword(""); setUsername(""); setAvatar("");
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
        {success && <p className="text-green-500 mb-2">{success}</p>}
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="flex flex-col">
            <div className="flex items-center border border-white/60 rounded-md px-3 py-2 text-white">
              <User size={18} className="mr-2 opacity-80" />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-transparent w-full outline-none placeholder-white/60"
                required
              />
            </div>
            {usernameError && <p className="text-red-400 text-sm mt-1 text-left pl-1">{usernameError}</p>}
          </div>
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
          
          <div className="flex items-center border border-white/60 rounded-md px-3 py-2 text-white">
            <LinkIcon size={18} className="mr-2 opacity-80" />
            <input
              type="text"
              placeholder="Avatar URL"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="bg-transparent w-full outline-none placeholder-white/60"
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-white text-[#3B006A] font-semibold py-2 rounded-md hover:bg-gray-100 transition"
          >
            Sign Up
          </button>
        </form>
      </div>
      {/* <h2 className="text-2xl font-bold mb-4 text-center">Sign Up</h2> */}
      
    </div>
  );
}

