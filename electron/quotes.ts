import { getDb, saveDb } from './db'
import { securitiesRepo, type Security } from './db/repo'

export interface Quote {
  security_id: number
  symbol: string
  market: 'TW'|'US'
  price: number
  date: string  // YYYY-MM-DD
}

// ------------------------------------------------------------ TWSE 即時報價 (上市 tse_ → 上櫃 otc_ fallback)
async function fetchTwQuoteFromChannel(channel: string): Promise<number | null> {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${channel}&json=1&delay=0`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const j = await res.json() as { msgArray?: Array<{ z?: string; y?: string }> }
    const row = j.msgArray?.[0]
    if (!row) return null
    // z = 最新成交價, y = 昨收;盤前/盤後 z 為 '-'
    const price = Number(row.z !== '-' && row.z ? row.z : row.y)
    return Number.isFinite(price) && price > 0 ? price : null
  } catch { return null }
}

async function fetchTwQuote(symbol: string): Promise<number | null> {
  // 先試上市 (tse_),失敗再試上櫃 (otc_)
  const tse = await fetchTwQuoteFromChannel(`tse_${symbol}.tw`)
  if (tse != null) return tse
  return await fetchTwQuoteFromChannel(`otc_${symbol}.tw`)
}

// 美股代號正規化:Yahoo Finance 的 class B 股用槓號(BRK.B → BRK-B)
function normalizeYahooSymbol(symbol: string): string {
  return symbol.replace('.', '-')
}

// ------------------------------------------------------------ Yahoo Finance (美股) — 即時 + 歷史
async function fetchYahoo(symbol: string): Promise<{ price: number | null; history: { date: string; close: number }[]; error?: string }> {
  const yahooSymbol = normalizeYahooSymbol(symbol)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1y`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return { price: null, history: [], error: `HTTP ${res.status}` }
    const j = await res.json() as any
    if (j?.chart?.error) return { price: null, history: [], error: j.chart.error.description ?? 'Yahoo error' }
    const result = j?.chart?.result?.[0]
    if (!result) return { price: null, history: [], error: '無資料' }
    const ts: number[] = result.timestamp ?? []
    const closes: (number|null)[] = result.indicators?.quote?.[0]?.close ?? []
    const history = ts.map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      close: closes[i],
    })).filter(p => p.close != null) as { date: string; close: number }[]
    const price = result.meta?.regularMarketPrice ?? history.at(-1)?.close ?? null
    return { price, history }
  } catch (e: any) {
    return { price: null, history: [], error: e?.message ?? 'fetch failed' }
  }
}

// ------------------------------------------------------------ 寫入 price_history
function upsertPrices(securityId: number, points: { date: string; close: number }[]) {
  const db = getDb()
  const stmt = db.prepare('INSERT OR REPLACE INTO price_history(security_id,date,close) VALUES(?,?,?)')
  db.exec('BEGIN')
  try {
    for (const p of points) { stmt.bind([securityId, p.date, p.close]); stmt.step(); stmt.reset() }
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e } finally { stmt.free() }
  saveDb()
}

// ------------------------------------------------------------ 對外:刷新單檔 / 全部
export async function refreshQuote(sec: Security): Promise<{ quote: Quote | null; error?: string }> {
  const today = new Date().toISOString().slice(0, 10)
  if (sec.market === 'TW') {
    const price = await fetchTwQuote(sec.symbol)
    if (price == null) return { quote: null, error: 'TWSE 無回應' }
    upsertPrices(sec.id, [{ date: today, close: price }])
    return { quote: { security_id: sec.id, symbol: sec.symbol, market: 'TW', price, date: today } }
  } else {
    const { price, history, error } = await fetchYahoo(sec.symbol)
    if (history.length > 0) upsertPrices(sec.id, history)
    if (price == null) return { quote: null, error: error ?? '無價格' }
    return { quote: { security_id: sec.id, symbol: sec.symbol, market: 'US', price, date: today } }
  }
}

/** 取得每檔最新一筆 price_history 的日期(用來判斷今日是否已抓過) */
function getLatestPriceDates(): Map<number, string> {
  const rows = getDb().exec(`
    SELECT security_id, MAX(date) AS d FROM price_history GROUP BY security_id
  `)
  const out = new Map<number, string>()
  if (!rows[0]) return out
  for (const r of rows[0].values) out.set(Number(r[0]), String(r[1]))
  return out
}

export async function refreshAllQuotes(
  market?: 'TW'|'US',
  opts?: { force?: boolean; concurrency?: number },
): Promise<{ updated: number; skipped: number; failed: { symbol: string; error: string }[] }> {
  const force = opts?.force ?? false
  const concurrency = Math.max(1, opts?.concurrency ?? 5)
  const today = new Date().toISOString().slice(0, 10)

  const list = securitiesRepo.list().filter(s =>
    s.symbol !== 'CASH' && (!market || s.market === market)
  )

  // #10: 跳過今日已抓過的
  const latestDates = force ? new Map<number, string>() : getLatestPriceDates()
  const targets = list.filter(s => force || latestDates.get(s.id) !== today)
  const skipped = list.length - targets.length

  const failed: { symbol: string; error: string }[] = []
  let updated = 0

  // #8: 並行抓價,限制同時最多 N 個 (避免被 rate-limit)
  let i = 0
  async function worker() {
    while (i < targets.length) {
      const s = targets[i++]
      try {
        const r = await refreshQuote(s)
        if (r.quote) updated++
        else failed.push({ symbol: s.symbol, error: r.error ?? '未知錯誤' })
      } catch (e: any) {
        failed.push({ symbol: s.symbol, error: e?.message ?? String(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))

  return { updated, skipped, failed }
}

// 取得每檔最新收盤價(快取在 price_history)
export function getLatestPrices(): Map<number, number> {
  const rows = getDb().exec(`
    SELECT p.security_id, p.close
    FROM price_history p
    JOIN (SELECT security_id, MAX(date) AS d FROM price_history GROUP BY security_id) m
      ON p.security_id = m.security_id AND p.date = m.d
  `)
  const out = new Map<number, number>()
  if (!rows[0]) return out
  for (const r of rows[0].values) out.set(Number(r[0]), Number(r[1]))
  return out
}

// 取得指定股票歷史(繪圖用)
export function getPriceHistory(securityId: number): { date: string; close: number }[] {
  const stmt = getDb().prepare('SELECT date, close FROM price_history WHERE security_id=? ORDER BY date')
  stmt.bind([securityId])
  const out: { date: string; close: number }[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as { date: string; close: number }
    out.push({ date: r.date, close: r.close })
  }
  stmt.free()
  return out
}
