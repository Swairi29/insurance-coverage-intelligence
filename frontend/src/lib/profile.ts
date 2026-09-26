// The business profile: form values, conversion to the API's BusinessProfile, the
// sessionStorage draft (plan §3.6) and mapping server 422 errors onto form fields.

import type {
  BusinessProfile,
  BusinessType,
  SalesChannel,
  ValidationErrorDetail,
} from '../api/types';
import { SESSION_KEYS, readSession, removeSession, writeSession } from './session';

/** Limits from shared/models/business.py. */
export const PROFILE_LIMITS = {
  nameLength: 100,
  descriptionLength: 2000,
  placeLength: 80,
  maxEmployees: 250,
  equipmentItems: 50,
  equipmentItemLength: 60,
} as const;

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  bakery: 'Bakery',
  restaurant: 'Restaurant',
  retail_shop: 'Retail shop',
};

export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  in_store: 'In store',
  online: 'Online',
  delivery: 'Delivery',
  wholesale: 'Wholesale',
};

/** Yes / No / Not sure. "Not sure" is sent as null, which is different from No (false). */
export type TriState = 'yes' | 'no' | 'unknown';

export const YES_NO_QUESTIONS = [
  { name: 'accepts_card_payments', label: 'Do you accept card payments?' },
  { name: 'handles_cash', label: 'Do you handle cash?' },
  {
    name: 'stores_customer_data',
    label: 'Do you store customer data (names, phone numbers, orders)?',
  },
  { name: 'operates_single_location', label: 'Do you operate from a single location?' },
] as const;

export type YesNoField = (typeof YES_NO_QUESTIONS)[number]['name'];

/** What the form holds. Every text input is a string; conversion happens on save. */
export interface ProfileFormValues {
  business_name: string;
  business_type: BusinessType | '';
  description: string;
  employee_count: string;
  equipment: string[];
  operations: { sales_channels: SalesChannel[] } & Record<YesNoField, TriState>;
  location: { city: string; district: string; country: string; flood_prone_area: TriState };
}

export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  business_name: '',
  business_type: '',
  description: '',
  employee_count: '',
  equipment: [],
  operations: {
    sales_channels: [],
    accepts_card_payments: 'unknown',
    handles_cash: 'unknown',
    stores_customer_data: 'unknown',
    operates_single_location: 'unknown',
  },
  location: { city: '', district: '', country: '', flood_prone_area: 'unknown' },
};

const toBool = (value: TriState): boolean | null =>
  value === 'yes' ? true : value === 'no' ? false : null;

const toTriState = (value: boolean | null | undefined): TriState =>
  value === true ? 'yes' : value === false ? 'no' : 'unknown';

const textOrNull = (value: string): string | null => value.trim() || null;

/** Form values → the body the gateway expects. Blank optional fields become null. */
export function toBusinessProfile(form: ProfileFormValues): BusinessProfile {
  if (!form.business_type) throw new Error('business_type is required');
  const employees = form.employee_count.trim();
  return {
    business_name: form.business_name.trim(),
    business_type: form.business_type,
    description: textOrNull(form.description),
    employee_count: employees === '' ? null : Number(employees),
    equipment: form.equipment,
    operations: {
      sales_channels: form.operations.sales_channels,
      accepts_card_payments: toBool(form.operations.accepts_card_payments),
      handles_cash: toBool(form.operations.handles_cash),
      stores_customer_data: toBool(form.operations.stores_customer_data),
      operates_single_location: toBool(form.operations.operates_single_location),
    },
    location: {
      city: textOrNull(form.location.city),
      district: textOrNull(form.location.district),
      country: textOrNull(form.location.country),
      flood_prone_area: toBool(form.location.flood_prone_area),
    },
  };
}

/** A saved profile → form values, to edit it again. */
export function toFormValues(profile: BusinessProfile): ProfileFormValues {
  const ops = profile.operations ?? {};
  const loc = profile.location ?? {};
  return {
    business_name: profile.business_name,
    business_type: profile.business_type,
    description: profile.description ?? '',
    employee_count: profile.employee_count == null ? '' : String(profile.employee_count),
    equipment: profile.equipment ?? [],
    operations: {
      sales_channels: ops.sales_channels ?? [],
      accepts_card_payments: toTriState(ops.accepts_card_payments),
      handles_cash: toTriState(ops.handles_cash),
      stores_customer_data: toTriState(ops.stores_customer_data),
      operates_single_location: toTriState(ops.operates_single_location),
    },
    location: {
      city: loc.city ?? '',
      district: loc.district ?? '',
      country: loc.country ?? '',
      flood_prone_area: toTriState(loc.flood_prone_area),
    },
  };
}

// --- draft (sessionStorage, cleared on logout) ---------------------------------------------

export function loadProfileDraft(): BusinessProfile | null {
  const raw = readSession(SESSION_KEYS.profileDraft);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BusinessProfile>;
    if (typeof value.business_name === 'string' && typeof value.business_type === 'string') {
      return value as BusinessProfile;
    }
  } catch {
    // corrupted draft: start again
  }
  removeSession(SESSION_KEYS.profileDraft);
  return null;
}

export function saveProfileDraft(profile: BusinessProfile): void {
  writeSession(SESSION_KEYS.profileDraft, JSON.stringify(profile));
}

// --- server errors ------------------------------------------------------------------------

/** Form fields a server error can be shown next to. */
export const PROFILE_ERROR_FIELDS = [
  'business_name',
  'business_type',
  'description',
  'employee_count',
  'equipment',
  'operations.sales_channels',
  ...YES_NO_QUESTIONS.map((q) => `operations.${q.name}`),
  'location.city',
  'location.district',
  'location.country',
  'location.flood_prone_area',
] as const;

export type ProfileErrorField = (typeof PROFILE_ERROR_FIELDS)[number];

/**
 * A 422 from `POST /analyses` names fields like "business.employee_count" or
 * "business.equipment.3". This turns them into form field names ("employee_count",
 * "equipment"), keeping the first message per field. Anything else goes to `other`.
 */
export function profileErrorsFrom(details: readonly ValidationErrorDetail[]): {
  fields: Partial<Record<ProfileErrorField, string>>;
  other: string[];
} {
  const fields: Partial<Record<ProfileErrorField, string>> = {};
  const other: string[] = [];
  for (const { field, message } of details) {
    const path = field
      .replace(/^business\./, '')
      .split('.')
      .filter((part) => !/^\d+$/.test(part)) // "equipment.3" → "equipment"
      .join('.');
    if ((PROFILE_ERROR_FIELDS as readonly string[]).includes(path)) {
      fields[path as ProfileErrorField] ??= message;
    } else {
      other.push(message);
    }
  }
  return { fields, other };
}
