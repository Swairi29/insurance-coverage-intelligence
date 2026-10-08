// Business profiles saved to the account: list, read, create, update, delete.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { BusinessProfile, SavedBusinessProfile } from './types';

/** Same as the gateway's MAX_BUSINESS_PROFILES. */
export const MAX_BUSINESS_PROFILES = 20;

export const businessProfilesQueryKey = ['business-profiles'] as const;
export const businessProfileQueryKey = (profileId: string) =>
  ['business-profiles', profileId] as const;

const path = (profileId?: string) =>
  profileId
    ? `/api/v1/business-profiles/${encodeURIComponent(profileId)}`
    : '/api/v1/business-profiles';

/** The user's profiles, most recently changed first. */
export function useBusinessProfiles() {
  return useQuery({
    queryKey: businessProfilesQueryKey,
    queryFn: ({ signal }) => api.get<SavedBusinessProfile[]>(path(), { signal }),
  });
}

export function useBusinessProfile(profileId: string, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: businessProfileQueryKey(profileId),
    enabled,
    queryFn: ({ signal }) => api.get<SavedBusinessProfile>(path(profileId), { signal }),
    // Shown at once when the list is already loaded; still fetched fresh.
    initialData: () =>
      queryClient
        .getQueryData<SavedBusinessProfile[]>(businessProfilesQueryKey)
        ?.find((saved) => saved.profile_id === profileId),
  });
}

/** POST when there is no profileId yet, PUT to replace an existing one. */
export function useSaveBusinessProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, profile }: { profileId?: string; profile: BusinessProfile }) =>
      profileId
        ? api.put<SavedBusinessProfile>(path(profileId), profile)
        : api.post<SavedBusinessProfile>(path(), profile),
    retry: false,
    onSuccess: (saved) => {
      queryClient.setQueryData(businessProfileQueryKey(saved.profile_id), saved);
      return queryClient.invalidateQueries({ queryKey: businessProfilesQueryKey, exact: true });
    },
  });
}

export function useDeleteBusinessProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.delete(path(profileId)),
    retry: false,
    onSuccess: (_, profileId) => {
      queryClient.removeQueries({ queryKey: businessProfileQueryKey(profileId) });
      return queryClient.invalidateQueries({ queryKey: businessProfilesQueryKey, exact: true });
    },
  });
}
