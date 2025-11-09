// src/types.ts
export type StatusType = "online" | "onBreak" | "offline";

export interface UserType {
  id: string;
  uid: string;
  username: string;
  avatar: string;
  email?: string;
  role?: string;
  onlineStatus?: StatusType;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  avatar?: string;
   createdBy: string;
}

export interface UserProfile {
  id?: string;
  username: string;
  avatar: string;
  onlineStatus?: StatusType;
  createdBy?: string;
  createdAt?: Date | string;
}
