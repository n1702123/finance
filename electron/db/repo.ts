import { getDb, saveDb } from './index'

export interface Account { id: number; name: string; market: 'TW'|'US'; currency: 'TWD'|'USD' }
export interface Security { id: number; symbol: string; name: string; market: 'TW'|'US'; currency: 'TWD'|'USD' }
export interface Transaction {
  id: number
  account_id: number
  security_id: number
  type: 'BUY'|'SELL'|'DIVIDEND'|'FEE'|'SPLIT'
  trade_date: string
  quantity: number
  price: number
  fee: number
  tax: number
  fx_rate: number | null
  note: string | null
  reason: string | null
}

function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as never)
  const out: T[] = []
  while (stmt.step()) out.push(stmt.getAsObject() as T)
  stmt.free()
  return out
}

function run(sql: string, params: unknown[] = []): number {
  const db = getDb()
  const stmt = db.prepare(sql)
  stmt.bind(params as never)
  stmt.step()
  stmt.free()
  const idRow = db.exec('SELECT last_insert_rowid() AS id')
  saveDb()
  return Number(idRow[0]?.values[0]?.[0] ?? 0)
}

export const accountsRepo = {
  list: (): Account[] => all<Account>('SELECT id,name,market,currency FROM accounts ORDER BY id'),
  create: (a: Omit<Account,'id'>): number =>
    run('INSERT INTO accounts(name,market,currency) VALUES(?,?,?)', [a.name, a.market, a.currency]),
  remove: (id: number) => { run('DELETE FROM accounts WHERE id=?', [id]) },
}

export const securitiesRepo = {
  list: (): Security[] => all<Security>('SELECT id,symbol,name,market,currency FROM securities ORDER BY market,symbol'),
  upsert: (s: Omit<Security,'id'>): number => {
    const existing = all<{ id: number }>('SELECT id FROM securities WHERE symbol=? AND market=?', [s.symbol, s.market])
    if (existing.length > 0) {
      run('UPDATE securities SET name=?, currency=? WHERE id=?', [s.name, s.currency, existing[0].id])
      return existing[0].id
    }
    return run('INSERT INTO securities(symbol,name,market,currency) VALUES(?,?,?,?)', [s.symbol, s.name, s.market, s.currency])
  },
}

export const transactionsRepo = {
  list: (): Transaction[] => all<Transaction>(
    'SELECT id,account_id,security_id,type,trade_date,quantity,price,fee,tax,fx_rate,note,reason FROM transactions ORDER BY trade_date DESC, id DESC'
  ),
  create: (t: Omit<Transaction,'id'>): number => run(
    `INSERT INTO transactions(account_id,security_id,type,trade_date,quantity,price,fee,tax,fx_rate,note,reason)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [t.account_id, t.security_id, t.type, t.trade_date, t.quantity, t.price, t.fee, t.tax, t.fx_rate, t.note, t.reason]
  ),
  update: (id: number, t: Omit<Transaction,'id'>) => run(
    `UPDATE transactions
       SET account_id=?, security_id=?, type=?, trade_date=?, quantity=?, price=?, fee=?, tax=?, fx_rate=?, note=?, reason=?
     WHERE id=?`,
    [t.account_id, t.security_id, t.type, t.trade_date, t.quantity, t.price, t.fee, t.tax, t.fx_rate, t.note, t.reason, id]
  ),
  remove: (id: number) => { run('DELETE FROM transactions WHERE id=?', [id]) },
}

/** 現金:用保留代號 CASH 存到 securities,存入=BUY,提領=SELL,price=1,quantity=金額 */
export const cashRepo = {
  ensureSecurity(market: 'TW'|'US'): number {
    return securitiesRepo.upsert({
      symbol: 'CASH',
      name: market === 'TW' ? '台幣現金' : '美元現金',
      market,
      currency: market === 'TW' ? 'TWD' : 'USD',
    })
  },
  /** 取得指定市場的現金餘額(累計 BUY − 累計 SELL) */
  balance(market: 'TW'|'US'): number {
    const sid = this.ensureSecurity(market)
    const stmt = getDb().prepare(
      `SELECT COALESCE(SUM(CASE WHEN type='BUY' THEN quantity WHEN type='SELL' THEN -quantity ELSE 0 END), 0) AS b
       FROM transactions WHERE security_id=?`
    )
    stmt.bind([sid])
    let v = 0
    if (stmt.step()) v = Number((stmt.getAsObject() as { b: number }).b ?? 0)
    stmt.free()
    return v
  },
  deposit(args: { account_id: number; market: 'TW'|'US'; amount: number; date: string; note?: string }): number {
    const sid = this.ensureSecurity(args.market)
    return transactionsRepo.create({
      account_id: args.account_id, security_id: sid,
      type: 'BUY', trade_date: args.date,
      quantity: args.amount, price: 1, fee: 0, tax: 0, fx_rate: null,
      note: null, reason: args.note ?? '存入現金',
    })
  },
  withdraw(args: { account_id: number; market: 'TW'|'US'; amount: number; date: string; note?: string }): number {
    const sid = this.ensureSecurity(args.market)
    return transactionsRepo.create({
      account_id: args.account_id, security_id: sid,
      type: 'SELL', trade_date: args.date,
      quantity: args.amount, price: 1, fee: 0, tax: 0, fx_rate: null,
      note: null, reason: args.note ?? '提領現金',
    })
  },
}
