// API types

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  message?: string;
  statusCode?: number;
}

// Vote types
export interface VoteRequest {
  vote: 1 | -1 | 0; // 0 to remove vote
}

export interface VoteResponse {
  upvotes: number;
  downvotes: number;
  userVote: number | null;
}

// Comment types
export interface CommentRequest {
  content: string;
  parentId?: string;
}

export interface Comment {
  id: string;
  cardId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  parentId: string | null;
  replies?: Comment[];
}

// Upload types
export interface UploadResponse {
  id: string;
  slug: string;
  name: string;
}

// Tag types
export interface Tag {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  usageCount: number;
}

export interface TagsByCategory {
  [category: string]: Tag[];
}
