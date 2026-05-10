import { getDb, saveDb } from './db'

/**
 * 抓 USD→TWD 匯率(近 1 年日線),寫入 fx_rates。
 * 來源:Yahoo Finance "TWD=X" (USDTWD)
 */
export async function refreshFx(): Promise<{ ok: boolean; latest?: number; days?: number; message?: string }> {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&range=1y'
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const j = await res.json() as any
    const result = j?.chart?.result?.[0]
    if (!result) return { ok: false, message: '匯率來源無回應' }
    const ts: number[] = result.timestamp ?? []
    const closes: (number|null)[] = result.indicators?.quote?.[0]?.close ?? []
    const points = ts.map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      rate: closes[i],
    })).filter(p => p.rate != null) as { date: string; rate: number }[]

    const db = getDb()
    const stmt = db.prepare('INSERT OR REPLACE INTO fx_rates(date,from_ccy,to_ccy,rate) VALUES(?,?,?,?)')
    db.exec('BEGIN')
    try {
      for (const p of points) { stmt.bind([p.date, 'USD', 'TWD', p.rate]); stmt.step(); stmt.reset() }
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e } finally { stmt.free() }
    saveDb()

    return { ok: true, latest: points.at(-1)?.rate, days: points.length }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? '抓取失敗' }
  }
}

/** 最新 USD→TWD 匯率(無資料時回 null) */
export function getLatestFx(): number | null {
  const r = getDb().exec("SELECT rate FROM fx_rates WHERE from_ccy='USD' AND to_ccy='TWD' ORDER BY date DESC LIMIT 1")
  if (!r[0] || r[0].values.length === 0) return null
  return Number(r[0].values[0][0])
}

/** 取得歷史 USD→TWD,Map<date, rate> */
export function getFxHistory(): Map<string, number> {
  const r = getDb().exec("SELECT date, rate FROM fx_rates WHERE from_ccy='USD' AND to_ccy='TWD' ORDER BY date")
  const out = new Map<string, number>()
  if (!r[0]) return out
  for (const row of r[0].values) out.set(String(row[0]), Number(row[1]))
  return out
}
