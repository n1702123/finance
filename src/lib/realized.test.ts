import { describe, it, expect } from 'vitest'
import { computeRealized } from './realized'
import { security, tx } from './__fixtures__'

describe('computeRealized (FIFO)', () => {
  it('沒交易回空陣列', () => {
    expect(computeRealized([], [])).toEqual({ lots: [], oversold: [] })
  })

  it('只有買進、沒賣出 → 空', () => {
    const s = security({ symbol: '2330' })
    expect(computeRealized([tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id })], [s])).toEqual({ lots: [], oversold: [] })
  })

  it('一買一賣 → 一筆配對', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',  '2024-01-01', 100, 600, { sec_id: s.id }),
      tx('SELL', '2024-06-01', 100, 800, { sec_id: s.id }),
    ]
    const { lots: r } = computeRealized(t, [s])
    expect(r).toHaveLength(1)
    expect(r[0].quantity).toBe(100)
    expect(r[0].openDate).toBe('2024-01-01')
    expect(r[0].closeDate).toBe('2024-06-01')
    expect(r[0].daysHeld).toBe(152)
    expect(r[0].pnl).toBeCloseTo(20000, 5)
  })

  it('FIFO:一賣對多買 → 多筆配對', () => {
    const s = security({ symbol: 'AAPL' })
    const t = [
      tx('BUY',  '2024-01-01', 5, 100, { sec_id: s.id }),
      tx('BUY',  '2024-02-01', 5, 200, { sec_id: s.id }),
      tx('SELL', '2024-06-01', 8, 300, { sec_id: s.id }),  // 吃 5 + 3
    ]
    const { lots: r } = computeRealized(t, [s])
    expect(r).toHaveLength(2)
    // 排序預設 closeDate 新→舊,同日按 symbol;這裡兩列都是同一天,順序不保證,改用篩選
    const r1 = r.find(x => x.openDate === '2024-01-01')!
    const r2 = r.find(x => x.openDate === '2024-02-01')!
    expect(r1.quantity).toBe(5)
    expect(r1.pnl).toBeCloseTo(5 * 300 - 5 * 100, 5)   // 1000
    expect(r2.quantity).toBe(3)
    expect(r2.pnl).toBeCloseTo(3 * 300 - 3 * 200, 5)   // 300
  })

  it('手續費分攤到每股 — 進場 + 出場', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',  '2024-01-01', 10, 100, { sec_id: s.id, fee: 50 }),  // 每股成本 105
      tx('SELL', '2024-06-01', 10, 200, { sec_id: s.id, fee: 30 }),  // 淨收入每股 197
    ]
    const { lots: r } = computeRealized(t, [s])
    expect(r).toHaveLength(1)
    expect(r[0].costBasis).toBeCloseTo(1050, 5)
    expect(r[0].proceeds).toBeCloseTo(1970, 5)
    expect(r[0].pnl).toBeCloseTo(920, 5)
  })

  it('現金 (CASH) 不列入損益', () => {
    const cash = security({ symbol: 'CASH', name: '台幣現金' })
    const t = [
      tx('BUY',  '2024-01-01', 100000, 1, { sec_id: cash.id }),
      tx('SELL', '2024-06-01',  50000, 1, { sec_id: cash.id }),
    ]
    expect(computeRealized(t, [cash])).toEqual({ lots: [], oversold: [] })
  })

  it('排序預設 closeDate 新→舊', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',  '2024-01-01', 10, 100, { sec_id: s.id }),
      tx('SELL', '2024-03-01', 5, 150, { sec_id: s.id }),
      tx('SELL', '2024-06-01', 5, 200, { sec_id: s.id }),
    ]
    const { lots: r } = computeRealized(t, [s])
    expect(r[0].closeDate).toBe('2024-06-01')
    expect(r[1].closeDate).toBe('2024-03-01')
  })

  it('賣超(超出買進量)— 多餘的部分忽略,不會 throw', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',  '2024-01-01', 10, 100, { sec_id: s.id }),
      tx('SELL', '2024-06-01', 20, 200, { sec_id: s.id }),  // 賣 20 但只有 10
    ]
    const { lots: r, oversold } = computeRealized(t, [s])
    // 只配對到 10 股
    const total = r.reduce((sum, x) => sum + x.quantity, 0)
    expect(total).toBe(10)
    // 賣超應產生警告 (缺口 10 股)
    expect(oversold).toHaveLength(1)
    expect(oversold[0].shortfall).toBeCloseTo(10, 5)
    expect(oversold[0].date).toBe('2024-06-01')
    expect(oversold[0].security.symbol).toBe('2330')
  })

  it('多檔股票分開配對', () => {
    const a = security({ symbol: '2330' })
    const b = security({ symbol: 'AAPL' })
    const t = [
      tx('BUY',  '2024-01-01', 10, 100, { sec_id: a.id }),
      tx('SELL', '2024-06-01', 10, 200, { sec_id: a.id }),
      tx('BUY',  '2024-02-01', 5, 150, { sec_id: b.id }),
      tx('SELL', '2024-07-01', 5, 100, { sec_id: b.id }),  // 賠錢
    ]
    const { lots: r } = computeRealized(t, [a, b])
    expect(r).toHaveLength(2)
    expect(r.find(x => x.security.symbol === '2330')!.pnl).toBeCloseTo(1000, 5)
    expect(r.find(x => x.security.symbol === 'AAPL')!.pnl).toBeCloseTo(-250, 5)
  })

  it('日期相同但 id 不同 → 用 id 順序穩定排序', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',  '2024-01-01', 5, 100, { sec_id: s.id }),
      tx('BUY',  '2024-01-01', 5, 200, { sec_id: s.id }),
      tx('SELL', '2024-06-01', 5, 300, { sec_id: s.id }),  // FIFO 應吃第一筆 (cost 100)
    ]
    const { lots: r } = computeRealized(t, [s])
    expect(r).toHaveLength(1)
    expect(r[0].pnl).toBeCloseTo(1000, 5)  // (300-100)*5
  })
})
