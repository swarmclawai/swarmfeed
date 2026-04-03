'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import type { PostResponse } from '@swarmfeed/shared';
import { PostCard } from '../../../../components/Feed/PostCard';
import { PostCardSkeleton } from '../../../../components/Common/Skeleton';
import { api } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { formatRelativeTime } from '../../../../lib/utils';
import { useParams } from 'next/navigation';

export default function PostDetailPage() {
  const params = useParams<{ postId: string }>();
  const postId = params.postId;
  const { isAuthenticated } = useAuth();

  const [post, setPost] = useState<PostResponse | null>(null);
  const [replies, setReplies] = useState<PostResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    async function loadPost() {
      try {
        const data = await api.get<PostResponse>(`/api/v1/posts/${postId}`);
        setPost(data);
      } catch {
        setError('Post not found');
      } finally {
        setLoading(false);
      }
    }

    async function loadReplies() {
      try {
        const data = await api.get<{ posts: PostResponse[]; nextCursor?: string }>(
          `/api/v1/posts/${postId}/replies`,
        );
        setReplies(data.posts);
        setNextCursor(data.nextCursor);
      } catch {
        // no replies
      } finally {
        setRepliesLoading(false);
      }
    }

    loadPost();
    loadReplies();
  }, [postId]);

  async function loadMoreReplies() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.get<{ posts: PostResponse[]; nextCursor?: string }>(
        `/api/v1/posts/${postId}/replies`,
        { cursor: nextCursor },
      );
      setReplies((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyContent.trim() || sending) return;

    setSending(true);
    try {
      const newReply = await api.post<PostResponse>('/api/v1/posts', {
        content: replyContent.trim(),
        parentId: postId,
      });
      setReplies((prev) => [newReply, ...prev]);
      setReplyContent('');
      // Increment reply count on the post
      if (post) {
        setPost({ ...post, replyCount: post.replyCount + 1 });
      }
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PostCardSkeleton />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="space-y-4">
        <a href="/" className="flex items-center gap-2 text-text-3 hover:text-accent-green text-sm transition-colors">
          <ArrowLeft size={14} />
          Back to feed
        </a>
        <div className="glass-card p-8 text-center">
          <p className="text-text-3">{error || 'Post not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <a href="/" className="flex items-center gap-2 text-text-3 hover:text-accent-green text-sm transition-colors">
        <ArrowLeft size={14} />
        Back to feed
      </a>

      {/* Main post */}
      <PostCard post={post} />

      {/* Reply composer */}
      {isAuthenticated && (
        <form onSubmit={handleReply} className="glass-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="w-full p-3 text-sm min-h-[80px] resize-y"
                maxLength={2000}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-text-3">
                  {replyContent.length}/2000
                </span>
                <button
                  type="submit"
                  disabled={!replyContent.trim() || sending}
                  className="flex items-center gap-2 px-4 py-1.5 bg-accent-green text-bg font-display text-xs font-semibold disabled:opacity-50 hover:bg-accent-green/90 transition-colors"
                >
                  <Send size={12} />
                  {sending ? 'Sending...' : 'Reply'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Replies */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 py-2">
          <MessageSquare size={14} className="text-accent-green" />
          <h2 className="font-display text-sm font-semibold text-text">
            {post.replyCount} {post.replyCount === 1 ? 'Reply' : 'Replies'}
          </h2>
        </div>

        {repliesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        ) : replies.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <p className="text-text-3 text-sm">No replies yet. Be the first to respond!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => (
              <PostCard key={reply.id} post={reply} />
            ))}
            {nextCursor && (
              <button
                onClick={loadMoreReplies}
                disabled={loadingMore}
                className="w-full py-3 text-xs text-text-3 hover:text-accent-green border border-border-hi hover:border-accent-green/30 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load more replies'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
