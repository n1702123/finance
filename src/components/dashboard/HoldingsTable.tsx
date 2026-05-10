const fmt = (n: number, d = 0) =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d })

export function HoldingsTable({ rows, ccy }: { rows: any[]; ccy: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">尚無持股。</p>
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left">
        <tr>
          <th className="p-2">代號</th>
          <th className="p-2">名稱</th>
          <th className="p-2 text-right">持有</th>
          <th className="p-2 text-right">平均成本</th>
          <th className="p-2 text-right">市價</th>
          <th className="p-2 text-right">市值 ({ccy})</th>
          <th className="p-2 text-right">未實現損益</th>
          <th className="p-2 text-right">報酬率</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(h => {
          const ret = h.totalCost > 0 ? (h.unrealizedPnL / h.totalCost) * 100 : 0
          return (
            <tr key={h.security.id} className="border-t hover:bg-slate-50">
              <td className="p-2 font-mono">{h.security.symbol}</td>
              <td className="p-2">{h.security.name}</td>
              <td className="p-2 text-right">{fmt(h.quantity, 0)}</td>
              <td className="p-2 text-right">{fmt(h.avgCost, 2)}</td>
              <td className="p-2 text-right">{h.marketPrice != null ? fmt(h.marketPrice, 2) : '—'}</td>
              <td className="p-2 text-right">{fmt(h.marketValue, 2)}</td>
              <td className={`p-2 text-right ${h.unrealizedPnL > 0 ? 'text-red-600' : h.unrealizedPnL < 0 ? 'text-green-600' : ''}`}>
                {h.marketPrice != null ? fmt(h.unrealizedPnL, 2) : '—'}
              </td>
              <td className={`p-2 text-right ${ret > 0 ? 'text-red-600' : ret < 0 ? 'text-green-600' : ''}`}>
                {h.marketPrice != null ? fmt(ret, 2) + '%' : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
