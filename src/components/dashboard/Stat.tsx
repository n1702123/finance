export function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined ? '' : tone > 0 ? 'text-red-600' : tone < 0 ? 'text-green-600' : ''
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  )
}
