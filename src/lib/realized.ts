import type { Security, Transaction } from '../types'

export interface RealizedLot {
  security: Security
  quantity: number
  daysHeld: number
  openDate: string
  closeDate: string
  proceeds: number          // 賣出收入(已扣手續費與稅)
  costBasis: number         // 調整後成本(取得時的單位成本 × 數量,含當時手續費分攤)
  wsLossDisallowed: number  // 暫無洗售判定,固定 0
  pnl: number               // proceeds - costBasis
}

export interface OversellWarning {
  security: Security
  date: string         // 發生賣超的賣出日期
  shortfall: number    // 缺口股數(賣出量 − 可配對買入量)
}

export interface RealizedResult {
  lots: RealizedLot[]
  oversold: OversellWarning[]
}

interface BuyLot {
  date: string
  remaining: number
  costPerShare: number   // 含買入時手續費分攤的單位成本
}

const dayMs = 24 * 3600 * 1000
function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / dayMs))
}

/**
 * FIFO 配對:逐檔股票,把 BUY 排成佇列,每次 SELL 從最早的 BUY 開始扣,
 * 每段配對產生一筆 RealizedLot。
 */
export function computeRealized(transactions: Transaction[], securities: Security[]): RealizedResult {
  const secById = new Map(securities.map(s => [s.id, s]))
  const grouped = new Map<number, Transaction[]>()
  for (const t of transactions) {
    if (t.type !== 'BUY' && t.type !== 'SELL') continue
    const sec = secById.get(t.security_id)
    if (sec?.symbol === 'CASH') continue                 // 現金不列入損益
    if (!grouped.has(t.security_id)) grouped.set(t.security_id, [])
    grouped.get(t.security_id)!.push(t)
  }

  const out: RealizedLot[] = []
  const oversold: OversellWarning[] = []
  for (const [sid, list] of grouped) {
    const sec = secById.get(sid); if (!sec) continue
    const sorted = [...list].sort((a, b) =>
      a.trade_date === b.trade_date ? a.id - b.id : a.trade_date.localeCompare(b.trade_date)
    )
    const lots: BuyLot[] = []

    for (const t of sorted) {
      if (t.type === 'BUY') {
        if (t.quantity <= 0) continue
        const totalCost = t.quantity * t.price + t.fee + t.tax
        lots.push({
          date: t.trade_date,
          remaining: t.quantity,
          costPerShare: totalCost / t.quantity,
        })
      } else if (t.type === 'SELL') {
        let toSell = t.quantity
        if (toSell <= 0) continue
        const sellNet = t.quantity * t.price - t.fee - t.tax  // 整筆淨收入
        const sellNetPerShare = sellNet / t.quantity

        while (toSell > 1e-9 && lots.length > 0) {
          const lot = lots[0]
          const used = Math.min(lot.remaining, toSell)
          const proceeds = used * sellNetPerShare
          const cost = used * lot.costPerShare
          out.push({
            security: sec,
            quantity: used,
            daysHeld: daysBetween(lot.date, t.trade_date),
            openDate: lot.date,
            closeDate: t.trade_date,
            proceeds,
            costBasis: cost,
            wsLossDisallowed: 0,
            pnl: proceeds - cost,
          })
          lot.remaining -= used
          toSell -= used
          if (lot.remaining <= 1e-9) lots.shift()
        }
        if (toSell > 1e-9) {
          oversold.push({ security: sec, date: t.trade_date, shortfall: toSell })
        }
      }
    }
  }

  out.sort((a, b) =>
    a.closeDate === b.closeDate
      ? a.security.symbol.localeCompare(b.security.symbol)
      : b.closeDate.localeCompare(a.closeDate)
  )
  return { lots: out, oversold }
}
