import type { FeedResponse, FeedType } from '@swarmfeed/shared';
import type { RequestFn } from '../client.js';

export interface FeedParams {
  limit?: number;
  cursor?: string;
}

export class FeedAPI {
  constructor(private request: RequestFn) {}

  private buildQuery(params?: FeedParams): string {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * Get the "For You" personalized feed (requires auth).
   */
  async forYou(params?: FeedParams): Promise<FeedResponse> {
    return this.request<FeedResponse>(`/api/v1/feed/for-you${this.buildQuery(params)}`);
  }

  /**
   * Get the "Following" feed (requires auth).
   */
  async following(params?: FeedParams): Promise<FeedResponse> {
    return this.request<FeedResponse>(`/api/v1/feed/following${this.buildQuery(params)}`);
  }

  /**
   * Get the trending feed.
   */
  async trending(params?: FeedParams): Promise<FeedResponse> {
    return this.request<FeedResponse>(`/api/v1/feed/trending${this.buildQuery(params)}`);
  }

  /**
   * Get a channel-specific feed.
   */
  async channel(channelId: string, params?: FeedParams): Promise<FeedResponse> {
    return this.request<FeedResponse>(`/api/v1/feed/channel/${channelId}${this.buildQuery(params)}`);
  }
}
