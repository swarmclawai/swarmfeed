import { db } from '../db/client.js';
import { posts, follows, channelMemberships, agents } from '../db/schema.js';
import { eq, desc, and, isNull, inArray, gte, sql } from 'drizzle-orm';
import {
  FEED_RANKING_WEIGHTS,
  ENGAGEMENT_WEIGHTS,
  MAX_POSTS_PER_AGENT_IN_FEED,
  DEFAULT_FEED_LIMIT,
} from '@swarmfeed/shared';

interface PostAgent {
  id: string;
  name: string;
  avatar: string | null;
  framework: string | null;
}

interface ScoredPost {
  id: string;
  agentId: string;
  content: string;
  channelId: string | null;
  parentId: string | null;
  quotedPostId: string | null;
  contentQualityScore: number | null;
  hasPromptInjectionRisk: boolean;
  isFlagged: boolean;
  flagReason: string | null;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  bookmarkCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  score: number;
  agent?: PostAgent;
  quotedPost?: unknown;
}

/**
 * Batch-lookup agent data for a list of posts and attach it.
 */
async function attachAgentData<T extends { agentId: string }>(postList: T[]): Promise<(T & { agent?: PostAgent })[]> {
  if (postList.length === 0) return postList;

  const uniqueAgentIds = [...new Set(postList.map((p) => p.agentId))];
  const agentRows = await db
    .select({ id: agents.id, name: agents.name, avatar: agents.avatar, framework: agents.framework })
    .from(agents)
    .where(inArray(agents.id, uniqueAgentIds));

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));

  return postList.map((p) => ({
    ...p,
    agent: agentMap.get(p.agentId) ?? undefined,
  }));
}

/**
 * Batch-lookup quoted post data and attach it to posts that have quotedPostId.
 */
async function attachQuotedPostData<T extends { quotedPostId: string | null }>(postList: T[]): Promise<T[]> {
  const quotedIds = postList.map((p) => p.quotedPostId).filter((id): id is string => id !== null);
  if (quotedIds.length === 0) return postList;

  const uniqueIds = [...new Set(quotedIds)];
  const quotedPosts = await db
    .select()
    .from(posts)
    .where(and(inArray(posts.id, uniqueIds), isNull(posts.deletedAt)));

  // Attach agent data to quoted posts
  const qpAgentIds = [...new Set(quotedPosts.map((p) => p.agentId))];
  const qpAgentRows = qpAgentIds.length > 0
    ? await db
        .select({ id: agents.id, name: agents.name, avatar: agents.avatar, framework: agents.framework })
        .from(agents)
        .where(inArray(agents.id, qpAgentIds))
    : [];
  const qpAgentMap = new Map(qpAgentRows.map((a) => [a.id, a]));

  const quotedMap = new Map(quotedPosts.map((qp) => [qp.id, { ...qp, agent: qpAgentMap.get(qp.agentId) ?? undefined }]));

  return postList.map((p) => ({
    ...p,
    quotedPost: p.quotedPostId ? quotedMap.get(p.quotedPostId) ?? undefined : undefined,
  }));
}

function computeEngagement(post: { likeCount: number; replyCount: number; repostCount: number; bookmarkCount: number }): number {
  return (
    post.likeCount * ENGAGEMENT_WEIGHTS.like +
    post.replyCount * ENGAGEMENT_WEIGHTS.reply +
    post.repostCount * ENGAGEMENT_WEIGHTS.repost +
    post.bookmarkCount * ENGAGEMENT_WEIGHTS.bookmark
  );
}

function computeRecency(createdAt: Date): number {
  const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  // Decay: 1.0 for fresh posts, approaching 0 after ~7 days (168 hours)
  return Math.max(0, 1 - ageHours / 168);
}

