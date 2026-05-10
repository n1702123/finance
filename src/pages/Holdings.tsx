import { useEffect, useMemo, useState } from 'react'
import type { Security, Transaction } from '../types'
import { Card } from '../components/ui'
import { computeHoldings, valueHoldings, type ValuedHolding } from '../lib/holdings'

const fmt = (n: number, digits = 2) =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function Holdings() {
  const [tx, setTx] = useState<Transaction[]>([])
  const [sec, setSec] = useState<Security[]>([])
  const [prices, setPrices] = useState<Map<number, number>>(new Map())
  const [fx, setFx] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.transactions.list(),
      window.api.securities.list(),
      window.api.quotes.latest(),
      window.api.fx.latest(),
    ]).then(([t, s, p, f]) => { setTx(t); setSec(s); setPrices(new Map(p)); setFx(f) })
  }, [])

  const valued = useMemo(
    () => valueHoldings(computeHoldings(tx, sec).filter(h => h.security.symbol !== 'CASH'), prices, fx),
    [tx, sec, prices, fx],
  )

  const tw = valued.filter(h => h.security.market === 'TW')
  const us = valued.filter(h => h.security.market === 'US')

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">持股</h2>
      <Card title="台股 (TWD)"><HoldingTable rows={tw} /></Card>
      <Card title="美股 (USD)"><HoldingTable rows={us} /></Card>
    </div>
  )
}

function HoldingTable({ rows }: { rows: ValuedHolding[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">尚無資料。</p>
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left">
        <tr>
          <th className="p-2">代號</th>
          <th className="p-2">名稱</th>
          <th className="p-2 text-right">持有</th>
          <th className="p-2 text-right">平均成本</th>
          <th className="p-2 text-right">市價</th>
          <th className="p-2 text-right">市值</th>
          <th className="p-2 text-right">未實現</th>
          <th className="p-2 text-right">已實現</th>
          <th className="p-2 text-right">股息</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(h => (
          <tr key={h.security.id} className="border-t hover:bg-slate-50">
            <td className="p-2 font-mono">{h.security.symbol}</td>
            <td className="p-2">{h.security.name}</td>
            <td className="p-2 text-right">{fmt(h.quantity, 0)}</td>
            <td className="p-2 text-right">{fmt(h.avgCost)}</td>
            <td className="p-2 text-right">{h.marketPrice != null ? fmt(h.marketPrice) : '—'}</td>
            <td className="p-2 text-right">{fmt(h.marketValue)}</td>
            <td className={`p-2 text-right ${h.unrealizedPnL > 0 ? 'text-red-600' : h.unrealizedPnL < 0 ? 'text-green-600' : ''}`}>
              {h.marketPrice != null ? fmt(h.unrealizedPnL) : '—'}
            </td>
            <td className={`p-2 text-right ${h.realizedPnL > 0 ? 'text-red-600' : h.realizedPnL < 0 ? 'text-green-600' : ''}`}>
              {fmt(h.realizedPnL)}
            </td>
            <td className="p-2 text-right">{fmt(h.totalDividend)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
