import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { CheckIcon, DocumentIcon, LockIcon, SparkleIcon } from '../components/icons';
import { SampleFinding } from '../components/SampleFinding';
import { buttonClasses } from '../components/ui/buttonClasses';
import { EQUIPMENT_EXAMPLE } from '../lib/examples';
import { AGENTS, AGENT_STAGES } from '../lib/labels';
import { ANNUAL_MONTHS_CHARGED, PRICING_TIERS, formatLkr } from '../lib/pricing';

const REPO_URL = 'https://github.com/Swairi29/insurance-coverage-intelligence';
const RESPONSIBLE_AI_URL = `${REPO_URL}/blob/main/docs/responsible-ai.md`;

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#example', label: 'Example' },
  { href: '#responsible-ai', label: 'Responsible AI' },
  { href: '#pricing', label: 'Pricing' },
];

const TRUST = [
  { icon: DocumentIcon, text: 'Every finding cites the policy clause' },
  { icon: LockIcon, text: 'Runs on your documents only' },
  { icon: CheckIcon, text: 'Decision support, not advice' },
];

const RESPONSIBLE_AI = [
  {
    title: 'Fairness',
    text: 'Every business of the same type is checked against the same risk rules, and your business name is never sent to the AI.',
  },
  {
    title: 'Transparency',
    text: 'Each finding shows the clause, file, section and page behind it, and AI-written text is always labelled.',
  },
  {
    title: 'Privacy',
    text: 'Policies and results are encrypted at rest, clauses with hidden instructions are withheld from the AI, and logs hold counts only.',
  },
  {
    title: 'Human oversight',
    text: 'Coverage statuses come from rules the AI cannot change, and every potential gap asks you to confirm with your insurer or broker.',
  },
];

