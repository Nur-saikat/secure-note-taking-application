export interface User {
  id: string;
  username: string;
  email: string;
  role: 'User' | 'Admin';
  interests: string[];
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  expiresAtUtc: string;
  user: User;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNote extends Note {
  ownerUsername: string;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface PostFeedItem extends Post {
  authorUsername: string;
}

export interface UserPostsResponse extends Paged<Post> {
  userId: string;
  username: string;
}

export interface InterestUser {
  id: string;
  username: string;
}

export interface InterestGroup {
  interest: string;
  count: number;
  users: InterestUser[];
}

export interface InterestGroupsResponse extends Paged<InterestGroup> {}

export interface ApiProblem {
  title?: string;
  detail?: string;
  status?: number;
  errors?: Record<string, string[]>;
}
