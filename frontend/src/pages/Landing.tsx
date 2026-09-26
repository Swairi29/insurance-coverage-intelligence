import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { InfoIcon } from '../components/icons';

// Content from the original InsureIntel landing page (the old Streamlit app).

const CAPABILITIES = [
  {
    number: '01',
    title: 'Risk profiling',
    text: 'Identify potential business risks from operations, assets, employees and digital activities.',
  },
  {
    number: '02',
    title: 'Policy intelligence',
    text: 'Organise policies and retrieve relevant coverage, exclusions, limits and conditions.',
  },
  {
    number: '03',
    title: 'Gap detection',
    text: 'Compare identified risks against available evidence and flag potential coverage gaps.',
  },
];

const WORKFLOW = [
  'Business profile + policy upload',
  'Risk Profiling Agent',
  'Policy Intelligence Agent',
  'Coverage & Gap Analysis Agent',
  'Evidence-based report',
];

const TRUST = [
  'Structured risk assessment',
  'Multi-policy analysis',
  'Evidence-based explanations',
];

const primaryLink =
  'inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
const secondaryLink =
  'inline-flex items-center justify-center rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold text-ink-heading hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

export default function Landing() {
  const { status } = useAuth();
  const loggedIn = status === 'authenticated';

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-line/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <Brand />
            <p className="ml-8 text-[11px] text-muted">Coverage intelligence for SMEs</p>
          </div>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            <a
              href="#features"
              className="hidden px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand md:inline"
            >
              Features
            </a>
            <a
              href="#workflow"
              className="hidden px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand md:inline"
            >
              Workflow
            </a>
            <a
              href="#responsible-ai"
              className="hidden px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand md:inline"
            >
              Responsible AI
            </a>
            {loggedIn ? (
              <Link to="/app" className={`${primaryLink} px-4 py-2`}>
                Open your dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand"
                >
                  Log in
                </Link>
                <Link to="/register" className={`${primaryLink} px-4 py-2`}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <p className="inline-block rounded-full bg-brand-tint px-3 py-2 text-xs font-bold text-brand">
            ✦ AI-powered insurance intelligence for SMEs
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl font-extrabold leading-[1.08] sm:text-6xl">
            Understand your risks.
            <br />
            <span className="text-brand">Discover your coverage gaps.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            InsureIntel helps small and medium-sized businesses analyse business risks and insurance
            policies through a structured, evidence-based workflow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={loggedIn ? '/app' : '/register'} className={primaryLink}>
              {loggedIn ? 'Continue your assessment →' : 'Start assessment →'}
            </Link>
            <a href="#workflow" className={secondaryLink}>
              Explore workflow
            </a>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-brand">
            {TRUST.map((item) => (
              <li key={item}>✓ {item}</li>
            ))}
          </ul>
        </section>

        <section id="features" className="scroll-mt-4 border-t border-line/60 bg-brand-soft/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-3xl font-extrabold">Platform capabilities</h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {CAPABILITIES.map((card) => (
                <li key={card.number} className="rounded-card border border-line bg-white p-6">
                  <p className="font-display font-bold text-brand">{card.number}</p>
                  <h3 className="mt-2 text-xl font-bold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{card.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-4">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-3xl font-extrabold">How it works</h2>
            <ol className="mt-6 max-w-2xl">
              {WORKFLOW.map((step, index) => (
                <li key={step} className="flex items-center gap-5 border-b border-line py-4">
                  <span className="rounded-lg bg-brand-tint px-3 py-2 font-display text-sm font-bold text-brand">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-medium text-ink-heading">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="responsible-ai" className="scroll-mt-4">
          <div className="mx-auto max-w-6xl px-4 pb-16">
            <div className="flex gap-4 rounded-card border border-brand-border bg-brand-soft p-6">
              <InfoIcon className="mt-1 h-5 w-5 shrink-0 text-brand" />
              <div>
                <h2 className="text-xl font-bold">Responsible AI</h2>
                <p className="mt-2 leading-relaxed text-muted-strong">
                  Results should include evidence, uncertainty and limitations. Important
                  conclusions must be verified with a qualified insurance professional.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted">
          Academic prototype: InsureIntel does not provide legal, financial or insurance advice.
        </p>
      </footer>
    </div>
  );
}
