import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { SavedBusinessProfile } from '../api/types';
import { db } from '../mocks/db';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

const location = () => screen.getByTestId('location').textContent;

/** The Yes / No / Not sure group for a question. */
const question = (text: string) => screen.getByRole('group', { name: text });
const saveButton = () => screen.getByRole('button', { name: 'Save business profile' });

const HARDWARE: SavedBusinessProfile = {
  profile_id: 'BP-hardware0000001',
  created_at: '2026-09-01T09:00:00Z',
  updated_at: '2026-09-01T09:00:00Z',
  profile: {
    business_name: 'Hilltop Hardware',
    business_type: 'retail_shop',
    equipment: ['CCTV'],
    operations: { stores_customer_data: true },
    location: { flood_prone_area: false },
  },
};

async function openProfile(route: Parameters<typeof renderApp>[0] = '/app/businesses/new') {
  loginAsDemoUser();
  const result = renderApp(route);
  await screen.findByRole('heading', { name: 'Business profile' });
  await screen.findByLabelText(/Business name/);
  return result;
}

describe('business profile form', () => {
  beforeEach(() => {
    db.businessProfiles = [];
  });

  it('offers the main business types in groups, and asks what an "Other" business is', async () => {
    const { user } = await openProfile();
    const select = screen.getByLabelText(/Type of business/);
    expect(within(select).getByRole('group', { name: 'Shops' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Pharmacy' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/What kind of business is it/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Business name/), 'Lanka Prints');
    await user.selectOptions(select, 'other');
    const detail = await screen.findByLabelText(/What kind of business is it/);
    await user.click(saveButton());
    expect(
      await screen.findByText('Describe the type of business in a few words.'),
    ).toBeInTheDocument();
    expect(db.businessProfiles).toEqual([]);

    await user.type(detail, 'Printing shop');
    await user.click(saveButton());
    expect(await screen.findByRole('heading', { name: 'Businesses' })).toBeInTheDocument();
    expect(db.businessProfiles[0].profile).toMatchObject({
      business_type: 'other',
      business_type_detail: 'Printing shop',
    });
  });

  it('requires the name and the type, and saves nothing until they are given', async () => {
    const { user } = await openProfile();
    await user.click(saveButton());

    expect(await screen.findByText('Enter the business name.')).toBeInTheDocument();
    expect(screen.getByText('Choose the type of business.')).toBeInTheDocument();
    expect(location()).toBe('/app/businesses/new');
    expect(db.businessProfiles).toEqual([]);
  });

  it('saves the profile to the account, with "Not sure" as null, and lists it', async () => {
    const { user } = await openProfile();

    await user.type(screen.getByLabelText(/Business name/), 'Sunrise Bakery');
    await user.selectOptions(screen.getByLabelText(/Type of business/), 'bakery');
    await user.type(screen.getByLabelText('Number of employees'), '8');
    await user.type(screen.getByLabelText('Equipment and systems'), 'Ovens{Enter}');
    await user.type(screen.getByLabelText('Equipment and systems'), 'Mixers,');
    await user.click(screen.getByRole('checkbox', { name: 'Delivery' }));
    await user.click(within(question('Do you accept card payments?')).getByLabelText('Yes'));
    await user.click(within(question('Do you handle cash?')).getByLabelText('No'));
    await user.type(screen.getByLabelText('City'), 'Colombo');
    await user.click(saveButton());

    const list = await screen.findByRole('list', { name: 'Your businesses' });
    expect(location()).toBe('/app/businesses');
    expect(within(list).getByRole('heading', { name: 'Sunrise Bakery' })).toBeInTheDocument();
    expect(db.businessProfiles).toHaveLength(1);
    expect(db.businessProfiles[0].profile).toEqual({
      business_name: 'Sunrise Bakery',
      business_type: 'bakery',
      description: null,
      employee_count: 8,
      equipment: ['Ovens', 'Mixers'],
      operations: {
        sales_channels: ['delivery'],
        accepts_card_payments: true,
        handles_cash: false,
        stores_customer_data: null,
        operates_single_location: null,
      },
      location: { city: 'Colombo', district: null, country: null, flood_prone_area: null },
    });
  });

  it.each([
    ['300', 'This tool is for businesses with up to 250 employees.'],
    ['8.5', 'Enter a whole number.'],
    ['-1', 'Enter a whole number.'],
  ])('rejects %s employees', async (value, message) => {
    const { user } = await openProfile();
    await user.type(screen.getByLabelText('Number of employees'), value);
    await user.click(saveButton());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Number of employees')).toHaveAttribute('aria-invalid', 'true');
  });

  it('ignores duplicate equipment and lets items be removed', async () => {
    const { user } = await openProfile();
    const equipment = screen.getByLabelText('Equipment and systems');

    await user.type(equipment, 'Ovens{Enter}');
    await user.type(equipment, 'ovens{Enter}');
    expect(screen.getByText('"ovens" is already in the list.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Ovens' }));
    expect(screen.queryByRole('button', { name: 'Remove Ovens' })).not.toBeInTheDocument();
  });

  it('loads a saved profile for editing and replaces it on save', async () => {
    db.businessProfiles = [structuredClone(HARDWARE)];
    const { user } = await openProfile(`/app/businesses/${HARDWARE.profile_id}`);

    const name = screen.getByLabelText(/Business name/);
    expect(name).toHaveValue('Hilltop Hardware');
    expect(screen.getByLabelText(/Type of business/)).toHaveValue('retail_shop');
    expect(screen.getByRole('button', { name: 'Remove CCTV' })).toBeInTheDocument();
    expect(
      within(question('Do you store customer data (names, phone numbers, orders)?')).getByLabelText(
        'Yes',
      ),
    ).toBeChecked();
    expect(
      within(question('Is the business in a flood-prone area?')).getByLabelText('No'),
    ).toBeChecked();
    expect(within(question('Do you handle cash?')).getByLabelText('Not sure')).toBeChecked();

    await user.clear(name);
    await user.type(name, 'Hilltop Hardware & Paint');
    await user.click(saveButton());

    await screen.findByRole('list', { name: 'Your businesses' });
    expect(db.businessProfiles).toHaveLength(1);
    expect(db.businessProfiles[0].profile_id).toBe(HARDWARE.profile_id);
    expect(db.businessProfiles[0].profile.business_name).toBe('Hilltop Hardware & Paint');
  });

  it('says so when the profile to edit does not exist', async () => {
    loginAsDemoUser();
    renderApp('/app/businesses/BP-missing');

    expect(await screen.findByText('This business profile was not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to businesses' })).toHaveAttribute(
      'href',
      '/app/businesses',
    );
  });

  it('shows a 422 from saving next to the field', async () => {
    server.use(
      http.post('*/api/v1/business-profiles', () =>
        HttpResponse.json(
          {
            error: 'validation_error',
            message: 'The request could not be processed because some input was invalid.',
            details: [
              { field: 'location.city', message: 'String should have at most 80 characters' },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = await openProfile();
    await user.type(screen.getByLabelText(/Business name/), 'Sunrise Bakery');
    await user.selectOptions(screen.getByLabelText(/Type of business/), 'bakery');

    await user.click(saveButton());

    expect(await screen.findByText('String should have at most 80 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toHaveAttribute('aria-invalid', 'true');
    expect(location()).toBe('/app/businesses/new');
  });

  it('shows why a save failed when it is not the input', async () => {
    server.use(
      http.post('*/api/v1/business-profiles', () =>
        HttpResponse.json(
          {
            error: 'profile_limit',
            message: 'You can save up to 20 business profiles. Delete one to add another.',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = await openProfile();
    await user.type(screen.getByLabelText(/Business name/), 'Sunrise Bakery');
    await user.selectOptions(screen.getByLabelText(/Type of business/), 'bakery');

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can save up to 20 business profiles.',
    );
    expect(location()).toBe('/app/businesses/new');
  });

  it('shows a server 422 from an analysis on the right fields', async () => {
    db.businessProfiles = [structuredClone(HARDWARE)];
    await openProfile({
      pathname: `/app/businesses/${HARDWARE.profile_id}`,
      state: {
        serverErrors: [
          {
            field: 'business.employee_count',
            message: 'Input should be less than or equal to 250',
          },
          { field: 'business.location.city', message: 'String should have at most 80 characters' },
          { field: 'policy_ids', message: 'List should have between 1 and 5 items' },
        ],
      },
    });

    expect(
      await screen.findByText('Input should be less than or equal to 250'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Number of employees')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('City')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('String should have at most 80 characters')).toBeInTheDocument();
    // An error for a field the form does not have is listed at the top.
    expect(screen.getByRole('alert')).toHaveTextContent('List should have between 1 and 5 items');
  });

  it('opened from a new analysis, goes back there, not to the list', async () => {
    db.businessProfiles = [structuredClone(HARDWARE)];
    const { user } = await openProfile(`/app/businesses/${HARDWARE.profile_id}?next=analysis`);

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      `/app/analyses/new/profile?profile=${HARDWARE.profile_id}`,
    );
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(
      await screen.findByRole('heading', { name: 'Which policies should be checked?' }),
    ).toBeInTheDocument();
    expect(location()).toBe(
      `/app/analyses/new/profile?profile=${HARDWARE.profile_id}&step=policies`,
    );
  });

  it('sends the old profile link to the businesses list', async () => {
    loginAsDemoUser();
    renderApp('/app/profile');

    expect(await screen.findByRole('heading', { name: 'Businesses' })).toBeInTheDocument();
    expect(location()).toBe('/app/businesses');
  });
});
