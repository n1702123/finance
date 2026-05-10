import { useEffect, useMemo, useState } from 'react'
import type { Account, Security, Transaction } from '../types'
import { Button, Card } from '../components/ui'
import { computeHoldings } from '../lib/holdings'
import { Stat } from '../components/dashboard/Stat'
import { PieBlock } from '../components/dashboard/PieBlock'
import { PerformanceChart } from '../components/dashboard/PerformanceChart'
import { CashForm } from '../components/dashboard/CashForm'
import { HoldingsTable } from '../components/dashboard/HoldingsTable'

const fmt = (n: number, d = 0) =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d })

interface Props { market: 'TW' | 'US' }

export function Dashboard({ market }: Props) {
  const ccy = market === 'TW' ? 'TWD' : 'USD'
  const title = market === 'TW' ? '台股儀表板' : '美股儀表板'

  const [tx, setTx] = useState<Transaction[]>([])
  const [sec, setSec] = useState<Security[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [prices, setPrices] = useState<Map<number, number>>(new Map())
  const [history, setHistory] = useState<Map<number, { date: string; close: number }[]>>(new Map())
  const [cashBalance, setCashBalance] = useState(0)
  const [busy, setBusy] = useState(false)

  async function loadCached() {
    const [t, s, p, ac, cb] = await Promise.all([
      window.api.transactions.list(),
      window.api.securities.list(),
      window.api.quotes.latest(),
      window.api.accounts.list(),
      window.api.cash.balance(market),
    ])
    const secOfMarket = s.filter(x => x.market === market)
    const idSet = new Set(secOfMarket.map(x => x.id))
    setSec(secOfMarket)
    setTx(t.filter(x => idSet.has(x.security_id)))
    setPrices(new Map(p))
    setAccounts(ac.filter(a => a.market === market))
    setCashBalance(cb)
    const hist = new Map<number, { date: string; close: number }[]>()
    await Promise.all(secOfMarket.filter(x => x.symbol !== 'CASH').map(async x => {
      hist.set(x.id, await window.api.quotes.history(x.id))
    }))
    setHistory(hist)
  }
  useEffect(() => { loadCached() }, [market])

  async function refreshOnline(force = false) {
    setBusy(true)
    try {
      const q = await window.api.quotes.refreshAll(market, { force })
      await loadCached()
      const lines = [`股價更新成功: ${q.updated} 檔`]
      if (q.skipped > 0) lines.push(`今日已抓過,跳過: ${q.skipped} 檔`)
      if (q.failed.length) {
        lines.push('', '失敗:')
        for (const f of q.failed) lines.push(`  ${f.symbol} — ${f.error}`)
      }
      alert(lines.join('\n'))
    } catch (e: any) {
      alert('刷新發生錯誤:\n' + (e?.message ?? String(e)))
    } finally { setBusy(false) }
  }

  const holdings = useMemo(
    () => computeHoldings(tx, sec).filter(h => h.quantity > 0 && h.security.symbol !== 'CASH'),
    [tx, sec],
  )
  const txNoCash = useMemo(() => {
    const cashIds = new Set(sec.filter(s => s.symbol === 'CASH').map(s => s.id))
    return tx.filter(t => !cashIds.has(t.security_id))
  }, [tx, sec])
  const secNoCash = useMemo(() => sec.filter(s => s.symbol !== 'CASH'), [sec])

  const valued = useMemo(() => holdings.map(h => {
    const mp = prices.get(h.security.id) ?? null
    const marketValue = mp != null ? mp * h.quantity : 0
    const unrealizedPnL = mp != null ? marketValue - h.totalCost : 0
    return { ...h, marketPrice: mp, marketValue, unrealizedPnL }
  }), [holdings, prices])

  const totals = useMemo(() => {
    let mv = 0, cost = 0, unreal = 0
    for (const h of valued) {
      mv += h.marketValue
      cost += h.totalCost
      unreal += h.unrealizedPnL
    }
    return { mv, cost, unreal }
  }, [valued])

  const pieByStock = useMemo(() =>
    valued.map(h => ({ name: `${h.security.symbol}`, fullName: h.security.name, value: h.marketValue }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value),
  [valued])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="flex gap-2">
          <Button onClick={() => refreshOnline(false)} disabled={busy}>
            {busy ? '更新中…' : '刷新股價'}
          </Button>
          <Button variant="ghost" onClick={() => refreshOnline(true)} disabled={busy} title="忽略「今日已抓過」快取,強制重抓">
            強制重抓
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={`總市值 (${ccy})`} value={fmt(totals.mv)} />
        <Stat label={`總成本 (${ccy})`} value={fmt(totals.cost)} />
        <Stat label={`現金 (${ccy})`}   value={fmt(cashBalance)} />
        <Stat label={`總資產 (${ccy})`} value={fmt(totals.mv + cashBalance)} />
        <Stat label="未實現損益"        value={fmt(totals.unreal)} tone={totals.unreal} />
      </div>

      <Card title="現金管理">
        <CashForm market={market} accounts={accounts} balance={cashBalance} onSaved={loadCached} ccy={ccy} />
      </Card>

      <Card title="個股配置">
        <PieBlock data={pieByStock} />
      </Card>

      <Card title={`總資產走勢 (${ccy})`}>
        <PerformanceChart tx={txNoCash} sec={secNoCash} history={history} />
      </Card>

      <Card title="持股明細">
        <HoldingsTable rows={valued} ccy={ccy} />
      </Card>
    </div>
  )
}
