/** Stands in for a page that a later step of docs/frontend-plan.md §11 builds. */
export default function Placeholder({ title, step }: { title: string; step: number }) {
  return (
    <section>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        This page is built in step {step} of the frontend plan.
      </p>
    </section>
  );
}
