import type { Security, Transaction } from '../types'

let _id = 0
export const nextId = () => ++_id

export function security(overrides: Partial<Security> & { symbol: string }): Security {
  return {
    id: nextId(),
    name: overrides.symbol,
    market: 'TW',
    currency: 'TWD',
    ...overrides,
  }
}

export function tx(
  type: Transaction['type'],
  date: string,
  qty: number,
  price: number,
  opts: Partial<Transaction> & { sec_id: number },
): Transaction {
  return {
    id: nextId(),
    account_id: opts.account_id ?? 1,
    security_id: opts.sec_id,
    type,
    trade_date: date,
    quantity: qty,
    price,
    fee: opts.fee ?? 0,
    tax: opts.tax ?? 0,
    fx_rate: opts.fx_rate ?? null,
    note: opts.note ?? null,
    reason: opts.reason ?? null,
  }
}
