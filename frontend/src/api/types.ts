// TypeScript copies of the gateway's Pydantic models (the API contract).
//
// Source of truth: shared/models/*.py, shared/schemas/requests.py, shared/schemas/responses.py
// and services/orchestration/pipeline.py. Change these only when the backend changes.
// Dates are ISO 8601 strings. Python `Optional[X] = None` becomes `X | null`.
//
// Enum values are kept in `as const` arrays so the UI can loop over them (filters, badges).

// --- enums ----------------------------------------------------------------------------------

export const BUSINESS_TYPES = ['bakery', 'restaurant', 'retail_shop'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const SALES_CHANNELS = ['in_store', 'online', 'delivery', 'wholesale'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const RISK_CATEGORIES = [
  'property',
  'fire',
  'equipment',
  'employee',
  'business_interruption',
  'liability',
  'cyber',
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_SOURCES = ['rule', 'llm', 'rule+llm'] as const;
export type RiskSource = (typeof RISK_SOURCES)[number];

export const COVERAGE_STATUSES = [
  'covered',
  'conditional',
  'unclear',
  'excluded',
  'not_found',
] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export type AnalysisMethod = 'rules' | 'rules+llm';

export const FINDING_PRIORITIES = ['high', 'medium', 'low'] as const;
export type FindingPriority = (typeof FINDING_PRIORITIES)[number];

export type GeneratedBy = 'llm' | 'template';

export const POLICY_STATUSES = ['processing', 'ready', 'failed'] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export type ProfileStatus = 'complete' | 'partial';

export type ProfileWarningCode =
  'missing_field' | 'limited_input' | 'llm_unavailable' | 'unsupported_business_type';

export type AnalysisStatus = 'complete' | 'partial';

/** Pipeline steps; used in `GatewayError.stage`, `stage_ms` and `/health/agents`. */
export const ANALYSIS_STAGES = ['risk_profile', 'policy_evidence', 'coverage', 'report'] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];
export type Stage = AnalysisStage | 'policy_upload';

// --- business profile (request input, shared/models/business.py) ---------------------------

export interface Location {
  city?: string | null;
  district?: string | null;
  country?: string | null;
  /** null means "not known", which is different from false. */
  flood_prone_area?: boolean | null;
}

export interface Operations {
  sales_channels?: SalesChannel[];
  /** For all yes/no fields, null means "not known". */
  accepts_card_payments?: boolean | null;
  handles_cash?: boolean | null;
  stores_customer_data?: boolean | null;
  operates_single_location?: boolean | null;
}

export interface BusinessProfile {
  business_name: string;
  business_type: BusinessType;
  description?: string | null;
  employee_count?: number | null;
  equipment?: string[];
  operations?: Operations;
  location?: Location;
}

// --- auth ------------------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export type RegisterRequest = LoginRequest;

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  /** Seconds until the token expires. */
  expires_in: number;
}

export interface UserResponse {
  user_id: string;
  email: string;
  business_id: string;
  created_at: string;
}

// --- policies (shared/models/policy.py) ------------------------------------------------------

export interface PolicyDocument {
  policy_id: string;
  business_id: string;
  filename: string;
  status: PolicyStatus;
  page_count: number;
  chunk_count: number;
  flagged_chunk_count: number;
  uploaded_at: string;
}

export interface PolicyUploadResponse extends PolicyDocument {
  warnings: string[];
}

/** A policy clause returned as evidence for a risk (Agent 2 → Agent 3). */
export interface EvidenceClause {
  chunk_id: string;
  policy_id: string;
  section: string | null;
  page: number;
  text: string;
  /** 0.0–1.0 relevance to the risk. */
  score: number;
}

// --- Agent 1: risk profile (shared/models/risk.py, RiskProfileResponse) ----------------------

export interface RiskInputEvidence {
  field: string;
  value: string;
}

export interface IdentifiedRisk {
  risk_id: string;
  name: string;
  category: RiskCategory;
  reason: string;
  source: RiskSource;
  confidence: number;
  evidence: RiskInputEvidence[];
}

export interface ProfileWarning {
  code: ProfileWarningCode;
  field: string | null;
  message: string;
}

export interface ProfileMetadata {
  taxonomy_version: string;
  llm_used: boolean;
  llm_model: string | null;
  processing_ms: number | null;
}

export interface RiskProfileResponse {
  schema_version: string;
  request_id: string;
  status: ProfileStatus;
  business_name: string;
  business_type: BusinessType;
  risks: IdentifiedRisk[];
  warnings: ProfileWarning[];
  metadata: ProfileMetadata;
}

// --- Agent 3: coverage (shared/models/coverage.py, CoverageAnalysisResponse) -----------------

export interface CoverageAssessment {
  risk_id: string;
  risk_name: string;
  status: CoverageStatus;
  potential_gap: boolean;
  reason: string;
  evidence: EvidenceClause[];
  /** Agent 3's internal confidence, not legal certainty. */
  confidence: number;
  method: AnalysisMethod;
  matched_signals: string[];
}

export interface CoverageMetadata {
  llm_used: boolean;
  llm_model: string | null;
  processing_ms: number | null;
}

export interface CoverageAnalysisResponse {
  schema_version: string;
  request_id: string;
  business_id: string;
  assessments: CoverageAssessment[];
  warnings: string[];
  metadata: CoverageMetadata;
}

// --- Agent 4: report (shared/models/analysis.py, ExplanationResponse) ------------------------

export interface EvidenceCitation {
  chunk_id: string;
  policy_id: string;
  section: string | null;
  page: number;
  /** Trimmed clause text for display. */
  excerpt: string;
  /** Looked like a prompt-injection attempt; was not sent to the LLM. */
  flagged: boolean;
}

export interface Finding {
  risk_id: string;
  risk_name: string;
  category: RiskCategory | null;
  status: CoverageStatus;
  potential_gap: boolean;
  priority: FindingPriority;
  title: string;
  explanation: string;
  recommendation: string;
  evidence: EvidenceCitation[];
  verification_required: boolean;
  coverage_confidence: number;
  generated_by: GeneratedBy;
}

export interface ReportSummary {
  total_findings: number;
  potential_gaps: number;
  counts_by_status: Partial<Record<CoverageStatus, number>>;
  headline: string;
}

export interface ExplanationMetadata {
  llm_used: boolean;
  llm_provider: 'ollama' | 'gemini' | null;
  llm_model: string | null;
  llm_findings: number;
  template_findings: number;
  processing_ms: number | null;
}

export interface ExplanationResponse {
  schema_version: string;
  request_id: string;
  business_id: string;
  generated_at: string;
  summary: ReportSummary;
  findings: Finding[];
  disclaimer: string;
  warnings: string[];
  metadata: ExplanationMetadata;
}

// --- analyses (gateway) ----------------------------------------------------------------------

export interface AnalysisRequest {
  business: BusinessProfile;
  /** 1–5 unique policy IDs owned by the user. */
  policy_ids: string[];
}

export interface AnalysisResponse {
  schema_version: string;
  request_id: string;
  business_id: string;
  status: AnalysisStatus;
  created_at: string;
  risk_profile: RiskProfileResponse;
  coverage: CoverageAnalysisResponse;
  /** null when status is "partial". */
  report: ExplanationResponse | null;
  warnings: string[];
  /** Milliseconds per pipeline step. */
  stage_ms: Partial<Record<AnalysisStage, number>>;
}

export interface AnalysisSummary {
  request_id: string;
  status: AnalysisStatus;
  created_at: string;
  total_findings: number;
  potential_gaps: number;
}

// --- health ----------------------------------------------------------------------------------

export interface AgentsHealth {
  status: 'healthy' | 'degraded';
  agents: Partial<Record<AnalysisStage, 'up' | 'down'>>;
}

// --- error bodies ----------------------------------------------------------------------------

/** 422 body. Never contains the caller's input values. */
export interface ValidationErrorDetail {
  /** Dotted path, e.g. "business.employee_count". */
  field: string;
  message: string;
}

export interface ErrorResponse {
  error: 'validation_error';
  message: string;
  details: ValidationErrorDetail[];
}

/** Body of every other gateway error (except 401, which is `{detail}`). */
export interface GatewayError {
  error: string;
  message: string;
  stage?: Stage;
  request_id?: string;
}
