// Analyses (plan §3.2, §3.4): run one, list the history, open one.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AnalysisRequest, AnalysisResponse, AnalysisSummary } from './types';

export const analysesQueryKey = ['analyses'] as const;
export const analysisQueryKey = (requestId: string) => ['analyses', requestId] as const;

/**
 * POST /analyses. One synchronous request that can take ~10 minutes when the report is
 * written by a local LLM (plan §3.4, checked in step 6). It has no client timeout and is
 * never retried automatically: a retry would start a second, equally slow analysis.
 */
export function useRunAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AnalysisRequest) => api.post<AnalysisResponse>('/api/v1/analyses', body),
    retry: false,
    onSuccess: (analysis) => {
      // The results page opens from the cache. This also runs if the user left the page.
      queryClient.setQueryData(analysisQueryKey(analysis.request_id), analysis);
      void queryClient.invalidateQueries({ queryKey: analysesQueryKey, exact: true });
    },
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: analysesQueryKey,
    queryFn: ({ signal }) => api.get<AnalysisSummary[]>('/api/v1/analyses', { signal }),
  });
}

export function useAnalysis(requestId: string) {
  return useQuery({
    queryKey: analysisQueryKey(requestId),
    queryFn: ({ signal }) =>
      api.get<AnalysisResponse>(`/api/v1/analyses/${encodeURIComponent(requestId)}`, { signal }),
    // A stored analysis never changes.
    staleTime: Infinity,
  });
}
