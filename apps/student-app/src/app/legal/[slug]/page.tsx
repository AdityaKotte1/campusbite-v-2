import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LEGAL_DOCS, getLegalDoc, LEGAL } from '@/lib/legal';

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const doc = getLegalDoc(params.slug);
  return { title: doc ? `${doc.title} — MunchAdda` : 'MunchAdda' };
}

export default function LegalDocPage({ params }: { params: { slug: string } }) {
  const doc = getLegalDoc(params.slug);
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-bg">
      <article className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/legal"
          className="inline-flex items-center gap-2 text-sm text-text-2 hover:text-text transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> All policies
        </Link>

        <header className="mb-8">
          <p className="eyebrow">Legal &amp; Policies</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text mt-1 leading-tight">
            {doc.title}
          </h1>
          <div className="rule-amber mt-3 mb-3" />
          <p className="text-xs text-text-3 tabular-nums">Last updated: {LEGAL.updated}</p>
        </header>

        <div className="space-y-8">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-lg font-semibold tracking-tight text-text mb-3">
                {s.heading}
              </h2>
              <div className="space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-text-2">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <hr className="my-8 border-border" />

        <p className="text-xs text-text-3 leading-relaxed">
          {LEGAL.company} · {LEGAL.brand}. For questions, contact{' '}
          <a href={`mailto:${LEGAL.email}`} className="text-brand underline underline-offset-2 hover:text-brand-dark transition-colors duration-150">
            {LEGAL.email}
          </a>
          .
        </p>
      </article>
    </div>
  );
}
