export interface User {
  id: string;
  _id?: string;
  uuid?: string;
  username: string;
  email: string;
  profilePic?: string;
  personalInviteCode?: string;
  balance: number; // pence
  tuneBytes?: number;
  role: string[];
  isActive: boolean;
  emailVerified?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
