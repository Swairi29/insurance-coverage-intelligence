// Example findings for the landing and auth pages. Real clauses from the demo policy pack.
import type { CoverageStatus } from '../api/types';

export interface SampleFindingData {
  risk: string;
  status: CoverageStatus;
  gap: boolean;
  file: string;
  section: string;
  page: number;
  clause: string;
  explanation?: string;
}

/** Page 2 of the demo policy pack (scripts/demo_data.py, BUSINESS_PACK). */
export const THEFT_EXAMPLE: SampleFindingData = {
  risk: 'Theft, burglary and vandalism',
  status: 'conditional',
  gap: false,
  file: 'sunrise-business-pack.pdf',
  section: 'Section 2 - Burglary',
  page: 2,
  clause:
    'Theft of stock and cash is covered only following forcible and violent entry into the premises.',
};

// A real finding from a recorded run (mocks/fixtures/analysis-all-statuses.json).
export const EQUIPMENT_EXAMPLE: SampleFindingData = {
  risk: 'Equipment breakdown',
  status: 'excluded',
  gap: true,
  file: 'sunrise-business-pack.pdf',
  section: 'Section 3 - Machinery',
  page: 3,
  clause: 'Breakdown of ovens, refrigerators and other machinery is excluded.',
  explanation:
    'Section 3 of your business pack says that breakdown of ovens, refrigerators and other machinery is excluded. A breakdown would not be paid for under this policy.',
};
