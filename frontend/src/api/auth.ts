// Gateway auth endpoints (plan §3.2).
import { api } from './client';
import type { LoginRequest, RegisterRequest, TokenResponse, UserResponse } from './types';

export function loginRequest(body: LoginRequest): Promise<TokenResponse> {
  return api.post<TokenResponse>('/api/v1/auth/login', body, { auth: false });
}

export function registerRequest(body: RegisterRequest): Promise<UserResponse> {
  return api.post<UserResponse>('/api/v1/auth/register', body, { auth: false });
}

export function fetchCurrentUser(signal?: AbortSignal): Promise<UserResponse> {
  return api.get<UserResponse>('/api/v1/auth/me', { signal });
}
