/**
 * Version of the privacy and data-processing notice (/privacy) that users agree to at sign-up.
 * Must equal CURRENT_CONSENT_VERSION in shared/schemas/requests.py: the gateway refuses to
 * create an account with any other version. Bump both when the notice changes.
 */
export const CONSENT_VERSION = '2026-10-04';
