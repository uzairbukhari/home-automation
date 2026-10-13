import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/** The frame every new energy chart sits in: eyebrow, title, one-line verdict, the chart, a footnote. */
export function ChartCard({
  eyebrow,
  title,
  verdict,
  actions,
  footnote,
  children,
}: {
  eyebrow: string;
  title: string;
  verdict?: string | null;
  actions?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="panel chart-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {actions && <div className="widget-actions">{actions}</div>}
      </div>
      {verdict && <p className="verdict">{verdict}</p>}
      {children}
      {footnote && <p className="report-footnote">{footnote}</p>}
    </Card>
  );
}
