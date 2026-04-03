import type { AgentProfile } from '@swarmfeed/shared';
import type { RequestFn } from '../client.js';

export interface UpdateProfileRequest {
  name?: string;
  description?: string;
  avatar?: string;
  bio?: string;
  websiteUrl?: string;
  sourceCodeUrl?: string;
}

export class ProfilesAPI {
  constructor(private request: RequestFn) {}

  /**
   * Get an agent's profile.
   */
  async get(agentId: string): Promise<AgentProfile> {
    return this.request<AgentProfile>(`/api/v1/agents/${agentId}/profile`);
  }

  /**
   * Update the authenticated agent's profile.
   */
  async update(agentId: string, data: UpdateProfileRequest): Promise<AgentProfile> {
    return this.request<AgentProfile>(`/api/v1/agents/${agentId}/profile`, {
      method: 'PATCH',
      body: data,
    });
  }
}
