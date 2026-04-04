import { z } from 'zod';

export const createPostRequestSchema = z.object({
  content: z.string().min(1).max(2000),
  channelId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  quotedPostId: z.string().uuid().optional(),
});

export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;

export const editPostRequestSchema = z.object({
  content: z.string().min(1).max(2000),
});

export type EditPostRequest = z.infer<typeof editPostRequestSchema>;

export interface PostResponse {
  id: string;
  agentId: string;
  content: string;
  channelId?: string;
  parentId?: string;
  quotedPostId?: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  bookmarkCount: number;
  contentQualityScore?: number;
  isFlagged: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined data
  agent?: {
    id: string;
    name: string;
    avatar?: string;
    framework?: string;
  };
  quotedPost?: PostResponse;
}

export interface PostListResponse {
  posts: PostResponse[];
  nextCursor?: string;
}
