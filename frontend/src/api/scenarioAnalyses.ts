import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { AnalysisProgress, AnalysisSummary, ScenarioAnalysisResponse } from './types';

export interface ScenarioAnalysisRequest {
  scenario: string;
  policy_ids: string[];
}

export const scenarioAnalysesListKey = ['scenario-analyses', 'list'] as const;

export function useStartScenarioAnalysis() {
  return useMutation({
    mutationFn: (body: ScenarioAnalysisRequest) =>
      api.post<AnalysisProgress>('/api/v1/scenario-analyses', body),
    retry: false,
  });
}

/** GET /scenario-analyses: the user's saved scenario runs, newest first. */
export function useScenarioAnalyses() {
  return useQuery({
    queryKey: scenarioAnalysesListKey,
    queryFn: ({ signal }) => api.get<AnalysisSummary[]>('/api/v1/scenario-analyses', { signal }),
  });
}

export function useScenarioAnalysisStatus(requestId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['scenario-analyses', requestId, 'status'],
    queryFn: ({ signal }) =>
      api.get<AnalysisProgress>(
        `/api/v1/scenario-analyses/${encodeURIComponent(requestId!)}/status`,
        { signal },
      ),
    enabled: Boolean(requestId) && enabled,
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
