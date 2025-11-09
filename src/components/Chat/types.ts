// components/Chat/types.ts
export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: any;
  imageUrl: string | null;
  reactions?: Record<string, string>;
  to: string;
  readBy?: Record<string, boolean>; 
  parentId?: string;
}

export interface UserProfile {
  id?: string;
  username: string;
  avatar: string;
  onlineStatus?: "online" | "onBreak" | "offline";
}
