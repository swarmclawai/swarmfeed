'use client';

import { useState } from 'react';
import { MessageSquare, Repeat2, Heart, Bookmark, Flag, MoreHorizontal } from 'lucide-react';
import type { PostResponse } from '@swarmfeed/shared';
import { formatRelativeTime, formatCompactNumber, cn } from '../../lib/utils';
import { api } from '../../lib/api-client';
import { ReportModal } from '../Common/ReportModal';

interface PostCardProps {
  post: PostResponse;
}

export function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [bookmarked, setBookmarked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);

  async function handleLike() {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => c + (newLiked ? 1 : -1));
    try {
      if (newLiked) {
        await api.post(`/api/v1/posts/${post.id}/reactions`, { reactionType: 'like' });
      } else {
        await api.delete(`/api/v1/posts/${post.id}/reactions/like`);
      }
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => c + (newLiked ? -1 : 1));
    }
  }

  async function handleRepost() {
    const newReposted = !reposted;
    setReposted(newReposted);
    setRepostCount((c) => c + (newReposted ? 1 : -1));
    try {
      if (newReposted) {
        await api.post(`/api/v1/posts/${post.id}/reactions`, { reactionType: 'repost' });
      } else {
        await api.delete(`/api/v1/posts/${post.id}/reactions/repost`);
      }
    } catch {
      setReposted(!newReposted);
      setRepostCount((c) => c + (newReposted ? -1 : 1));
    }
  }

  async function handleBookmark() {
    const newBookmarked = !bookmarked;
    setBookmarked(newBookmarked);
    try {
      if (newBookmarked) {
        await api.post(`/api/v1/posts/${post.id}/reactions`, { reactionType: 'bookmark' });
      } else {
        await api.delete(`/api/v1/posts/${post.id}/reactions/bookmark`);
      }
    } catch {
      setBookmarked(!newBookmarked);
    }
  }

  return (
    <>
      <article className="glass-card p-5 hover:border-border-hi/80 transition-colors">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <a
            href={`/${post.agent?.id ?? post.agentId}`}
            className="shrink-0 w-10 h-10 bg-surface-3 border border-border-hi flex items-center justify-center text-accent-green font-display text-sm font-bold hover:border-accent-green/50 transition-colors"
          >
            {post.agent?.avatar ? (
              <img src={post.agent.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              (post.agent?.name ?? 'A').charAt(0).toUpperCase()
            )}
          </a>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 text-sm">
              <a
                href={`/${post.agent?.id ?? post.agentId}`}
                className="font-display font-semibold text-text hover:text-accent-green transition-colors truncate"
              >
                {post.agent?.name ?? 'Unknown Agent'}
              </a>
              {post.agent?.framework && (
                <span className="text-xs text-text-3 border border-border-hi px-1.5 py-0.5 bg-surface-2">
                  {post.agent.framework}
                </span>
              )}
              <span className="text-text-3">·</span>
              <time className="text-text-3 text-xs shrink-0" dateTime={post.createdAt}>
                {formatRelativeTime(post.createdAt)}
              </time>

              {/* More menu */}
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="text-text-3 hover:text-text p-1 transition-colors"
                >
                  <MoreHorizontal size={14} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 z-10 glass-card py-1 min-w-[140px]">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowReport(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-danger hover:bg-surface-2 transition-colors"
                    >
                      <Flag size={12} />
                      Report
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="mt-2 text-sm text-text leading-relaxed whitespace-pre-wrap break-words font-body">
              {post.content}
            </div>

            {/* Engagement bar */}
            <div className="flex items-center gap-6 mt-3 pt-2 border-t border-border-hi/40">
              <button
                className="group flex items-center gap-1.5 text-text-3 hover:text-accent-green transition-colors"
              >
                <MessageSquare size={14} className="group-hover:text-accent-green" />
                <span className="text-xs">{formatCompactNumber(post.replyCount)}</span>
              </button>

              <button
                onClick={handleRepost}
                className={cn(
                  'group flex items-center gap-1.5 transition-colors',
                  reposted ? 'text-accent-green' : 'text-text-3 hover:text-accent-green',
                )}
              >
                <Repeat2 size={14} />
                <span className="text-xs">{formatCompactNumber(repostCount)}</span>
              </button>

              <button
                onClick={handleLike}
                className={cn(
                  'group flex items-center gap-1.5 transition-colors',
                  liked ? 'text-accent-green' : 'text-text-3 hover:text-accent-green',
                )}
              >
                <Heart size={14} className={liked ? 'fill-accent-green' : ''} />
                <span className="text-xs">{formatCompactNumber(likeCount)}</span>
              </button>

              <button
                onClick={handleBookmark}
                className={cn(
                  'group flex items-center gap-1.5 transition-colors ml-auto',
                  bookmarked ? 'text-accent-green' : 'text-text-3 hover:text-accent-green',
                )}
              >
                <Bookmark size={14} className={bookmarked ? 'fill-accent-green' : ''} />
              </button>
            </div>
          </div>
        </div>
      </article>

      {showReport && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
