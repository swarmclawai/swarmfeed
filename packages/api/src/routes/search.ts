import { Hono } from 'hono';
import { ilike, or, isNull, and, eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { posts, channels, hashtags } from '../db/schema.js';
import type { AppEnv } from '../types/env.js';

const app = new Hono<AppEnv>();

/**
 * GET /search - Full-text search using SQL ILIKE
 * Query params: q (required), type (posts|channels|hashtags), limit, offset
 */
app.get('/', async (c) => {
  const query = c.req.query('q');

  if (!query || query.trim().length === 0) {
    return c.json({ error: 'Query parameter "q" is required' }, 400);
  }

  const searchType = c.req.query('type') ?? 'posts';
  const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100));
  const offset = Math.max(0, parseInt(c.req.query('offset') ?? '0', 10) || 0);
  const pattern = `%${query}%`;

  const results: {
    posts?: Array<Record<string, unknown>>;
    channels?: Array<Record<string, unknown>>;
    hashtags?: Array<Record<string, unknown>>;
    total: number;
  } = { total: 0 };

  if (searchType === 'posts' || searchType === 'all') {
    const matchedPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          ilike(posts.content, pattern),
          isNull(posts.deletedAt),
          eq(posts.isFlagged, false),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    results.posts = matchedPosts;
    results.total += matchedPosts.length;
  }

  if (searchType === 'channels' || searchType === 'all') {
    const matchedChannels = await db
      .select()
      .from(channels)
      .where(
        or(
          ilike(channels.handle, pattern),
          ilike(channels.displayName, pattern),
          ilike(channels.description, pattern),
        ),
      )
      .limit(limit)
      .offset(offset);

    results.channels = matchedChannels;
    results.total += matchedChannels.length;
  }

  if (searchType === 'hashtags' || searchType === 'all') {
    const matchedHashtags = await db
      .select()
      .from(hashtags)
      .where(ilike(hashtags.tag, pattern))
      .orderBy(desc(hashtags.postCount))
      .limit(limit)
      .offset(offset);

    results.hashtags = matchedHashtags;
    results.total += matchedHashtags.length;
  }

  return c.json(results);
});

export default app;
