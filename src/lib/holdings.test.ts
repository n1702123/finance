import { describe, it, expect } from 'vitest'
import { computeHoldings, valueHoldings } from './holdings'
import { security, tx } from './__fixtures__'

describe('computeHoldings', () => {
  it('回傳空陣列當沒有交易', () => {
    expect(computeHoldings([], [])).toEqual([])
  })

  it('單筆買進 → 數量 = 買進量,平均成本含手續費', () => {
    const s = security({ symbol: '2330' })
    const t = [tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id, fee: 100 })]
    const h = computeHoldings(t, [s])
    expect(h).toHaveLength(1)
    expect(h[0].quantity).toBe(100)
    expect(h[0].avgCost).toBeCloseTo(601, 5)   // (100*600 + 100) / 100
    expect(h[0].totalCost).toBeCloseTo(60100, 5)
  })

  it('多次買進 → 移動平均', () => {
    const s = security({ symbol: 'AAPL' })
    const t = [
      tx('BUY', '2024-01-01', 10, 100, { sec_id: s.id }),
      tx('BUY', '2024-02-01', 10, 200, { sec_id: s.id }),
    ]
    const h = computeHoldings(t, [s])
    expect(h[0].quantity).toBe(20)
    expect(h[0].avgCost).toBeCloseTo(150, 5)   // (1000 + 2000) / 20
  })

  it('賣出 → 已實現損益 = (售價 - 平均成本) × 數量 - 手續費 - 稅', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id }),    // 平均成本 600
      tx('SELL','2024-06-01', 50,  800, { sec_id: s.id, fee: 100, tax: 200 }),
    ]
    const h = computeHoldings(t, [s])
    expect(h[0].quantity).toBe(50)
    expect(h[0].avgCost).toBeCloseTo(600, 5)   // 賣出後平均成本不變
    expect(h[0].realizedPnL).toBeCloseTo(50 * 800 - 100 - 200 - 50 * 600, 5)  // 9700
  })

  it('全部賣完 → quantity 與 avgCost 歸 0,但保留 realizedPnL', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id }),
      tx('SELL','2024-06-01', 100, 800, { sec_id: s.id }),
    ]
    const h = computeHoldings(t, [s])
    expect(h).toHaveLength(1)        // 仍出現(因為 realizedPnL ≠ 0)
    expect(h[0].quantity).toBe(0)
    expect(h[0].avgCost).toBe(0)
    expect(h[0].totalCost).toBe(0)
    expect(h[0].realizedPnL).toBeCloseTo(20000, 5)
  })

  it('股息 → 累計股息 = quantity × price - tax', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',     '2024-01-01', 100, 600, { sec_id: s.id }),
      tx('DIVIDEND','2024-07-01', 1, 5000, { sec_id: s.id, tax: 0 }),
    ]
    const h = computeHoldings(t, [s])
    expect(h[0].totalDividend).toBe(5000)
  })

  it('交易順序不影響結果(會自動依日期排)', () => {
    const s = security({ symbol: 'AAPL' })
    const t1 = [
      tx('BUY', '2024-01-01', 10, 100, { sec_id: s.id }),
      tx('BUY', '2024-02-01', 10, 200, { sec_id: s.id }),
    ]
    const t2 = [...t1].reverse()
    expect(computeHoldings(t1, [s])[0].avgCost).toBe(computeHoldings(t2, [s])[0].avgCost)
  })

  it('未知 security_id 的交易會被略過(不 crash)', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id }),
      tx('BUY', '2024-02-01', 50, 700, { sec_id: 9999 }),  // 不存在
    ]
    const h = computeHoldings(t, [s])
    expect(h).toHaveLength(1)
    expect(h[0].quantity).toBe(100)
  })

  it('多檔股票分開計算', () => {
    const a = security({ symbol: '2330' })
    const b = security({ symbol: '2454' })
    const t = [
      tx('BUY', '2024-01-01', 100, 600, { sec_id: a.id }),
      tx('BUY', '2024-01-02', 200, 1000, { sec_id: b.id }),
    ]
    const h = computeHoldings(t, [a, b])
    expect(h).toHaveLength(2)
    expect(h.find(x => x.security.symbol === '2330')!.quantity).toBe(100)
    expect(h.find(x => x.security.symbol === '2454')!.quantity).toBe(200)
  })
})

describe('valueHoldings', () => {
  it('套上市價計算未實現損益', () => {
    const s = security({ symbol: '2330' })
    const holdings = computeHoldings([tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id })], [s])
    const v = valueHoldings(holdings, new Map([[s.id, 800]]), null)
    expect(v[0].marketPrice).toBe(800)
    expect(v[0].marketValue).toBe(80000)
    expect(v[0].unrealizedPnL).toBe(20000)
  })

  it('沒提供市價時 marketValue=0,unrealizedPnL=0', () => {
    const s = security({ symbol: '2330' })
    const holdings = computeHoldings([tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id })], [s])
    const v = valueHoldings(holdings, new Map(), null)
    expect(v[0].marketPrice).toBeNull()
    expect(v[0].marketValue).toBe(0)
    expect(v[0].unrealizedPnL).toBe(0)
  })

  it('USD 持股套用匯率轉 TWD', () => {
    const s = security({ symbol: 'AAPL', market: 'US', currency: 'USD' })
    const holdings = computeHoldings([tx('BUY', '2024-01-01', 10, 200, { sec_id: s.id })], [s])
    const v = valueHoldings(holdings, new Map([[s.id, 250]]), 32)
    expect(v[0].marketValue).toBe(2500)            // 原幣 USD
    expect(v[0].marketValueTwd).toBe(2500 * 32)    // 換成 TWD
    expect(v[0].unrealizedPnLTwd).toBe(500 * 32)
  })

  it('USD 持股無匯率 → TWD 換算為 0', () => {
    const s = security({ symbol: 'AAPL', market: 'US', currency: 'USD' })
    const holdings = computeHoldings([tx('BUY', '2024-01-01', 10, 200, { sec_id: s.id })], [s])
    const v = valueHoldings(holdings, new Map([[s.id, 250]]), null)
    expect(v[0].marketValueTwd).toBe(0)
  })
})
