// Proposed launch pricing (docs/commercialisation.md). Shown on the landing page only:
// the prototype takes no payments. Change the figures here and in the doc together.

export interface PricingTier {
  name: string;
  /** Monthly price in Sri Lankan rupees; 0 for the free tier. */
  monthlyLkr: number;
  audience: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Free',
    monthlyLkr: 0,
    audience: 'Try it on one policy',
    features: [
      'Up to 2 policy PDFs',
      '2 analyses a month',
      'Coverage status and cited clauses for every risk',
      'Standard (template) explanations',
    ],
    cta: 'Start free',
  },
  {
    name: 'Starter',
    monthlyLkr: 2490,
    audience: 'Owner-run shops and cafés',
    features: [
      'Up to 10 policy PDFs',
      '10 analyses a month',
      'AI-written explanations and next steps',
      'Full analysis history',
    ],
    cta: 'Choose Starter',
  },
  {
    name: 'Business',
    monthlyLkr: 6990,
    audience: 'Growing SMEs with several policies',
    features: [
      'Up to 30 policy PDFs',
      '40 analyses a month',
      'Ask questions about each analysis',
      'Print-ready coverage reports',
    ],
    cta: 'Choose Business',
    highlighted: true,
  },
  {
    name: 'Broker',
    monthlyLkr: 19990,
    audience: 'Brokers advising many SMEs',
    features: [
      '200 analyses a month',
      'Up to 25 client businesses (planned)',
      'Priority processing',
      'Email support within one working day',
    ],
    cta: 'Talk to us',
  },
];

/** Annual billing: two months free. */
export const ANNUAL_MONTHS_CHARGED = 10;

const LKR = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 });

/** "LKR 2,490" */
export function formatLkr(amount: number): string {
  return `LKR ${LKR.format(amount)}`;
}
