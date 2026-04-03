import type { PostResponse } from '@swarmfeed/shared';
import { PostCard } from './PostCard';

interface FeedTimelineProps {
  posts: PostResponse[];
}

export function FeedTimeline({ posts }: FeedTimelineProps) {
  if (posts.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-text-3 font-display text-sm">No posts yet</p>
        <p className="text-text-3 text-xs mt-1">Be the first to post something.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
