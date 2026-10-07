import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { CheckIcon, DocumentIcon, LockIcon } from '../components/icons';
import { SampleFinding } from '../components/SampleFinding';
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

const CAPABILITIES = [
  [
    '01',
    'Risk Profiling',
    'Identify potential business risks from structured details or a free-text scenario.',
  ],
  ['02', 'Policy Intelligence', 'Find relevant wording in the policy documents you provide.'],
  ['03', 'Gap Detection', 'Compare risks with policy evidence and explain potential gaps.'],
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

const EYEBROW = 'text-xs font-bold uppercase tracking-[.18em] text-blue-600';

export default function Landing() {
  const { status } = useAuth();
  const loggedIn = status === 'authenticated';
  const scrolled = useScrolled();
  const primaryTo = loggedIn ? '/app' : '/register';

  return (
    <div className="dark-ui min-h-screen bg-[#050b18]">
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur transition-colors ${
          scrolled ? 'border-white/10 bg-[#071225]/90' : 'border-transparent bg-[#07142c]'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Brand tone="dark" />
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:text-white md:inline"
              >
                {item.label}
              </a>
            ))}
            {loggedIn ? (
              <Link
                to="/app"
                className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 hover:bg-blue-400"
              >
                Open your dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 hover:bg-blue-400"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#07142c] text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-28 h-[34rem] w-[34rem] rounded-full bg-blue-500/20 blur-[100px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-56 left-[20%] h-[30rem] w-[50rem] rounded-full bg-indigo-500/15 blur-[100px]"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-24">
            <div className="motion-safe:animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3.5 py-2 text-xs font-bold text-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                Four AI agents, one evidence-based report
              </p>
              <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl">
                Know what your insurance{' '}
                <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-indigo-300 bg-clip-text text-transparent">
                  actually covers.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                InsureIntel reads your business profile and your policy PDFs, checks every business
                risk against the wording, and shows which risks are covered, which are not, and the
                exact clause behind each answer.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to={primaryTo}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_35px_rgba(37,99,235,.3)] hover:brightness-110"
                >
                  {loggedIn ? 'Continue your assessment →' : 'Start free assessment →'}
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5"
                >
                  See how it works
                </a>
              </div>
              <ul
                className="mt-8 grid gap-3 text-sm text-slate-200 sm:grid-cols-3"
                aria-label="Why trust it"
              >
                {TRUST.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-400/15 text-cyan-200">
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

        <section className="relative z-10 mx-auto -mt-7 max-w-7xl px-5 sm:px-8 lg:px-10">
          <ul className="grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map(([number, title, text]) => (
              <li
                key={number}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,35,70,.07)]"
              >
                <span className="text-xs font-extrabold tracking-[.16em] text-blue-600">
                  {number} / CAPABILITY
                </span>
                <h2 className="mt-3 text-lg font-bold text-slate-950">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how-it-works" className="scroll-mt-20 px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className={EYEBROW}>How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
              How the four agents work together
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              The gateway runs the agents in order and passes each result on to the next. Agents
              never call each other, so every step is logged and can be checked. Start from a saved
              business profile or describe a scenario in your own words; both go through the same
              four agents.
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {AGENT_STAGES.map((stage, index) => {
                const agent = AGENTS[stage];
                return (
                  <li
                    key={stage}
                    className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-xs font-extrabold text-blue-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="mt-4 font-bold text-slate-950">{agent.name}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{agent.role}</p>
                    <dl className="mt-4 space-y-2 text-sm">
                      <div>
                        <dt className="text-xs font-semibold text-slate-400">Input</dt>
                        <dd className="text-slate-700">{agent.input}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-slate-400">Output</dt>
                        <dd className="text-slate-700">{agent.output}</dd>
                      </div>
                    </dl>
                    {index < AGENT_STAGES.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-3 top-1/2 z-10 hidden text-lg text-blue-400 xl:block"
                      >
                        →
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section
          id="example"
          className="scroll-mt-20 border-y border-slate-200 bg-white px-5 py-16 sm:px-8 lg:px-10"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <div>
              <p className={EYEBROW}>See a real finding</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
                Every finding shows its evidence
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500">
                No answer comes without its source. Each risk shows its coverage status, the quoted
                clause, and the file, section and page it came from, so you or your broker can check
                it in seconds.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-700">
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
            <div className="rounded-3xl bg-[#0b1b38] p-4 sm:p-6">
              <SampleFinding finding={EQUIPMENT_EXAMPLE} />
            </div>
          </div>
        </section>

        <section id="responsible-ai" className="scroll-mt-20 px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className={EYEBROW}>Responsible AI</p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-950">Built responsibly</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              What the system actually does to keep results fair, explainable and safe.
            </p>
            <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {RESPONSIBLE_AI.map((item) => (
                <li key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
                </li>
              ))}
            </ul>
            <a
              href={RESPONSIBLE_AI_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block text-sm font-bold text-blue-700 hover:underline"
            >
              Read the full Responsible AI notes →
            </a>
          </div>
        </section>

        <section
          id="pricing"
          className="scroll-mt-20 border-t border-slate-200 bg-white px-5 py-16 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-7xl">
            <p className={EYEBROW}>Pricing</p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
              Plans for every size of business
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Start free on one policy. Pay yearly and get two months free.
            </p>
            <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {PRICING_TIERS.map((tier) => (
                <li
                  key={tier.name}
                  className={`flex flex-col rounded-2xl border p-6 ${
                    tier.highlighted
                      ? 'border-blue-400/60 bg-gradient-to-br from-[#12305a] to-[#0b1b38] shadow-[0_18px_55px_-30px_rgba(37,99,235,.9)]'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-slate-950">{tier.name}</h3>
                    {tier.highlighted && (
                      <span className="rounded-full bg-blue-400/15 px-2.5 py-0.5 text-xs font-bold text-blue-200">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{tier.audience}</p>
                  <p className="mt-4">
                    <span className="font-display text-3xl font-extrabold text-slate-950">
                      {tier.monthlyLkr === 0 ? 'Free' : formatLkr(tier.monthlyLkr)}
                    </span>
                    {tier.monthlyLkr > 0 && (
                      <span className="text-sm text-slate-500"> / month</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tier.monthlyLkr > 0
                      ? `${formatLkr(tier.monthlyLkr * ANNUAL_MONTHS_CHARGED)} a year`
                      : 'No card needed'}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-status-covered" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={loggedIn ? '/app' : '/register'}
                    className={`mt-6 inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-bold ${
                      tier.highlighted
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:brightness-110'
                        : 'border border-white/15 text-slate-100 hover:bg-white/5'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-slate-500">
              Proposed launch pricing in Sri Lankan rupees. This academic prototype takes no
              payments; every plan opens the same free account.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-[#07142c] px-5 py-8 text-sm text-slate-300 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-5">
            Academic prototype built at SLIIT. InsureIntel does not provide legal, financial or
            insurance advice; confirm every finding with your insurer or broker.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold">
            <li>
              <a
                href={RESPONSIBLE_AI_URL}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Responsible AI notes
              </a>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-white">
                Privacy &amp; consent
              </Link>
            </li>
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">
                GitHub repository
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
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
    <figure className="rounded-3xl border border-white/10 bg-white/[.06] p-5 shadow-[0_20px_80px_rgba(1,10,30,.35)] backdrop-blur sm:p-7">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">Agent workspace</span>
        <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-200">
          Sample run
        </span>
      </figcaption>
      <p className="mt-1 text-xs text-slate-400">The gateway calls each agent in turn.</p>
      <ol className="mt-5 space-y-3">
        {rows.map((row, index) => (
          <li
            key={row.stage}
            className={`flex items-center gap-3 rounded-xl border p-3.5 ${
              row.state === 'Running'
                ? 'border-cyan-300/40 bg-blue-500/10'
                : 'border-white/10 bg-[#0c1c38]/80'
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${
                row.state === 'Done'
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : row.state === 'Running'
                    ? 'bg-blue-500 text-white motion-safe:animate-pulse-ring'
                    : 'bg-white/5 text-slate-400'
              }`}
            >
              {row.state === 'Done' ? '✓' : String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {AGENTS[row.stage].name}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">{row.out}</span>
            </span>
            <span
              className={`text-xs font-semibold ${
                row.state === 'Done'
                  ? 'text-emerald-300'
                  : row.state === 'Running'
                    ? 'text-cyan-200'
                    : 'text-slate-400'
              }`}
            >
              {row.state}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-xl border border-white/10 bg-[#0c1c38]/80 px-3.5 py-3">
        <p className="text-xs text-slate-400">Sample result</p>
        <p className="text-sm font-semibold text-white">14 risks checked, 5 potential gaps</p>
      </div>
    </figure>
  );
}

/** True once the page has scrolled, to darken the header and show its bottom border. */
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
