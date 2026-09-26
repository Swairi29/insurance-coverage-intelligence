import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { SESSION_KEYS } from '../lib/session';
import { DEMO_PASSWORD, demoUser } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { safeNextPath } from './redirect';
import { reloadTokenFromStorage, setToken } from './tokenStorage';

type User = ReturnType<typeof renderApp>['user'];

const location = () => screen.getByTestId('location').textContent;

async function fillLogin(user: User, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

/** Pretends a token was kept in sessionStorage before a page reload. */
function storedToken(token: string) {
  setToken(token, 3600);
  reloadTokenFromStorage();
}

describe('protected pages', () => {
  it('sends an anonymous user to login, then back to the page they wanted', async () => {
    const { user } = renderApp('/app/policies');

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(location()).toBe('/login?next=%2Fapp%2Fpolicies');

    await fillLogin(user, demoUser.email, DEMO_PASSWORD);

    expect(await screen.findByRole('heading', { name: 'Policies' })).toBeInTheDocument();
    expect(location()).toBe('/app/policies');
    expect(screen.getByText(demoUser.email)).toBeInTheDocument();
  });

  it('keeps the user logged in after a reload (token in sessionStorage)', async () => {
    storedToken(`mock-token-${demoUser.email}`);
    renderApp('/app');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('logs out and asks to log in again when the stored token is rejected', async () => {
    storedToken('mock-token-expired');
    renderApp('/app/analyses');

    expect(
      await screen.findByText('Your session has expired. Please log in again.'),
    ).toBeInTheDocument();
    expect(location()).toBe('/login?next=%2Fapp%2Fanalyses');
    expect(window.sessionStorage.getItem(SESSION_KEYS.token)).toBeNull();
  });

  it('logs out when any API call returns 401 during the session', async () => {
    storedToken(`mock-token-${demoUser.email}`);
    renderApp('/app/policies');
    await screen.findByRole('heading', { name: 'Policies' });

    server.use(
      http.get('*/api/v1/policies', () =>
        HttpResponse.json({ detail: 'Invalid or expired token.' }, { status: 401 }),
      ),
    );
    await act(() => api.get('/api/v1/policies').catch(() => undefined));

    expect(
      await screen.findByText('Your session has expired. Please log in again.'),
    ).toBeInTheDocument();
    expect(location()).toBe('/login?next=%2Fapp%2Fpolicies');
  });

  it('sends a logged-in user away from the login page', async () => {
    storedToken(`mock-token-${demoUser.email}`);
    renderApp('/login');

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(location()).toBe('/app');
  });
});

describe('login', () => {
  it('asks for missing details without calling the API', async () => {
    const { user } = renderApp('/login');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });

  it('shows the gateway message for a wrong password', async () => {
    const { user } = renderApp('/login');
    await fillLogin(user, demoUser.email, 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(location()).toBe('/login');
  });

  it('locks the form after too many failed attempts (429)', async () => {
    const { user } = renderApp('/login');
    for (let i = 0; i < 5; i++) {
      await user.clear(screen.getByLabelText('Password'));
      await user.clear(screen.getByLabelText('Email'));
      await fillLogin(user, demoUser.email, 'wrong');
      await screen.findByText('Invalid email or password.');
    }
    await user.clear(screen.getByLabelText('Password'));
    await user.clear(screen.getByLabelText('Email'));
    await fillLogin(user, demoUser.email, DEMO_PASSWORD);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many failed logins');
    expect(alert).toHaveTextContent('You can try again in about 15 minutes.');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
  });

  it('explains when login is unavailable (503)', async () => {
    const { user } = renderApp('/login');
    await fillLogin(user, demoUser.email, 'server-down');

    expect(await screen.findByRole('alert')).toHaveTextContent('Login is not available right now.');
  });
});

describe('register and logout', () => {
  it('checks the form before sending it', async () => {
    const { user } = renderApp('/register');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
  });

  it('shows a taken email on the email field (409)', async () => {
    const { user } = renderApp('/register');
    await user.type(screen.getByLabelText('Email'), 'taken@insureintel.test');
    await user.type(screen.getByLabelText('Password'), 'long-enough');
    await user.type(screen.getByLabelText('Confirm password'), 'long-enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('registers, logs in automatically, then logs out and clears the session', async () => {
    const { user } = renderApp('/register');
    await user.type(screen.getByLabelText('Email'), 'owner@newshop.test');
    await user.type(screen.getByLabelText('Password'), 'long-enough');
    await user.type(screen.getByLabelText('Confirm password'), 'long-enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await screen.findByRole('heading', { name: 'Dashboard' });
    const header = screen.getByRole('banner');
    expect(within(header).getByText('owner@newshop.test')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(SESSION_KEYS.token)).not.toBeNull();

    window.sessionStorage.setItem(SESSION_KEYS.profileDraft, '{"business_name":"x"}');
    await user.click(within(header).getByRole('button', { name: 'Log out' }));

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(location()).toBe('/login');
    expect(window.sessionStorage.getItem(SESSION_KEYS.token)).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_KEYS.profileDraft)).toBeNull();
    // A normal logout is not an expired session.
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('shows the main navigation and marks the current page', async () => {
    storedToken(`mock-token-${demoUser.email}`);
    // New analysis needs a saved profile, or it sends the user to the profile page.
    window.sessionStorage.setItem(
      SESSION_KEYS.profileDraft,
      JSON.stringify({ business_name: 'Test Bakery', business_type: 'bakery' }),
    );
    const { user } = renderApp('/app');
    await screen.findByRole('heading', { name: 'Dashboard' });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('link', { name: 'New analysis' }));

    await waitFor(() => expect(location()).toBe('/app/analyses/new'));
    expect(within(nav).getByRole('link', { name: 'New analysis' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current');
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/app/policies', '/app/policies'],
    ['/app/analyses/abc?tab=coverage', '/app/analyses/abc?tab=coverage'],
    [null, '/app'],
    ['', '/app'],
    ['/login', '/app'],
    ['//evil.test/app', '/app'],
    ['https://evil.test/app', '/app'],
    ['/app\\..\\evil', '/app'],
  ])('%s -> %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});
