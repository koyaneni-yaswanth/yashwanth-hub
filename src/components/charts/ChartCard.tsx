import React, { useId, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

export interface ChartTableRow {
  label: string;
  /** Pre-formatted cells, one per column after the label. */
  cells: string[];
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Column headers for the table view: first is the label column. */
  tableColumns: string[];
  tableRows: ChartTableRow[];
  /** Shown instead of the chart when there's nothing to plot. */
  empty?: React.ReactNode;
  className?: string;
  /** Render without its own card frame, for use inside an existing card. */
  bare?: boolean;
  children: React.ReactNode;
}

/**
 * Chart container: title, optional subtitle, and a chart/table toggle so every
 * value is reachable without hover and without colour (the accessible twin).
 */
export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  tableColumns,
  tableRows,
  empty,
  className = '',
  bare = false,
  children,
}) => {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const isEmpty = Boolean(empty);

  return (
    <figure
      aria-labelledby={titleId}
      className={`${bare ? '' : 'rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] p-5 shadow-xs '}space-y-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-bold text-[var(--hub-ink)]">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[var(--hub-muted)] mt-0.5">{subtitle}</p>}
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-label={showTable ? `Show ${title} as a chart` : `Show ${title} as a table`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-line)] px-2.5 py-1.5 text-xs font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
          >
            {showTable ? <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" /> : <Table2 className="w-3.5 h-3.5" aria-hidden="true" />}
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="py-6 text-center text-sm text-[var(--hub-muted)]">{empty}</div>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--hub-line)]">
                {tableColumns.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={`py-2 font-semibold text-xs text-[var(--hub-muted)] ${i === 0 ? 'text-left' : 'text-right'}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.label} className="border-b border-[var(--hub-line)] last:border-0">
                  <th scope="row" className="py-2 text-left font-medium text-[var(--hub-ink)]">
                    {r.label}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={i} className="py-2 text-right tabular-nums text-[var(--hub-ink)]">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
};
