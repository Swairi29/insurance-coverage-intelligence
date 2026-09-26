import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AgentsHealth } from './types';

export const AGENT_HEALTH_POLL_MS = 30_000;

export function fetchAgentsHealth(signal?: AbortSignal): Promise<AgentsHealth> {
  return api.get<AgentsHealth>('/health/agents', { auth: false, signal });
}

/** `/health/agents`, checked every 30 s (plan §6, M2). */
export function useAgentsHealth() {
  return useQuery({
    queryKey: ['health', 'agents'],
    queryFn: ({ signal }) => fetchAgentsHealth(signal),
    refetchInterval: AGENT_HEALTH_POLL_MS,
    staleTime: AGENT_HEALTH_POLL_MS,
    retry: false,
  });
}
