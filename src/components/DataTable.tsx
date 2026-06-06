import { StatusPill } from "@/components/StatusPill";

type DataTableProps = {
  columns: string[];
  rows: Array<Record<string, string>>;
  statusKey?: string;
  caption?: string;
};

export function DataTable({ columns, rows, statusKey, caption }: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={`${row[columns[0]]}-${index}`} className="bg-surface">
                {columns.map((column) => (
                  <td
                    key={column}
                    className="whitespace-nowrap px-4 py-4 text-muted-strong"
                  >
                    {statusKey === column ? (
                      <StatusPill status={row[column]} />
                    ) : (
                      row[column]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
