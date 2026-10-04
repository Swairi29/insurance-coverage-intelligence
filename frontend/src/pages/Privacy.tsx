import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

/** Bump when the notice changes in a way users must agree to again. */
export const CONSENT_VERSION = '2026-10-04';

/**
 * Privacy and data-processing notice that users agree to when they sign up. Every statement
 * here describes what the code actually does; keep it in step with the backend.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <Brand />
          <Link to="/register" className="text-sm font-semibold text-brand hover:underline">
            Back to sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <p className="text-meta font-semibold uppercase tracking-wide text-ai">
          Privacy &amp; consent
        </p>
        <h1 className="mt-2 text-title font-extrabold">How InsureIntel uses your data</h1>
        <p className="mt-3 text-muted">
          Version {CONSENT_VERSION}. This notice explains what you agree to when you create an
          account. InsureIntel is an academic prototype built at SLIIT; it is decision support, not
          legal, financial or insurance advice.
        </p>

        <div className="mt-8 space-y-6">
          <Section title="1. What we collect">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Your email address and a password. The password is stored only as a bcrypt hash.
              </li>
              <li>
                The business profile you enter (type, description, equipment, how you operate,
                location). It is kept in this browser tab and sent with each analysis.
              </li>
              <li>The insurance policy PDFs you upload.</li>
              <li>The results of each analysis you run.</li>
              <li>
                Questions you ask about an analysis are answered and then discarded; they are not
                stored.
              </li>
            </ul>
          </Section>

          <Section title="2. Why we use it">
            <p>
              Only to identify your business risks, find the matching wording in your policies,
              decide each risk&apos;s coverage status and explain it to you. We do not sell your
              data, use it for advertising or share it with insurers.
            </p>
          </Section>

          <Section title="3. How it is protected">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Uploaded policies and saved analysis results are encrypted at rest.</li>
              <li>Each account only sees its own policies and analyses.</li>
              <li>
                Logs record counts and timings only, never your policy wording, business details or
                questions.
              </li>
            </ul>
          </Section>

          <Section title="4. AI processing">
            <p>
              When AI wording is switched on, the relevant policy clauses, the risks found and your
              questions are sent to the configured AI model to write explanations. Depending on how
              the service is set up, that is either a model running on the same machine (Ollama) or
              Google&apos;s Gemini API. Your business name is never sent to the AI. Clauses that
              look like hidden instructions are withheld from the AI. Every AI-written part is
              labelled, and every finding links to the policy wording it is based on.
            </p>
          </Section>

          <Section title="5. Your choices">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Because this is a prototype, please upload sample or redacted policies rather than
                confidential documents.
              </li>
              <li>
                You can stop at any time. To have your account, policies and analyses deleted,
                contact the project team through the{' '}
                <a
                  href="https://github.com/Swairi29/insurance-coverage-intelligence"
                  className="font-semibold text-brand hover:underline"
                  rel="noreferrer"
                  target="_blank"
                >
                  project repository
                </a>
                .
              </li>
            </ul>
          </Section>

          <Section title="6. Legal basis">
            <p>
              You give consent when you create an account. This notice follows the principles of Sri
              Lanka&apos;s Personal Data Protection Act, No. 9 of 2022 (purpose limitation, data
              minimisation, security and transparency). It is not legal advice.
            </p>
          </Section>
        </div>

        <p className="mt-10 text-sm text-muted">
          <Link to="/register" className="font-semibold text-brand hover:underline">
            ← Back to create your account
          </Link>
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5 shadow-soft sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}
