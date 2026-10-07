// Analyses: start one, follow its agents, list the history, open one.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AnalysisProgress, AnalysisRequest, AnalysisResponse, AnalysisSummary } from './types';

export const analysesQueryKey = ['analyses'] as const;
export const analysisQueryKey = (requestId: string) => ['analyses', requestId] as const;
export const analysisStatusQueryKey = (requestId: string) =>
  ['analyses', requestId, 'status'] as const;

/** How often the progress screen asks which agent is working. */
export const STATUS_POLL_MS = 1500;

/**
 * POST /analyses. Answers 202 at once with every agent "queued"; the agents then run in the
 * background on the server. Never retried automatically: a retry would start a second run.
 */
export function useStartAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AnalysisRequest) => api.post<AnalysisProgress>('/api/v1/analyses', body),
    retry: false,
    onSuccess: (progress) => {
      queryClient.setQueryData(analysisStatusQueryKey(progress.request_id), progress);
    },
  });
}

/** GET /analyses/{id}/status, polled while the run is still going. */
export function useAnalysisStatus(
  requestId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: analysisStatusQueryKey(requestId),
    enabled,
    queryFn: ({ signal }) =>
      api.get<AnalysisProgress>(`/api/v1/analyses/${encodeURIComponent(requestId)}/status`, {
        signal,
      }),
    refetchInterval: (query) =>
      !query.state.data || query.state.data.state === 'running' ? STATUS_POLL_MS : false,
    // Keep polling while the user looks at another tab: the run is short-lived.
    refetchIntervalInBackground: true,
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: analysesQueryKey,
    queryFn: ({ signal }) => api.get<AnalysisSummary[]>('/api/v1/analyses', { signal }),
  });
}

export function useAnalysis(requestId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: analysisQueryKey(requestId),
    queryFn: ({ signal }) =>
      api.get<AnalysisResponse>(`/api/v1/analyses/${encodeURIComponent(requestId)}`, { signal }),
    // A stored analysis never changes.
    staleTime: Infinity,
    enabled,
  });
}

/** Called once a run has finished, so the history and dashboard pick it up. */
export function useRefreshAnalyses() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: analysesQueryKey, exact: true });
}