export default function Landing() {
  const { status } = useAuth();
  const loggedIn = status === 'authenticated';
  const scrolled = useScrolled();
  const primaryTo = loggedIn ? '/app' : '/register';

  return (
    <div className="min-h-screen bg-canvas">
      <header
        className={`sticky top-0 z-30 border-b bg-white/70 backdrop-blur transition-colors ${
          scrolled ? 'border-line' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand />
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="hidden rounded-pill px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand md:inline"
              >
                {item.label}
              </a>
            ))}
            {loggedIn ? (
              <Link to="/app" className={buttonClasses('primary', 'sm')}>
                Open your dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-pill px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand"
                >
                  Log in
                </Link>
                <Link to="/register" className={buttonClasses('primary', 'sm')}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-aurora">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="motion-safe:animate-fade-up">
              <p className="inline-flex items-center gap-1.5 rounded-pill border border-ai-border bg-white/70 px-3 py-1.5 text-xs font-bold text-ai">
                <SparkleIcon className="h-3.5 w-3.5" />
                Four AI agents, one evidence-based report
              </p>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] sm:text-display">
                Know what your insurance <span className="text-brand">actually covers.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-strong">
                InsureIntel reads your business profile and your policy PDFs, checks every business
                risk against the wording, and shows which risks are covered, which are not, and the
                exact clause behind each answer.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={primaryTo} className={buttonClasses('primary', 'lg')}>
                  {loggedIn ? 'Continue your assessment →' : 'Start free assessment →'}
                </Link>
                <a href="#how-it-works" className={buttonClasses('secondary', 'lg')}>
                  See how it works
                </a>
              </div>
              <ul
                className="mt-8 grid gap-2 text-sm text-ink sm:grid-cols-3"
                aria-label="Why trust it"
              >
                {TRUST.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-soft">
                      <Icon className="h-3 w-3" />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <PipelinePreview />
          </div>
        </section>

        {/* How it works */}
        <Section
          id="how-it-works"
          eyebrow="How it works"
          title="How the four agents work together"
          intro="The gateway runs the agents in order and passes each result on to the next. Agents never call each other, so every step is logged and can be checked."
        >
          <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {AGENT_STAGES.map((stage, index) => {
              const agent = AGENTS[stage];
              return (
                <li
                  key={stage}
                  className="rounded-card border border-line bg-white p-5 shadow-soft"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint font-display text-sm font-extrabold text-brand">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-lg font-bold">{agent.name}</h3>
                  <p className="mt-1 text-sm text-muted">{agent.role}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div>
                      <dt className="text-meta font-semibold text-muted">Input</dt>
                      <dd className="text-ink">{agent.input}</dd>
                    </div>
                    <div>
                      <dt className="text-meta font-semibold text-muted">Output</dt>
                      <dd className="text-ink">{agent.output}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ol>
        </Section>

        {/* Example finding */}
        <section id="example" className="scroll-mt-20 border-y border-line bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
            <div>
              <p className="text-meta font-semibold uppercase tracking-wide text-ai">
                See a real finding
              </p>
              <h2 className="mt-2 text-title font-extrabold">Every finding shows its evidence</h2>
              <p className="mt-4 leading-relaxed text-muted-strong">
                No answer comes without its source. Each risk shows its coverage status, the quoted
                clause, and the file, section and page it came from, so you or your broker can check
                it in seconds.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-ink">
                {[
                  'Status decided by coverage rules, never changed by the AI',
                  'Potential gaps flagged in red, with a next step',
                  'AI-written explanations are labelled as such',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-status-covered" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <SampleFinding finding={EQUIPMENT_EXAMPLE} />
          </div>
        </section>

        {/* Responsible AI */}
        <Section
          id="responsible-ai"
          eyebrow="Responsible AI"
          title="Built responsibly"
          intro="What the system actually does to keep results fair, explainable and safe."
        >
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {RESPONSIBLE_AI.map((item) => (
              <li
                key={item.title}
                className="rounded-card border border-line bg-white p-5 shadow-soft"
              >
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-strong">{item.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm">
            <a
              href={RESPONSIBLE_AI_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand hover:underline"
            >
              Read the full Responsible AI notes →
            </a>
          </p>
        </Section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <p className="text-meta font-semibold uppercase tracking-wide text-ai">Pricing</p>
            <h2 className="mt-2 text-title font-extrabold">Plans for every size of business</h2>
            <p className="mt-3 max-w-2xl text-muted-strong">
              Start free on one policy. Pay yearly and get two months free.
            </p>
            <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {PRICING_TIERS.map((tier) => (
                <li
                  key={tier.name}
                  className={`flex flex-col rounded-card border bg-white p-6 ${
                    tier.highlighted ? 'border-brand shadow-lift' : 'border-line shadow-soft'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">{tier.name}</h3>
                    {tier.highlighted && (
                      <span className="rounded-pill bg-brand-tint px-2.5 py-0.5 text-xs font-bold text-brand">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">{tier.audience}</p>
                  <p className="mt-4">
                    <span className="font-display text-3xl font-extrabold text-ink-heading">
                      {tier.monthlyLkr === 0 ? 'Free' : formatLkr(tier.monthlyLkr)}
                    </span>
                    {tier.monthlyLkr > 0 && <span className="text-sm text-muted"> / month</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {tier.monthlyLkr > 0
                      ? `${formatLkr(tier.monthlyLkr * ANNUAL_MONTHS_CHARGED)} a year`
                      : 'No card needed'}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-ink">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-status-covered" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={loggedIn ? '/app' : '/register'}
                    className={`mt-6 ${buttonClasses(tier.highlighted ? 'primary' : 'secondary')}`}
                  >
                    {tier.cta}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted">
              Proposed launch pricing in Sri Lankan rupees. This academic prototype takes no
              payments; every plan opens the same free account.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs text-muted">
            Academic prototype built at SLIIT. InsureIntel does not provide legal, financial or
            insurance advice; confirm every finding with your insurer or broker.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
            <li>
              <a
                href={RESPONSIBLE_AI_URL}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Responsible AI notes
              </a>
            </li>
            <li>
              <Link to="/privacy" className="text-brand hover:underline">
                Privacy &amp; consent
              </Link>
            </li>
            <li>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                GitHub repository
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-meta font-semibold uppercase tracking-wide text-ai">{eyebrow}</p>
        <h2 className="mt-2 text-title font-extrabold">{title}</h2>
        <p className="mt-3 max-w-2xl text-muted-strong">{intro}</p>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/**
 * A picture of one run as the agent workspace shows it: the gateway calling each agent in
 * turn. Static and labelled as a sample.
 */
function PipelinePreview() {
  const rows: {
    stage: (typeof AGENT_STAGES)[number];
    state: 'Done' | 'Running' | 'Queued';
    out: string;
  }[] = [
    { stage: 'risk_profile', state: 'Done', out: '14 risks identified' },
    { stage: 'policy_evidence', state: 'Done', out: '22 clauses found' },
    { stage: 'coverage', state: 'Running', out: 'Deciding each status…' },
    { stage: 'report', state: 'Queued', out: 'Waiting' },
  ];
  return (
    <figure className="rounded-card border border-line bg-white/90 p-5 shadow-lift backdrop-blur">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink-heading">Agent workspace</span>
        <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">
          Sample run
        </span>
      </figcaption>
      <p className="mt-1 text-meta text-muted">The gateway calls each agent in turn.</p>
      <ol className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <li
            key={row.stage}
            className={`flex items-center gap-3 rounded-panel border px-3 py-2.5 ${
              row.state === 'Running' ? 'border-ai-bright bg-ai-tint/60' : 'border-line bg-white'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                row.state === 'Done'
                  ? 'bg-status-covered text-white'
                  : row.state === 'Running'
                    ? 'bg-ai text-white motion-safe:animate-pulse-ring'
                    : 'bg-canvas text-muted-strong'
              }`}
            >
              {row.state === 'Done' ? '✓' : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-heading">
                {AGENTS[row.stage].name}
              </span>
              <span className="block text-xs text-muted">{row.out}</span>
            </span>
            <span
              className={`text-xs font-semibold ${
                row.state === 'Done'
                  ? 'text-status-covered'
                  : row.state === 'Running'
                    ? 'text-ai'
                    : 'text-muted'
              }`}
            >
              {row.state}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-panel bg-canvas px-3 py-2.5">
        <p className="text-xs text-muted">Sample result</p>
        <p className="text-sm font-semibold text-ink-heading">14 risks checked, 5 potential gaps</p>
      </div>
    </figure>
  );
}

/** True once the page has scrolled, to show the header's bottom border. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}
