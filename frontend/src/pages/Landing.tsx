import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { SampleFinding } from '../components/SampleFinding';
import { EQUIPMENT_EXAMPLE } from '../lib/examples';

const REPO_URL = 'https://github.com/Swairi29/insurance-coverage-intelligence';
const RESPONSIBLE_AI_URL = `${REPO_URL}/blob/main/docs/responsible-ai.md`;
const WORKFLOW = [
  [
    '01',
    'Business information + policy',
    'Choose a saved business profile or describe a scenario, then select uploaded policies.',
  ],
  [
    '02',
    'Risk Profiling Agent',
    'Identify the business risks relevant to the information provided.',
  ],
  ['03', 'Policy Intelligence Agent', 'Find relevant policy wording for each identified risk.'],
  ['04', 'Coverage & Gap Analysis Agent', 'Assess coverage status against the retrieved evidence.'],
  [
    '05',
    'Evidence-based report',
    'Review explanations, recommendations, and source policy wording.',
  ],
];

export default function Landing() {
  const { status } = useAuth();
  const loggedIn = status === 'authenticated';
  const primaryTo = loggedIn ? '/app/analyses/new' : '/register';

  return (
    <div className="dark-ui min-h-screen bg-[#050b18]">
      <header className="absolute inset-x-0 top-0 z-20 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Brand tone="dark" />
          <nav aria-label="Site" className="flex items-center gap-2 sm:gap-4">
            <a
              href="#how-it-works"
              className="hidden text-sm font-medium text-slate-300 hover:text-white sm:inline"
            >
              How it works
            </a>
            <a
              href="#responsible-ai"
              className="hidden text-sm font-medium text-slate-300 hover:text-white md:inline"
            >
              Responsible AI
            </a>
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              Log in
            </Link>
            <Link
              to={primaryTo}
              className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 hover:bg-blue-400"
            >
              {loggedIn ? 'Open workspace' : 'Start assessment'}
            </Link>
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
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-32 sm:px-8 sm:pt-36 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3.5 py-2 text-xs font-bold text-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                AI-driven coverage intelligence
              </p>
              <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl">
                Understand your risks.
                <br />
                <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-indigo-300 bg-clip-text text-transparent">
                  Discover coverage gaps.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                InsureIntel helps small and medium-sized businesses analyse business risks and
                insurance policies through a structured, evidence-based workflow.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to={primaryTo}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_35px_rgba(37,99,235,.3)] hover:brightness-110"
                >
                  Start assessment <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5"
                >
                  Explore workflow
                </a>
              </div>
              <p className="mt-6 text-xs text-slate-400">
                Academic prototype · decision support, not insurance or legal advice
              </p>
            </div>
            <WorkflowCard />
          </div>
        </section>

        <section className="relative z-10 mx-auto -mt-7 max-w-7xl px-5 sm:px-8 lg:px-10">
          <ul className="grid gap-4 md:grid-cols-3">
            {[
              [
                '01',
                'Risk Profiling',
                'Identify potential business risks from structured details or a free-text scenario.',
              ],
              [
                '02',
                'Policy Intelligence',
                'Find relevant wording in the policy documents you provide.',
              ],
              [
                '03',
                'Gap Detection',
                'Compare risks with policy evidence and explain potential gaps.',
              ],
            ].map(([number, title, text]) => (
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

        <section id="how-it-works" className="scroll-mt-10 px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
              One workflow, from input to report
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              The gateway runs the four agents in sequence. Both input methods continue through the
              same policy and coverage analysis.
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {WORKFLOW.map(([number, title, text], index) => (
                <li
                  key={number}
                  className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-extrabold ${index === 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}
                  >
                    {number}
                  </span>
                  <h3 className="mt-4 font-bold text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-500">{text}</p>
                  {index < WORKFLOW.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-3 top-1/2 z-10 hidden text-lg text-blue-400 xl:block"
                    >
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-5 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
                Evidence first
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
                Review the wording behind a finding
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500">
                Coverage assessments are grounded in retrieved policy clauses. Review the cited
                wording, section, and page, then confirm any questions with your insurer or broker.
              </p>
              <Link
                to={primaryTo}
                className="mt-6 inline-flex rounded-xl bg-[#102449] px-5 py-3 text-sm font-bold text-white hover:bg-blue-900"
              >
                Explore an analysis →
              </Link>
            </div>
            <div className="rounded-3xl bg-[#0b1b38] p-4 sm:p-6">
              <SampleFinding finding={EQUIPMENT_EXAMPLE} />
            </div>
          </div>
        </section>

        <section id="responsible-ai" className="scroll-mt-10 px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
              Responsible AI
            </p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
              Decision support with human oversight
            </h2>
            <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Fairness', 'Businesses of the same type are checked using the same risk rules.'],
                ['Transparency', 'Findings connect back to the source policy wording.'],
                [
                  'Privacy',
                  'Analysis logs contain stage and count details rather than policy text.',
                ],
                [
                  'Human oversight',
                  'Confirm potential gaps and coverage decisions with your insurer or broker.',
                ],
              ].map(([title, text]) => (
                <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-bold text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
                </li>
              ))}
            </ul>
            <a
              href={RESPONSIBLE_AI_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block text-sm font-bold text-blue-700 hover:underline"
            >
              Read the Responsible AI notes →
            </a>
          </div>
        </section>

        <section
          id="pricing"
          className="border-t border-slate-200 bg-white px-5 py-12 sm:px-8 lg:px-10"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-950">Academic prototype</p>
              <p className="mt-1 text-sm text-slate-500">
                No payments are processed. Product plans are not active in this prototype.
              </p>
            </div>
            <Link to="/privacy" className="text-sm font-bold text-blue-700 hover:underline">
              Privacy and consent →
            </Link>
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
                Responsible AI
              </a>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-white">
                Privacy &amp; consent
              </Link>
            </li>
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

function WorkflowCard() {
  return (
    <figure className="rounded-3xl border border-white/10 bg-white/[.06] p-5 shadow-[0_20px_80px_rgba(1,10,30,.35)] backdrop-blur sm:p-7">
      <figcaption className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">Analysis workflow</span>
        <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-200">
          Illustrative
        </span>
      </figcaption>
      <ol className="mt-5 space-y-3">
        {WORKFLOW.map(([number, title, text]) => (
          <li
            key={number}
            className="flex gap-3 rounded-xl border border-white/10 bg-[#0c1c38]/80 p-3.5"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-xs font-extrabold text-blue-200">
              {number}
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">{title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-400">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-[10px] text-slate-500">
        Product workflow illustration · no sample outcomes shown
      </p>
    </figure>
  );
}