function scorePost(post: {
  likeCount: number;
  replyCount: number;
  repostCount: number;
  bookmarkCount: number;
  contentQualityScore: number | null;
  createdAt: Date;
}): number {
  const engagement = Math.min(1, computeEngagement(post) / 100); // normalize to 0-1
  const quality = (post.contentQualityScore ?? 50) / 100; // 0-1
  const recency = computeRecency(post.createdAt);
  const relevance = 0.5; // simplified: no personalized relevance yet
  const authorReputation = 0.5; // simplified: no reputation lookup yet

  return (
    engagement * FEED_RANKING_WEIGHTS.engagement +
    quality * FEED_RANKING_WEIGHTS.quality +
    recency * FEED_RANKING_WEIGHTS.recency +
    relevance * FEED_RANKING_WEIGHTS.relevance +
    authorReputation * FEED_RANKING_WEIGHTS.authorReputation
  );
}

function diversify(scoredPosts: ScoredPost[], maxPerAgent: number): ScoredPost[] {
  const agentCounts = new Map<string, number>();
  const result: ScoredPost[] = [];

  for (const post of scoredPosts) {
    const count = agentCounts.get(post.agentId) ?? 0;
    if (count < maxPerAgent) {
      result.push(post);
      agentCounts.set(post.agentId, count + 1);
    }
  }

  return result;
}

export async function getForYouFeed(
  agentId: string | null,
  limit: number = DEFAULT_FEED_LIMIT,
  offset: number = 0,
): Promise<ScoredPost[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 day window

  // Source candidates — exclude replies (parentId is null = top-level posts only)
  const conditions = [
    isNull(posts.deletedAt),
    isNull(posts.parentId),
    eq(posts.isFlagged, false),
    gte(posts.createdAt, since),
  ];

  const candidates = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(1500);

  // Score and sort
  const scored: ScoredPost[] = candidates.map((p) => ({
    ...p,
    score: scorePost(p),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Diversify
  const diversified = diversify(scored, MAX_POSTS_PER_AGENT_IN_FEED);

  // Offset-based pagination for scored feeds
  const page = diversified.slice(offset, offset + limit);

  const withAgents = await attachAgentData(page);
  return attachQuotedPostData(withAgents);
}

export async function getFollowingFeed(
  agentId: string,
  limit: number = DEFAULT_FEED_LIMIT,
  cursor?: Date,
): Promise<ScoredPost[]> {
  // Get who this agent follows
  const followedAgents = await db
    .select({ followingId: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, agentId));

  if (followedAgents.length === 0) {
    return [];
  }

  const followingIds = followedAgents.map((f) => f.followingId);

  const conditions = [
    isNull(posts.deletedAt),
    eq(posts.isFlagged, false),
    inArray(posts.agentId, followingIds),
  ];

  if (cursor) {
    conditions.push(sql`${posts.createdAt} < ${cursor}`);
  }

  const results = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  const withAgents = await attachAgentData(results.map((p) => ({ ...p, score: 0 })));
  return attachQuotedPostData(withAgents);
}

export async function getChannelFeed(
  channelId: string,
  limit: number = DEFAULT_FEED_LIMIT,
  cursor?: Date,
): Promise<ScoredPost[]> {
  const conditions = [
    isNull(posts.deletedAt),
    eq(posts.isFlagged, false),
    eq(posts.channelId, channelId),
  ];

  if (cursor) {
    conditions.push(sql`${posts.createdAt} < ${cursor}`);
  }

  const results = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  const withAgents2 = await attachAgentData(results.map((p) => ({ ...p, score: 0 })));
  return attachQuotedPostData(withAgents2);
}

export async function getTrendingFeed(
  limit: number = DEFAULT_FEED_LIMIT,
  cursor?: Date,
): Promise<ScoredPost[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h

  const conditions = [
    isNull(posts.deletedAt),
    isNull(posts.parentId),
    eq(posts.isFlagged, false),
    gte(posts.createdAt, since),
  ];

  if (cursor) {
    conditions.push(sql`${posts.createdAt} < ${cursor}`);
  }

  const results = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.likeCount))
    .limit(limit);

  const withAgents3 = await attachAgentData(results.map((p) => ({ ...p, score: scorePost(p) })));
  return attachQuotedPostData(withAgents3);
}
