import type { Security, Transaction } from '../types'

export interface Holding {
  security: Security
  quantity: number      // 目前持有數量
  avgCost: number       // 移動平均成本(每股,本幣)
  totalCost: number     // 總成本(本幣) = quantity * avgCost
  realizedPnL: number   // 已實現損益(本幣)
  totalDividend: number // 累計股息(本幣)
}

/**
 * 移動平均成本法:
 *   買進  → 新平均 = (舊總成本 + 本次淨花費) / (舊數量 + 本次數量)
 *   賣出  → 已實現 += (售價 - 平均成本) × 賣出數量 - 手續費 - 稅
 *           數量 -= 賣出數量;平均成本不變
 *   股息  → 累計股息 += 金額(price 欄位視為配息總額,quantity 可為 0)
 *   費用  → 不影響數量,並入該股的已實現損益(成本)
 */
export function computeHoldings(transactions: Transaction[], securities: Security[]): Holding[] {
  const map = new Map<number, Holding>()
  const secById = new Map(securities.map(s => [s.id, s]))

  const sorted = [...transactions].sort((a, b) =>
    a.trade_date === b.trade_date ? a.id - b.id : a.trade_date.localeCompare(b.trade_date)
  )

  for (const t of sorted) {
    const sec = secById.get(t.security_id)
    if (!sec) continue
    let h = map.get(t.security_id)
    if (!h) {
      h = { security: sec, quantity: 0, avgCost: 0, totalCost: 0, realizedPnL: 0, totalDividend: 0 }
      map.set(t.security_id, h)
    }

    if (t.type === 'BUY') {
      const cost = t.quantity * t.price + t.fee + t.tax
      const newQty = h.quantity + t.quantity
      h.avgCost = newQty > 0 ? (h.totalCost + cost) / newQty : 0
      h.quantity = newQty
      h.totalCost = h.avgCost * newQty
    } else if (t.type === 'SELL') {
      const proceeds = t.quantity * t.price - t.fee - t.tax
      h.realizedPnL += proceeds - t.quantity * h.avgCost
      h.quantity -= t.quantity
      if (h.quantity <= 1e-9) { h.quantity = 0; h.avgCost = 0; h.totalCost = 0 }
      else { h.totalCost = h.avgCost * h.quantity }
    } else if (t.type === 'DIVIDEND') {
      const amount = (t.quantity || 1) * t.price - t.tax
      h.totalDividend += amount
    } else if (t.type === 'FEE') {
      h.realizedPnL -= t.price + t.fee + t.tax
    }
  }

  return Array.from(map.values()).filter(h => h.quantity > 0 || h.realizedPnL !== 0 || h.totalDividend !== 0)
}

export interface ValuedHolding extends Holding {
  marketPrice: number | null   // 本幣每股市價
  marketValue: number          // 本幣市值
  unrealizedPnL: number        // 本幣未實現損益
  marketValueTwd: number       // 換算 TWD 後市值
  totalCostTwd: number         // 換算 TWD 後成本(用最新匯率簡化)
  unrealizedPnLTwd: number
}

/** 套上即時價與匯率(USD→TWD)。 */
export function valueHoldings(
  holdings: Holding[],
  prices: Map<number, number>,
  usdTwd: number | null,
): ValuedHolding[] {
  return holdings.map(h => {
    const mp = prices.get(h.security.id) ?? null
    const marketValue = mp != null ? mp * h.quantity : 0
    const unrealizedPnL = mp != null ? marketValue - h.totalCost : 0
    const fx = h.security.currency === 'USD' ? (usdTwd ?? 0) : 1
    return {
      ...h,
      marketPrice: mp,
      marketValue,
      unrealizedPnL,
      marketValueTwd: marketValue * fx,
      totalCostTwd: h.totalCost * fx,
      unrealizedPnLTwd: unrealizedPnL * fx,
    }
  })
}
