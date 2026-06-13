import Link from 'next/link';
import { ArrowLeft, FileText, ChevronRight } from 'lucide-react';
import { LEGAL_DOCS, LEGAL } from '@/lib/legal';

export const metadata = { title: 'Legal & Policies — MunchAdda' };

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-text-2 hover:text-text transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>

        <header className="mb-6">
          <p className="eyebrow">{LEGAL.brand}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text mt-1">
            Legal &amp; Policies
          </h1>
          <div className="rule-amber mt-3 mb-4" />
          <p className="text-sm text-text-2 leading-relaxed">
            The rules and policies that govern your use of the app.
          </p>
        </header>

        <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border shadow-sm">
          {LEGAL_DOCS.map((doc) => (
            <Link
              key={doc.slug}
              href={`/legal/${doc.slug}`}
              className="flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 bg-brand-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-brand" />
              </div>
              <span className="flex-1 text-sm font-medium text-text">{doc.title}</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </Link>
          ))}
        </div>

        <p className="mt-6 text-xs text-text-3 tabular-nums">Last updated: {LEGAL.updated}</p>
      </div>
    </div>
  );
}
