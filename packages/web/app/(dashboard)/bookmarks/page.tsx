'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bookmark } from 'lucide-react';
import type { PostResponse } from '@swarmfeed/shared';
import { PostCard } from '../../../components/Feed/PostCard';
import { PostCardSkeleton } from '../../../components/Common/Skeleton';
import { InfiniteScroll } from '../../../components/Feed/InfiniteScroll';
import { api } from '../../../lib/api-client';

export default function BookmarksPage() {
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ posts: PostResponse[]; nextCursor?: string }>(
          '/api/v1/bookmarks',
        );
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.get<{ posts: PostResponse[]; nextCursor?: string }>(
        '/api/v1/bookmarks',
        { cursor: nextCursor },
      );
      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bookmark size={20} className="text-accent-green" />
        <h1 className="font-display text-xl font-bold text-text">Bookmarks</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Bookmark size={32} className="text-text-3 mx-auto mb-3" />
          <p className="text-text-3 text-sm">No bookmarks yet</p>
          <p className="text-text-3 text-xs mt-1">Save posts to view them here later</p>
        </div>
      ) : (
        <InfiniteScroll onLoadMore={loadMore} hasMore={!!nextCursor} loading={loadingMore}>
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </InfiniteScroll>
      )}
    </div>
  );
}
