import { useEffect, useMemo, useState } from 'react'
import type { Security, Transaction } from '../types'
import { Card, Select, Field } from '../components/ui'
import { computeRealized } from '../lib/realized'

const fmtMoney = (n: number, ccy: string) => {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}NT$${abs}`
}
const fmtNum = (n: number, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d === 0 ? 0 : 5 })
const fmtDate = (d: string) => d.replaceAll('-', '/')

export function Realized() {
  const [tx, setTx] = useState<Transaction[]>([])
  const [sec, setSec] = useState<Security[]>([])
  const [marketFilter, setMarketFilter] = useState<'ALL'|'TW'|'US'>('ALL')

  useEffect(() => {
    Promise.all([window.api.transactions.list(), window.api.securities.list()])
      .then(([t, s]) => { setTx(t); setSec(s) })
  }, [])

  const { lots: all, oversold } = useMemo(() => computeRealized(tx, sec), [tx, sec])
  const rows = useMemo(
    () => marketFilter === 'ALL' ? all : all.filter(r => r.security.market === marketFilter),
    [all, marketFilter],
  )
  const oversoldShown = useMemo(
    () => marketFilter === 'ALL' ? oversold : oversold.filter(o => o.security.market === marketFilter),
    [oversold, marketFilter],
  )

  const totals = useMemo(() => {
    let proc = 0, cost = 0, pnl = 0
    for (const r of rows) { proc += r.proceeds; cost += r.costBasis; pnl += r.pnl }
    return { proc, cost, pnl }
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">已實現損益</h2>
        <Field label="市場">
          <Select value={marketFilter} onChange={e => setMarketFilter(e.target.value as 'ALL'|'TW'|'US')}>
            <option value="ALL">全部</option>
            <option value="TW">台股</option>
            <option value="US">美股</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="筆數" value={String(rows.length)} />
        <Stat label="累計賣出收入" value={rows.length === 0 ? '—' : fmtSummary(rows.map(r => ({ value: r.proceeds, ccy: r.security.currency })))} />
        <Stat label="淨益損" value={rows.length === 0 ? '—' : fmtSummary(rows.map(r => ({ value: r.pnl, ccy: r.security.currency })))} tone={totals.pnl} />
      </div>

      {oversoldShown.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">⚠ 偵測到賣超(賣出量超過買進量),已忽略無法配對的部分:</div>
          <ul className="mt-1 list-disc pl-5">
            {oversoldShown.map((o, i) => (
              <li key={i}>
                <span className="font-mono">{o.security.symbol}</span>(
                {o.security.name}) 於 {fmtDate(o.date)} 缺口 {fmtNum(o.shortfall, o.shortfall % 1 === 0 ? 0 : 5)} 股
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card title={`明細 (${rows.length} 筆)`}>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">尚無已平倉交易。賣出後會自動以 FIFO 配對買入紀錄並列在這裡。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2">代號</th>
                  <th className="p-2">詳細資訊</th>
                  <th className="p-2 text-right">數目</th>
                  <th className="p-2 text-right">持有日數</th>
                  <th className="p-2">開倉日期</th>
                  <th className="p-2">平倉日期</th>
                  <th className="p-2 text-right">賣出收入</th>
                  <th className="p-2 text-right">調整後成本</th>
                  <th className="p-2 text-right">WS Loss Disallowed</th>
                  <th className="p-2 text-right">淨益損 $</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t hover:bg-slate-50">
                    <td className="p-2 font-mono">{r.security.symbol}</td>
                    <td className="p-2 max-w-xs truncate" title={r.security.name}>{r.security.name}</td>
                    <td className="p-2 text-right">{fmtNum(r.quantity, r.quantity % 1 === 0 ? 0 : 5)}</td>
                    <td className="p-2 text-right">{r.daysHeld}</td>
                    <td className="p-2">{fmtDate(r.openDate)}</td>
                    <td className="p-2">{fmtDate(r.closeDate)}</td>
                    <td className="p-2 text-right">{fmtMoney(r.proceeds, r.security.currency)}</td>
                    <td className="p-2 text-right">{fmtMoney(r.costBasis, r.security.currency)}</td>
                    <td className="p-2 text-right">{fmtMoney(r.wsLossDisallowed, r.security.currency)}</td>
                    <td className={`p-2 text-right font-medium ${r.pnl > 0 ? 'text-emerald-600' : r.pnl < 0 ? 'text-red-600' : ''}`}>
                      {fmtMoney(r.pnl, r.security.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined ? '' : tone > 0 ? 'text-emerald-600' : tone < 0 ? 'text-red-600' : ''
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  )
}

/** 同時可能有 USD/TWD,分別加總顯示 */
function fmtSummary(items: { value: number; ccy: string }[]): string {
  const byCcy = new Map<string, number>()
  for (const it of items) byCcy.set(it.ccy, (byCcy.get(it.ccy) ?? 0) + it.value)
  return Array.from(byCcy.entries()).map(([c, v]) => fmtMoney(v, c)).join(' / ')
}
