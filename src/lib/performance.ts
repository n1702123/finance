import type { Security, Transaction } from '../types'

export interface DailyPoint {
  date: string
  marketValueTwd: number   // 當日總市值(TWD)
  costBasisTwd: number     // 當日總成本(TWD)
  unrealizedTwd: number    // 未實現損益
}

interface Position { quantity: number; avgCost: number }

const dayMs = 24 * 3600 * 1000

function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  let d = new Date(start + 'T00:00:00Z').getTime()
  const e = new Date(end + 'T00:00:00Z').getTime()
  while (d <= e) {
    out.push(new Date(d).toISOString().slice(0, 10))
    d += dayMs
  }
  return out
}

/** 取小於等於指定 date 的最接近價格 */
function priceOn(history: { date: string; close: number }[], date: string): number | null {
  let lo = 0, hi = history.length - 1, ans: number | null = null
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (history[m].date <= date) { ans = history[m].close; lo = m + 1 } else hi = m - 1
  }
  return ans
}

function fxOn(fxMap: Map<string, number>, sortedDates: string[], date: string): number | null {
  let lo = 0, hi = sortedDates.length - 1, ans: string | null = null
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (sortedDates[m] <= date) { ans = sortedDates[m]; lo = m + 1 } else hi = m - 1
  }
  return ans ? fxMap.get(ans) ?? null : null
}

/**
 * 模擬每日總資產走勢:
 *   依時間順序套用交易,維持每檔 (quantity, avgCost),
 *   再用該日的歷史價(無則最近一筆)算市值,USD 用該日匯率換算 TWD。
 */
export function buildDailySeries(
  transactions: Transaction[],
  securities: Security[],
  pricesBySec: Map<number, { date: string; close: number }[]>,
  fxMap: Map<string, number>,
): DailyPoint[] {
  if (transactions.length === 0) return []

  const sortedTx = [...transactions].sort((a, b) =>
    a.trade_date === b.trade_date ? a.id - b.id : a.trade_date.localeCompare(b.trade_date)
  )
  const start = sortedTx[0].trade_date
  const end = new Date().toISOString().slice(0, 10)
  const days = dateRange(start, end)
  const fxDates = Array.from(fxMap.keys()).sort()
  const secById = new Map(securities.map(s => [s.id, s]))

  const positions = new Map<number, Position>()
  let txIdx = 0

  const out: DailyPoint[] = []
  for (const day of days) {
    while (txIdx < sortedTx.length && sortedTx[txIdx].trade_date <= day) {
      const t = sortedTx[txIdx++]
      let p = positions.get(t.security_id)
      if (!p) { p = { quantity: 0, avgCost: 0 }; positions.set(t.security_id, p) }
      if (t.type === 'BUY') {
        const cost = t.quantity * t.price + t.fee + t.tax
        const newQty = p.quantity + t.quantity
        p.avgCost = newQty > 0 ? (p.quantity * p.avgCost + cost) / newQty : 0
        p.quantity = newQty
      } else if (t.type === 'SELL') {
        p.quantity -= t.quantity
        if (p.quantity <= 1e-9) { p.quantity = 0; p.avgCost = 0 }
      }
    }

    let mv = 0, cost = 0
    for (const [sid, p] of positions) {
      if (p.quantity <= 0) continue
      const sec = secById.get(sid); if (!sec) continue
      const hist = pricesBySec.get(sid) ?? []
      const px = priceOn(hist, day) ?? p.avgCost  // 無價時退回成本(避免缺口)
      const fx = sec.currency === 'USD' ? (fxOn(fxMap, fxDates, day) ?? 0) : 1
      mv += p.quantity * px * fx
      cost += p.quantity * p.avgCost * fx
    }
    out.push({ date: day, marketValueTwd: mv, costBasisTwd: cost, unrealizedTwd: mv - cost })
  }
  return out
}

export interface DailyPointNative {
  date: string
  marketValue: number
  costBasis: number
  unrealized: number
}

/** 同 buildDailySeries,但不換算匯率(假設輸入交易都是同一幣別)。 */
export function buildDailySeriesNative(
  transactions: Transaction[],
  securities: Security[],
  pricesBySec: Map<number, { date: string; close: number }[]>,
): DailyPointNative[] {
  if (transactions.length === 0) return []

  const sortedTx = [...transactions].sort((a, b) =>
    a.trade_date === b.trade_date ? a.id - b.id : a.trade_date.localeCompare(b.trade_date)
  )
  const start = sortedTx[0].trade_date
  const end = new Date().toISOString().slice(0, 10)
  const days = dateRange(start, end)
  const secById = new Map(securities.map(s => [s.id, s]))

  const positions = new Map<number, Position>()
  let txIdx = 0

  const out: DailyPointNative[] = []
  for (const day of days) {
    while (txIdx < sortedTx.length && sortedTx[txIdx].trade_date <= day) {
      const t = sortedTx[txIdx++]
      let p = positions.get(t.security_id)
      if (!p) { p = { quantity: 0, avgCost: 0 }; positions.set(t.security_id, p) }
      if (t.type === 'BUY') {
        const cost = t.quantity * t.price + t.fee + t.tax
        const newQty = p.quantity + t.quantity
        p.avgCost = newQty > 0 ? (p.quantity * p.avgCost + cost) / newQty : 0
        p.quantity = newQty
      } else if (t.type === 'SELL') {
        p.quantity -= t.quantity
        if (p.quantity <= 1e-9) { p.quantity = 0; p.avgCost = 0 }
      }
    }

    let mv = 0, cost = 0
    for (const [sid, p] of positions) {
      if (p.quantity <= 0) continue
      if (!secById.has(sid)) continue
      const hist = pricesBySec.get(sid) ?? []
      const px = priceOn(hist, day) ?? p.avgCost
      mv += p.quantity * px
      cost += p.quantity * p.avgCost
    }
    out.push({ date: day, marketValue: mv, costBasis: cost, unrealized: mv - cost })
  }
  return out
}
