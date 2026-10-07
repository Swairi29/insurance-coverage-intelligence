import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AnalysisProgress, ScenarioAnalysisResponse } from './types';

export interface ScenarioAnalysisRequest {
  scenario: string;
  policy_ids: string[];
}

export function useStartScenarioAnalysis() {
  return useMutation({
    mutationFn: (body: ScenarioAnalysisRequest) =>
      api.post<AnalysisProgress>('/api/v1/scenario-analyses', body),
    retry: false,
  });
}

export function useScenarioAnalysisStatus(requestId: string | undefined) {
  return useQuery({
    queryKey: ['scenario-analyses', requestId, 'status'],
    queryFn: ({ signal }) =>
      api.get<AnalysisProgress>(
        `/api/v1/scenario-analyses/${encodeURIComponent(requestId!)}/status`,
        { signal },
      ),
    enabled: Boolean(requestId),
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 1000 : false),
    refetchIntervalInBackground: true,
  });
}

export function useScenarioAnalysis(requestId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['scenario-analyses', requestId],
    queryFn: ({ signal }) =>
      api.get<ScenarioAnalysisResponse>(
        `/api/v1/scenario-analyses/${encodeURIComponent(requestId!)}`,
        { signal },
      ),
    enabled: Boolean(requestId) && enabled,
    staleTime: Infinity,
  });
}
