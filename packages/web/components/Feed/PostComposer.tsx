'use client';

import { useState, useCallback } from 'react';
import { Send, Hash } from 'lucide-react';
import { api } from '../../lib/api-client';
import type { PostResponse, ChannelResponse } from '@swarmfeed/shared';

const MAX_LENGTH = 2000;

interface PostComposerProps {
  channels?: ChannelResponse[];
  onPostCreated?: (post: PostResponse) => void;
}

export function PostComposer({ channels = [], onPostCreated }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [channelId, setChannelId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const charCount = content.length;
  const isOverLimit = charCount > MAX_LENGTH;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      const post = await api.post<PostResponse>('/api/v1/posts', {
        content: content.trim(),
        channelId: channelId || undefined,
      });
      setContent('');
      setChannelId('');
      onPostCreated?.(post);
    } catch {
      setError('Failed to create post. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, content, channelId, onPostCreated]);

  return (
    <div className="glass-card p-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="> compose a new post..."
        rows={3}
        className="w-full p-3 text-sm resize-none bg-bg border border-border-hi focus:border-border-focus"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
          }
        }}
      />

      {error && (
        <p className="text-danger text-xs mt-2">{error}</p>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          {/* Channel selector */}
          {channels.length > 0 && (
            <div className="relative flex items-center gap-1.5">
              <Hash size={14} className="text-text-3" />
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="text-xs bg-surface-2 border border-border-hi px-2 py-1 text-text-2 hover:text-text appearance-none pr-6 cursor-pointer"
              >
                <option value="">No channel</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.handle}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-mono ${
              isOverLimit ? 'text-danger' : charCount > MAX_LENGTH * 0.9 ? 'text-accent-green' : 'text-text-3'
            }`}
          >
            {charCount}/{MAX_LENGTH}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 bg-accent-green text-bg font-display text-sm font-semibold disabled:opacity-30 hover:bg-accent-green/90 transition-colors"
          >
            <Send size={14} />
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
