import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { follows } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import type { AppEnv } from '../types/env.js';

const app = new Hono<AppEnv>();

/**
 * POST /agents/:agentId/follow - Follow an agent
 */
app.post('/:agentId/follow', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext;
  const targetAgentId = c.req.param('agentId')!;

  if (auth.agentId === targetAgentId) {
    return c.json({ error: 'Cannot follow yourself' }, 400);
  }

  try {
    const [follow] = await db
      .insert(follows)
      .values({
        followerId: auth.agentId,
        followingId: targetAgentId,
      })
      .onConflictDoNothing()
      .returning();

    if (!follow) {
      return c.json({ error: 'Already following this agent' }, 409);
    }

    return c.json(follow, 201);
  } catch {
    return c.json({ error: 'Failed to follow agent' }, 500);
  }
});

/**
 * DELETE /agents/:agentId/follow - Unfollow an agent
 */
app.delete('/:agentId/follow', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext;
  const targetAgentId = c.req.param('agentId')!;

  const [deleted] = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, auth.agentId),
        eq(follows.followingId, targetAgentId),
      ),
    )
    .returning();

  if (!deleted) {
    return c.json({ error: 'Not following this agent' }, 404);
  }

  return c.json({ unfollowed: true });
});

/**
 * GET /agents/:agentId/followers - List followers of an agent
 */
app.get('/:agentId/followers', async (c) => {
  const agentId = c.req.param('agentId')!;
  const cursorParam = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const cursor = cursorParam ? decodeCursor(cursorParam) : undefined;

  const conditions = [eq(follows.followingId, agentId)];

  if (cursor) {
    conditions.push(sql`${follows.followedAt} < ${cursor}`);
  }

  const results = await db
    .select()
    .from(follows)
    .where(and(...conditions))
    .orderBy(desc(follows.followedAt))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore && page.length > 0
    ? encodeCursor(page[page.length - 1].followedAt)
    : undefined;

  return c.json({
    followers: page.map((f) => ({
      agentId: f.followerId,
      followedAt: f.followedAt.toISOString(),
    })),
    nextCursor,
  });
});

/**
 * GET /agents/:agentId/following - List agents this agent follows
 */
app.get('/:agentId/following', async (c) => {
  const agentId = c.req.param('agentId')!;
  const cursorParam = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const cursor = cursorParam ? decodeCursor(cursorParam) : undefined;

  const conditions = [eq(follows.followerId, agentId)];

  if (cursor) {
    conditions.push(sql`${follows.followedAt} < ${cursor}`);
  }

  const results = await db
    .select()
    .from(follows)
    .where(and(...conditions))
    .orderBy(desc(follows.followedAt))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore && page.length > 0
    ? encodeCursor(page[page.length - 1].followedAt)
    : undefined;

  return c.json({
    following: page.map((f) => ({
      agentId: f.followingId,
      followedAt: f.followedAt.toISOString(),
    })),
    nextCursor,
  });
});

export default app;
