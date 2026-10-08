import { screen, waitFor, within } from '@testing-library/react';
import type { SavedBusinessProfile } from '../api/types';
import { db } from '../mocks/db';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

function saved(profileId: string, business_name: string): SavedBusinessProfile {
  return {
    profile_id: profileId,
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-01T09:00:00Z',
    profile: {
      business_name,
      business_type: 'cafe',
      employee_count: 4,
      location: { city: 'Kandy', country: 'Sri Lanka' },
    },
  };
}

async function openBusinesses() {
  loginAsDemoUser();
  const result = renderApp('/app/businesses');
  await screen.findByRole('heading', { name: 'Businesses' });
  return result;
}

describe('businesses page', () => {
  it('lists every saved business with a way to analyse, edit or delete it', async () => {
    db.businessProfiles = [saved('BP-one', 'Hill Cafe'), saved('BP-two', 'Lake Cafe')];
    await openBusinesses();

    const list = await screen.findByRole('list', { name: 'Your businesses' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const hill = within(list).getByRole('listitem', { name: 'Hill Cafe' });
    expect(hill).toHaveTextContent('Café');
    expect(hill).toHaveTextContent('Kandy, Sri Lanka');
    expect(within(hill).getByRole('link', { name: 'Analyse this business →' })).toHaveAttribute(
      'href',
      '/app/analyses/new/profile?profile=BP-one&step=policies',
    );
    expect(within(hill).getByRole('link', { name: 'Edit Hill Cafe' })).toHaveAttribute(
      'href',
      '/app/businesses/BP-one',
    );
    expect(screen.getByRole('link', { name: 'Add a business' })).toHaveAttribute(
      'href',
      '/app/businesses/new',
    );
  });

  it('asks a user without a saved business to add one', async () => {
    db.businessProfiles = [];
    await openBusinesses();

    expect(await screen.findByText('No business profile yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add business profile' })).toHaveAttribute(
      'href',
      '/app/businesses/new',
    );
  });

  it('deletes a business only after it is confirmed', async () => {
    db.businessProfiles = [saved('BP-one', 'Hill Cafe'), saved('BP-two', 'Lake Cafe')];
    const { user } = await openBusinesses();
    const hill = await screen.findByRole('listitem', { name: 'Hill Cafe' });

    await user.click(within(hill).getByRole('button', { name: 'Delete Hill Cafe' }));
    await user.click(within(hill).getByRole('button', { name: 'Keep it' }));
    expect(db.businessProfiles).toHaveLength(2);

    await user.click(within(hill).getByRole('button', { name: 'Delete Hill Cafe' }));
    expect(within(hill).getByRole('group', { name: 'Delete Hill Cafe?' })).toHaveTextContent(
      'Past analyses are kept.',
    );
    await user.click(within(hill).getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Hill Cafe' })).not.toBeInTheDocument(),
    );
    expect(db.businessProfiles.map((p) => p.profile_id)).toEqual(['BP-two']);
  });
});
