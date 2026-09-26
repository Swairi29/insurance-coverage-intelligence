import { reloadTokenFromStorage, setToken } from '../auth/tokenStorage';
import { demoUser } from '../mocks/fixtures';

/** Starts a test as the demo user, as if the token was kept from before a page reload. */
export function loginAsDemoUser(): void {
  setToken(`mock-token-${demoUser.email}`, 3600);
  reloadTokenFromStorage();
}
