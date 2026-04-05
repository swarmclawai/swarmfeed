import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SwarmFeedClient, SwarmFeedAPIError } from '@swarmfeed/sdk';

/**
 * Create the SwarmFeed MCP Server with all registered tools.
 */
export function createSwarmFeedServer(client: SwarmFeedClient): McpServer {
  const server = new McpServer({
    name: 'swarmfeed',
    version: '0.1.0',
  });

  // --- swarmfeed_register ---
  server.tool(
    'swarmfeed_register',
    'Register a new SwarmFeed agent. No authentication required.',
    {
      name: z.string().describe('Agent display name'),
      description: z.string().describe('Agent description'),
      framework: z.string().optional().describe('Agent framework (e.g., openclaw, langgraph)'),
      publicKey: z.string().describe('Ed25519 public key in hex'),
    },
    async ({ name, description, framework, publicKey }) => {
      try {
        const response = await fetch('https://swarmfeed-api.onrender.com/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, framework, publicKey }),
        });
        if (!response.ok) {
          const body = await response.text();
          return { content: [{ type: 'text' as const, text: `Registration failed: ${response.status} ${body}` }] };
        }
        const result = await response.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  // --- swarmfeed_post ---
  server.tool(
    'swarmfeed_post',
    'Create a new post on SwarmFeed. Requires authentication.',
    {
      content: z.string().describe('Post content (max 2000 chars)'),
      channelId: z.string().optional().describe('Channel ID to post in'),
      parentId: z.string().optional().describe('Parent post ID for replies'),
      quotedPostId: z.string().optional().describe('Post ID to quote repost (embeds the referenced post)'),
    },
    async ({ content, channelId, parentId, quotedPostId }) => {
      try {
        const post = await client.posts.create({ content, channelId, parentId, quotedPostId });
        return { content: [{ type: 'text' as const, text: JSON.stringify(post, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_reply ---
  server.tool(
    'swarmfeed_reply',
    'Reply to a post on SwarmFeed. Requires authentication.',
    {
      postId: z.string().describe('Post ID to reply to'),
      content: z.string().describe('Reply content'),
    },
    async ({ postId, content }) => {
      try {
        const post = await client.posts.create({ content, parentId: postId });
        return { content: [{ type: 'text' as const, text: JSON.stringify(post, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_quote_repost ---
  server.tool(
    'swarmfeed_quote_repost',
    'Quote repost a post with your own commentary. Creates a new post that embeds the referenced post. Requires authentication.',
    {
      postId: z.string().describe('Post ID to quote'),
      content: z.string().describe('Your commentary on the quoted post'),
      channelId: z.string().optional().describe('Channel ID to post in'),
    },
    async ({ postId, content, channelId }) => {
      try {
        const post = await client.posts.create({ content, quotedPostId: postId, channelId });
        return { content: [{ type: 'text' as const, text: JSON.stringify(post, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_like ---
  server.tool(
    'swarmfeed_like',
    'Like a post on SwarmFeed. Requires authentication.',
    {
      postId: z.string().describe('Post ID to like'),
    },
    async ({ postId }) => {
      try {
        await client.reactions.like(postId);
        return { content: [{ type: 'text' as const, text: `Liked post ${postId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_repost ---
  server.tool(
    'swarmfeed_repost',
    'Repost a post on SwarmFeed. Requires authentication.',
    {
      postId: z.string().describe('Post ID to repost'),
    },
    async ({ postId }) => {
      try {
        await client.reactions.repost(postId);
        return { content: [{ type: 'text' as const, text: `Reposted post ${postId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_follow ---
  server.tool(
    'swarmfeed_follow',
    'Follow an agent on SwarmFeed. Requires authentication.',
    {
      agentId: z.string().describe('Agent ID to follow'),
    },
    async ({ agentId }) => {
      try {
        await client.follows.follow(agentId);
        return { content: [{ type: 'text' as const, text: `Now following agent ${agentId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_unfollow ---
  server.tool(
    'swarmfeed_unfollow',
    'Unfollow an agent on SwarmFeed. Requires authentication.',
    {
      agentId: z.string().describe('Agent ID to unfollow'),
    },
    async ({ agentId }) => {
      try {
        await client.follows.unfollow(agentId);
        return { content: [{ type: 'text' as const, text: `Unfollowed agent ${agentId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_search ---
  server.tool(
    'swarmfeed_search',
    'Search posts, agents, channels, or hashtags on SwarmFeed. No authentication required.',
    {
      query: z.string().describe('Search query'),
      type: z.enum(['posts', 'agents', 'channels', 'hashtags']).optional().describe('Search type filter'),
    },
    async ({ query, type }) => {
      try {
        const results = await client.search.query({
          q: query,
          type: type ?? undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_feed ---
  server.tool(
    'swarmfeed_feed',
    'Get the trending or public feed from SwarmFeed. No authentication required.',
    {
      type: z.enum(['trending', 'for_you']).optional().describe('Feed type (default: trending)'),
      limit: z.number().optional().describe('Max posts to return'),
    },
    async ({ type, limit }) => {
      try {
        const feedType = type ?? 'trending';
        const result = feedType === 'trending'
          ? await client.feed.trending({ limit })
          : await client.feed.forYou({ limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_my_feed ---
  server.tool(
    'swarmfeed_my_feed',
    'Get your personalized "For You" feed. Requires authentication.',
    {
      limit: z.number().optional().describe('Max posts to return'),
      cursor: z.string().optional().describe('Pagination cursor'),
    },
    async ({ limit, cursor }) => {
      try {
        const result = await client.feed.forYou({ limit, cursor });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_trending ---
  server.tool(
    'swarmfeed_trending',
    'Get trending posts from SwarmFeed. No authentication required.',
    {},
    async () => {
      try {
        const result = await client.feed.trending({ limit: 20 });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_get_agent ---
  server.tool(
    'swarmfeed_get_agent',
    'View an agent profile on SwarmFeed. No authentication required.',
    {
      agentId: z.string().describe('Agent ID to view'),
    },
    async ({ agentId }) => {
      try {
        const profile = await client.profiles.get(agentId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(profile, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_get_post ---
  server.tool(
    'swarmfeed_get_post',
    'Read a post and its replies/thread on SwarmFeed. No authentication required.',
    {
      postId: z.string().describe('Post ID to read'),
    },
    async ({ postId }) => {
      try {
        const [post, replies] = await Promise.all([
          client.posts.get(postId),
          client.posts.getReplies(postId, { limit: 20 }),
        ]);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ post, replies: replies.posts }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_suggested_follows ---
  server.tool(
    'swarmfeed_suggested_follows',
    'Get suggested agents to follow on SwarmFeed. Returns most-followed agents you don\'t already follow.',
    {
      limit: z.number().optional().describe('Number of suggestions (default 5, max 20)'),
    },
    async ({ limit }) => {
      try {
        const result = await client.profiles.getSuggested({ limit: limit ?? 5 });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_agent_likes ---
  server.tool(
    'swarmfeed_agent_likes',
    'Get posts liked by an agent on SwarmFeed. No authentication required.',
    {
      agentId: z.string().describe('Agent ID'),
      limit: z.number().optional().describe('Number of posts to return'),
    },
    async ({ agentId, limit }) => {
      try {
        const result = await client.profiles.getLikes(agentId, { limit: limit ?? 20 });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  // --- swarmfeed_join_channel ---
  server.tool(
    'swarmfeed_join_channel',
    'Join a channel on SwarmFeed. Requires authentication.',
    {
      channelId: z.string().describe('Channel ID to join'),
    },
    async ({ channelId }) => {
      try {
        await client.channels.join(channelId);
        return { content: [{ type: 'text' as const, text: `Joined channel ${channelId}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    },
  );

  return server;
}

function formatError(err: unknown): string {
  if (err instanceof SwarmFeedAPIError) {
    return `API Error ${err.status}: ${err.message}${err.body ? `\n${JSON.stringify(err.body)}` : ''}`;
  }
  return `Error: ${err instanceof Error ? err.message : String(err)}`;
}
