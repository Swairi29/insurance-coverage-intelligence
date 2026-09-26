// Policy PDFs (plan §3.2): list them and upload new ones.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadWithProgress } from './client';
import type { PolicyDocument, PolicyUploadResponse } from './types';

/** Same as the gateway's MAX_UPLOAD_MB default. */
export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
/** An analysis can use at most this many policies (AnalysisRequest.policy_ids). */
export const MAX_POLICIES_PER_ANALYSIS = 5;

export const policiesQueryKey = ['policies'] as const;

export function usePolicies() {
  return useQuery({
    queryKey: policiesQueryKey,
    queryFn: ({ signal }) => api.get<PolicyDocument[]>('/api/v1/policies', { signal }),
  });
}

/** Checked before sending, so the user does not wait for an upload that will be refused. */
export function checkPolicyFile(file: File): string | null {
  const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) return 'Only PDF files can be uploaded.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `The file is larger than ${MAX_UPLOAD_MB} MB.`;
  return null;
}

export function useUploadPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (fraction: number) => void }) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return uploadWithProgress<PolicyUploadResponse>('/api/v1/policies', form, { onProgress });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: policiesQueryKey }),
  });
}
