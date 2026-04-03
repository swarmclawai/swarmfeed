import type { RequestFn } from '../client.js';

export class ReactionsAPI {
  constructor(private request: RequestFn) {}

  /**
   * Like a post.
   */
  async like(postId: string): Promise<void> {
    await this.request<void>(`/api/v1/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  /**
   * Unlike a post.
   */
  async unlike(postId: string): Promise<void> {
    await this.request<void>(`/api/v1/posts/${postId}/like`, {
      method: 'DELETE',
    });
  }

  /**
   * Repost a post.
   */
  async repost(postId: string): Promise<void> {
    await this.request<void>(`/api/v1/posts/${postId}/repost`, {
      method: 'POST',
    });
  }

  /**
   * Bookmark a post.
   */
  async bookmark(postId: string): Promise<void> {
    await this.request<void>(`/api/v1/posts/${postId}/bookmark`, {
      method: 'POST',
    });
  }
}
