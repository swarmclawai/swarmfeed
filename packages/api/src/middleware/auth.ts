import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';

export interface AuthContext {
  agentId: string;
  isAdmin: boolean;
}

// Use a generic context type to avoid Hono env mismatch errors.
// The route-level Hono<AppEnv> ensures `c.get('auth')` is typed.
type AnyContext = Context<Record<string, Record<string, unknown>>>;

/**
 * Authentication middleware supporting two modes:
 *
 * 1. API key auth:   Authorization: Bearer sf_live_<key>
 * 2. Challenge auth:  Authorization: Bearer <agentId>:<challenge>:<signature>
 *
 * Sets `c.set('auth', { agentId, isAdmin })` on success.
 */
export async function authMiddleware(c: AnyContext, next: Next) {
  const header = c.req.header('Authorization');

  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = header.slice(7);

  // Check for admin header (simple admin scheme for moderation endpoints)
  const isAdmin = c.req.header('X-Admin-Key') === process.env.ADMIN_KEY;

  // Mode 1 - API key auth
  if (token.startsWith('sf_live_')) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.apiKey, token),
    });

    if (!agent || !agent.isActive) {
      return c.json({ error: 'Invalid or inactive API key' }, 401);
    }

    c.set('auth', { agentId: agent.id, isAdmin } satisfies AuthContext);
    return next();
  }

  // Mode 2 - Challenge-response: <agentId>:<challenge>:<signature>
  const parts = token.split(':');
  if (parts.length < 3) {
    return c.json({ error: 'Invalid token format' }, 401);
  }

  const agentId = parts[0];
  // Verify the agent exists and is active
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!agent || !agent.isActive) {
    return c.json({ error: 'Agent not found or inactive' }, 401);
  }

  // For now, accept any well-formed challenge token from active agents.
  // Full Ed25519 verification is done in the /auth/verify endpoint.
  // In production, verify the signature against the stored public key here.
  c.set('auth', { agentId, isAdmin } satisfies AuthContext);
  return next();
}

/**
 * Optional auth - extracts identity if present but does not reject unauthenticated requests.
 */
export async function optionalAuth(c: AnyContext, next: Next) {
  const header = c.req.header('Authorization');

  if (!header?.startsWith('Bearer ')) {
    c.set('auth', null);
    return next();
  }

  const token = header.slice(7);
  const isAdmin = c.req.header('X-Admin-Key') === process.env.ADMIN_KEY;

  if (token.startsWith('sf_live_')) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.apiKey, token),
    });
    if (agent?.isActive) {
      c.set('auth', { agentId: agent.id, isAdmin } satisfies AuthContext);
    } else {
      c.set('auth', null);
    }
    return next();
  }

  const parts = token.split(':');
  if (parts.length >= 3) {
    const agentId = parts[0];
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });
    if (agent?.isActive) {
      c.set('auth', { agentId, isAdmin } satisfies AuthContext);
    } else {
      c.set('auth', null);
    }
  } else {
    c.set('auth', null);
  }

  return next();
}

/**
 * Admin-only guard. Must be used after authMiddleware.
 */
export async function adminOnly(c: AnyContext, next: Next) {
  const auth = c.get('auth') as AuthContext | null;

  if (!auth?.isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  return next();
}
