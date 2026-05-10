import { describe, it, expect } from 'vitest'
import { buildDailySeries, buildDailySeriesNative } from './performance'
import { security, tx } from './__fixtures__'

describe('buildDailySeriesNative', () => {
  it('沒交易回空陣列', () => {
    expect(buildDailySeriesNative([], [], new Map())).toEqual([])
  })

  it('每日成本 = 持有量 × 平均成本(無歷史價時退回成本)', () => {
    const s = security({ symbol: '2330' })
    const t = [tx('BUY', '2024-01-01', 100, 600, { sec_id: s.id })]
    const series = buildDailySeriesNative(t, [s], new Map())
    expect(series.length).toBeGreaterThan(0)
    expect(series[0].costBasis).toBe(60000)
    expect(series[0].marketValue).toBe(60000)   // 無價,退回成本
  })

  it('有歷史價時 marketValue 用該日收盤計算', () => {
    const s = security({ symbol: '2330' })
    const t = [tx('BUY', '2024-01-01', 10, 600, { sec_id: s.id })]
    const prices = new Map([[s.id, [
      { date: '2024-01-01', close: 600 },
      { date: '2024-01-02', close: 700 },
    ]]])
    const series = buildDailySeriesNative(t, [s], prices)
    const day1 = series.find(p => p.date === '2024-01-01')!
    const day2 = series.find(p => p.date === '2024-01-02')!
    expect(day1.marketValue).toBe(6000)
    expect(day2.marketValue).toBe(7000)
    expect(day2.unrealized).toBe(1000)
  })

  it('交易發生「之前」的日期不會出現(序列從第一筆交易日開始)', () => {
    const s = security({ symbol: '2330' })
    const t = [tx('BUY', '2024-06-01', 10, 600, { sec_id: s.id })]
    const series = buildDailySeriesNative(t, [s], new Map())
    expect(series[0].date).toBe('2024-06-01')
  })

  it('賣出後持有量歸 0,marketValue 變 0', () => {
    const s = security({ symbol: '2330' })
    const t = [
      tx('BUY',  '2024-01-01', 10, 600, { sec_id: s.id }),
      tx('SELL', '2024-01-03', 10, 800, { sec_id: s.id }),
    ]
    const series = buildDailySeriesNative(t, [s], new Map())
    const last = series.at(-1)!
    expect(last.marketValue).toBe(0)
    expect(last.costBasis).toBe(0)
  })
})

describe('buildDailySeries (TWD 換算)', () => {
  it('USD 持股套用該日匯率', () => {
    const s = security({ symbol: 'AAPL', market: 'US', currency: 'USD' })
    const t = [tx('BUY', '2024-01-01', 10, 100, { sec_id: s.id })]
    const prices = new Map([[s.id, [{ date: '2024-01-01', close: 100 }]]])
    const fxMap = new Map([['2024-01-01', 32]])
    const series = buildDailySeries(t, [s], prices, fxMap)
    expect(series[0].marketValueTwd).toBe(1000 * 32)
  })

  it('TWD 持股不套用匯率', () => {
    const s = security({ symbol: '2330', market: 'TW', currency: 'TWD' })
    const t = [tx('BUY', '2024-01-01', 10, 600, { sec_id: s.id })]
    const series = buildDailySeries(t, [s], new Map(), new Map())
    expect(series[0].marketValueTwd).toBe(6000)
  })

  it('USD 沒匯率資料 → marketValueTwd = 0', () => {
    const s = security({ symbol: 'AAPL', market: 'US', currency: 'USD' })
    const t = [tx('BUY', '2024-01-01', 10, 100, { sec_id: s.id })]
    const series = buildDailySeries(t, [s], new Map(), new Map())
    expect(series[0].marketValueTwd).toBe(0)
  })
})
