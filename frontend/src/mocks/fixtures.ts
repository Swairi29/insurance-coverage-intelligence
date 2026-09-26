// Typed access to the JSON fixtures. They come from a real no-LLM run of the gateway and
// all four agents; regenerate them with `python scripts/make_frontend_fixtures.py`.
// `analysis-all-statuses.json` is hand-edited to show all five coverage statuses.

import type {
  AnalysisResponse,
  AnalysisSummary,
  BusinessType,
  PolicyDocument,
  UserResponse,
} from '../api/types';
import allStatusesJson from './fixtures/analysis-all-statuses.json';
import analysesJson from './fixtures/analyses.json';
import bakeryJson from './fixtures/analysis-bakery.json';
import partialJson from './fixtures/analysis-partial.json';
import restaurantJson from './fixtures/analysis-restaurant.json';
import retailShopJson from './fixtures/analysis-retail_shop.json';
import policiesJson from './fixtures/policies.json';
import userJson from './fixtures/user.json';

// JSON imports widen string unions to `string`; the generator validates them against Pydantic.
function typed<T>(value: unknown): T {
  return value as T;
}

export const demoUser = typed<UserResponse>(userJson);
export const policiesFixture = typed<PolicyDocument[]>(policiesJson);
export const analysesFixture = typed<AnalysisSummary[]>(analysesJson);

export const analysisByType: Record<BusinessType, AnalysisResponse> = {
  bakery: typed<AnalysisResponse>(bakeryJson),
  restaurant: typed<AnalysisResponse>(restaurantJson),
  retail_shop: typed<AnalysisResponse>(retailShopJson),
};
export const partialAnalysis = typed<AnalysisResponse>(partialJson);
export const allStatusesAnalysis = typed<AnalysisResponse>(allStatusesJson);

export const DEMO_PASSWORD = 'demo-password-1';
