/** Two-column list of field names and sample values. */
export function ValueTable({ rows, keyLabel = "Field" }) {
  if (!rows.length) return <p className="text-sm text-ink-muted">No fields.</p>;
  return (
    <div className="overflow-hidden rounded-control border border-line">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-subtle text-ink-muted">
          <tr>
            <th className="w-2/5 px-3 py-2 font-medium">{keyLabel}</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ key, value }) => (
            <tr key={key} className="align-top">
              <td className="truncate px-3 py-2 font-mono text-ink" title={key}>{key}</td>
              <td className="break-words px-3 py-2 text-ink-muted">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
