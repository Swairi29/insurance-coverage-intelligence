import { screen, within } from '@testing-library/react';
import type { BusinessProfile } from '../api/types';
import { SESSION_KEYS } from '../lib/session';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

const location = () => screen.getByTestId('location').textContent;
const savedDraft = () =>
  JSON.parse(window.sessionStorage.getItem(SESSION_KEYS.profileDraft) ?? 'null') as BusinessProfile;

/** The Yes / No / Not sure group for a question. */
const question = (text: string) => screen.getByRole('group', { name: text });

async function openProfile(route: Parameters<typeof renderApp>[0] = '/app/profile') {
  loginAsDemoUser();
  const result = renderApp(route);
  await screen.findByRole('heading', { name: 'Business profile' });
  return result;
}

describe('business profile form', () => {
  it('requires the name and the type, and saves nothing until they are given', async () => {
    const { user } = await openProfile();
    await user.click(screen.getByRole('button', { name: 'Save and continue to policies' }));

    expect(await screen.findByText('Enter the business name.')).toBeInTheDocument();
    expect(screen.getByText('Choose the type of business.')).toBeInTheDocument();
    expect(location()).toBe('/app/profile');
    expect(savedDraft()).toBeNull();
  });

  it('saves the draft with "Not sure" as null and goes on to the policies page', async () => {
    const { user } = await openProfile();

    await user.type(screen.getByLabelText(/Business name/), 'Sunrise Bakery');
    await user.selectOptions(screen.getByLabelText(/Type of business/), 'bakery');
    await user.type(screen.getByLabelText('Number of employees'), '8');
    await user.type(screen.getByLabelText('Equipment'), 'Ovens{Enter}');
    await user.type(screen.getByLabelText('Equipment'), 'Mixers,');
    await user.click(screen.getByRole('checkbox', { name: 'Delivery' }));
    await user.click(within(question('Do you accept card payments?')).getByLabelText('Yes'));
    await user.click(within(question('Do you handle cash?')).getByLabelText('No'));
    await user.type(screen.getByLabelText('City'), 'Colombo');
    await user.click(screen.getByRole('button', { name: 'Save and continue to policies' }));

    expect(await screen.findByRole('heading', { name: 'Policies' })).toBeInTheDocument();
    expect(location()).toBe('/app/policies');
    expect(savedDraft()).toEqual({
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
    await user.click(screen.getByRole('button', { name: 'Save and continue to policies' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Number of employees')).toHaveAttribute('aria-invalid', 'true');
  });

  it('ignores duplicate equipment and lets items be removed', async () => {
    const { user } = await openProfile();
    const equipment = screen.getByLabelText('Equipment');

    await user.type(equipment, 'Ovens{Enter}');
    await user.type(equipment, 'ovens{Enter}');
    expect(screen.getByText('"ovens" is already in the list.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Ovens' }));
    expect(screen.queryByRole('button', { name: 'Remove Ovens' })).not.toBeInTheDocument();
  });

  it('loads a saved draft for editing', async () => {
    window.sessionStorage.setItem(
      SESSION_KEYS.profileDraft,
      JSON.stringify({
        business_name: 'Hilltop Hardware',
        business_type: 'retail_shop',
        equipment: ['CCTV'],
        operations: { stores_customer_data: true },
        location: { flood_prone_area: false },
      }),
    );
    await openProfile();

    expect(screen.getByLabelText(/Business name/)).toHaveValue('Hilltop Hardware');
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
  });

  it('shows a server 422 from an analysis on the right fields', async () => {
    await openProfile({
      pathname: '/app/profile',
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
});
