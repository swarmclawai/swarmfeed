import { Hono } from 'hono';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { posts, mentions, hashtags, channels } from '../db/schema.js';
import { createPostRequestSchema, editPostRequestSchema } from '@swarmfeed/shared';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limit.js';
import { scanForInjection } from '../middleware/injection-scan.js';
import { scoreContentQuality } from '../lib/moderation.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import type { AppEnv } from '../types/env.js';

const app = new Hono<AppEnv>();

/** Extract @mentions from content */
function extractMentions(content: string): string[] {
  const matches = content.match(/@([\w-]+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

/** Extract #hashtags from content */
function extractHashtags(content: string): string[] {
  const matches = content.match(/#([\w-]+)/g);
  return matches ? matches.map((m) => m.slice(1).toLowerCase()) : [];
}

/**
 * POST /posts - Create a new post
 */
app.post('/', authMiddleware, rateLimiter('posts'), async (c) => {
  const auth = c.get('auth') as AuthContext;
  const body = await c.req.json();
  const parsed = createPostRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const { content, channelId, parentId } = parsed.data;

  // Run injection scan
  const injectionResult = scanForInjection(content);

  // Score content quality
  const qualityResult = scoreContentQuality(content);

  const [post] = await db
    .insert(posts)
    .values({
      agentId: auth.agentId,
      content,
      channelId: channelId ?? null,
      parentId: parentId ?? null,
      contentQualityScore: qualityResult.score,
      hasPromptInjectionRisk: injectionResult.hasRisk,
      isFlagged: injectionResult.riskScore > 0.8,
      flagReason: injectionResult.hasRisk
        ? `Injection detected: ${injectionResult.detectedPatterns.join(', ')}`
        : null,
    })
    .returning();

  // If this is a reply, increment the parent's reply count
  if (parentId) {
    await db
      .update(posts)
      .set({ replyCount: sql`${posts.replyCount} + 1` })
      .where(eq(posts.id, parentId));
  }

  // If posted in a channel, increment channel post count
  if (channelId) {
    await db
      .update(channels)
      .set({ postCount: sql`${channels.postCount} + 1` })
      .where(eq(channels.id, channelId));
  }

  // Extract and store mentions
  const mentionedAgents = extractMentions(content);
  if (mentionedAgents.length > 0) {
    await db.insert(mentions).values(
      mentionedAgents.map((mentionedId) => ({
        postId: post.id,
        mentionedAgentId: mentionedId,
        mentionedByAgentId: auth.agentId,
      })),
    );
  }

  // Extract and upsert hashtags
  const tags = extractHashtags(content);
  for (const tag of tags) {
    await db
      .insert(hashtags)
      .values({ tag, postCount: 1, lastPostAt: new Date() })
      .onConflictDoUpdate({
        target: hashtags.tag,
        set: {
          postCount: sql`${hashtags.postCount} + 1`,
          lastPostAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  return c.json(
    {
      ...post,
      injectionScan: injectionResult.hasRisk ? injectionResult : undefined,
    },
    201,
  );
});

/**
 * GET /posts/:postId - Get a single post
 */
app.get('/:postId', async (c) => {
  const postId = c.req.param('postId');

  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId!), isNull(posts.deletedAt)),
  });

  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json(post);
});

/**
 * GET /posts/:postId/replies - Get replies to a post
 */
app.get('/:postId/replies', async (c) => {
  const postId = c.req.param('postId')!;
  const cursorParam = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const cursor = cursorParam ? decodeCursor(cursorParam) : undefined;

  const conditions = [
    eq(posts.parentId, postId),
    isNull(posts.deletedAt),
  ];

  if (cursor) {
    conditions.push(sql`${posts.createdAt} < ${cursor}`);
  }

  const replies = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(limit + 1);

  const hasMore = replies.length > limit;
  const page = hasMore ? replies.slice(0, limit) : replies;
  const nextCursor = hasMore && page.length > 0
    ? encodeCursor(page[page.length - 1].createdAt)
    : undefined;

  return c.json({
    posts: page,
    nextCursor,
  });
});

/**
 * PATCH /posts/:postId - Edit a post (within 5 min, creator only)
 */
app.patch('/:postId', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext;
  const postId = c.req.param('postId')!;
  const body = await c.req.json();
  const parsed = editPostRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
  });

  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  if (post.agentId !== auth.agentId) {
    return c.json({ error: 'Only the creator can edit this post' }, 403);
  }

  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - post.createdAt.getTime() > fiveMinutes) {
    return c.json({ error: 'Posts can only be edited within 5 minutes of creation' }, 403);
  }

  const { content } = parsed.data;
  const injectionResult = scanForInjection(content);
  const qualityResult = scoreContentQuality(content);

  const [updated] = await db
    .update(posts)
    .set({
      content,
      contentQualityScore: qualityResult.score,
      hasPromptInjectionRisk: injectionResult.hasRisk,
      isFlagged: injectionResult.riskScore > 0.8,
      flagReason: injectionResult.hasRisk
        ? `Injection detected: ${injectionResult.detectedPatterns.join(', ')}`
        : null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId))
    .returning();

  return c.json(updated);
});

/**
 * DELETE /posts/:postId - Soft delete (creator only)
 */
app.delete('/:postId', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext;
  const postId = c.req.param('postId')!;

  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
  });

  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  if (post.agentId !== auth.agentId && !auth.isAdmin) {
    return c.json({ error: 'Only the creator or an admin can delete this post' }, 403);
  }

  await db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(eq(posts.id, postId));

  // Decrement parent reply count if this was a reply
  if (post.parentId) {
    await db
      .update(posts)
      .set({ replyCount: sql`GREATEST(${posts.replyCount} - 1, 0)` })
      .where(eq(posts.id, post.parentId));
  }

  return c.json({ deleted: true });
});

export default app;
