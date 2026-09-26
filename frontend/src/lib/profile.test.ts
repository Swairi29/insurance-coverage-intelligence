import { describe, expect, it } from 'vitest';
import type { BusinessProfile } from '../api/types';
import {
  EMPTY_PROFILE_FORM,
  profileErrorsFrom,
  toBusinessProfile,
  toFormValues,
  type ProfileFormValues,
} from './profile';

describe('toBusinessProfile', () => {
  it('turns blanks into null and "Not sure" into null, not false', () => {
    const form: ProfileFormValues = {
      ...EMPTY_PROFILE_FORM,
      business_name: '  Sunrise Bakery ',
      business_type: 'bakery',
      employee_count: ' ',
      operations: {
        ...EMPTY_PROFILE_FORM.operations,
        handles_cash: 'no',
        accepts_card_payments: 'yes',
      },
    };

    const profile = toBusinessProfile(form);

    expect(profile.business_name).toBe('Sunrise Bakery');
    expect(profile.description).toBeNull();
    expect(profile.employee_count).toBeNull();
    expect(profile.operations).toMatchObject({
      handles_cash: false,
      accepts_card_payments: true,
      stores_customer_data: null,
      operates_single_location: null,
    });
    expect(profile.location).toEqual({
      city: null,
      district: null,
      country: null,
      flood_prone_area: null,
    });
  });

  it('round-trips through the form values', () => {
    const profile: BusinessProfile = {
      business_name: 'Lagoon Kitchen',
      business_type: 'restaurant',
      description: 'Seafood restaurant',
      employee_count: 22,
      equipment: ['Deep fryers'],
      operations: {
        sales_channels: ['in_store', 'online'],
        accepts_card_payments: true,
        handles_cash: false,
        stores_customer_data: null,
        operates_single_location: true,
      },
      location: { city: 'Negombo', district: null, country: 'Sri Lanka', flood_prone_area: false },
    };
    expect(toBusinessProfile(toFormValues(profile))).toEqual(profile);
  });
});

describe('profileErrorsFrom', () => {
  it('maps gateway field paths onto form fields', () => {
    const { fields, other } = profileErrorsFrom([
      { field: 'business.employee_count', message: 'Input should be less than or equal to 250' },
      { field: 'business.equipment.3', message: 'String should have at most 60 characters' },
      { field: 'business.equipment.4', message: 'second equipment message' },
      { field: 'business.operations.handles_cash', message: 'Input should be a valid boolean' },
      { field: 'business.location.city', message: 'Too long' },
      { field: 'policy_ids', message: 'List should have between 1 and 5 items' },
    ]);

    expect(fields).toEqual({
      employee_count: 'Input should be less than or equal to 250',
      equipment: 'String should have at most 60 characters',
      'operations.handles_cash': 'Input should be a valid boolean',
      'location.city': 'Too long',
    });
    expect(other).toEqual(['List should have between 1 and 5 items']);
  });
});
