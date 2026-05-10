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

declare global {
  interface Window {
    api: {
      accounts: {
        list: () => Promise<Account[]>
        create: (a: Omit<Account,'id'>) => Promise<number>
        remove: (id: number) => Promise<void>
      }
      securities: {
        list: () => Promise<Security[]>
        upsert: (s: Omit<Security,'id'>) => Promise<number>
      }
      transactions: {
        list: () => Promise<Transaction[]>
        create: (t: Omit<Transaction,'id'>) => Promise<number>
        createWithSecurity: (p: {
          security: Omit<Security,'id'>
          transaction: Omit<Transaction,'id'|'security_id'>
        }) => Promise<number>
        update: (id: number, t: Omit<Transaction,'id'>) => Promise<void>
        updateWithSecurity: (id: number, p: {
          security: Omit<Security,'id'>
          transaction: Omit<Transaction,'id'|'security_id'>
        }) => Promise<void>
        remove: (id: number) => Promise<void>
      }
      csv: {
        exportFile: () => Promise<{ ok: boolean; path?: string; count?: number; message?: string }>
        importFile: () => Promise<{ ok: boolean; imported?: number; skipped?: number; message?: string }>
      }
      quotes: {
        refreshAll: (market?: 'TW'|'US', opts?: { force?: boolean }) =>
          Promise<{ updated: number; skipped: number; failed: { symbol: string; error: string }[] }>
        latest: () => Promise<[number, number][]>            // [security_id, price][]
        history: (securityId: number) => Promise<{ date: string; close: number }[]>
      }
      fx: {
        refresh: () => Promise<{ ok: boolean; latest?: number; days?: number; message?: string }>
        latest: () => Promise<number | null>
        history: () => Promise<[string, number][]>           // [date, rate][]
      }
      cash: {
        balance: (market: 'TW'|'US') => Promise<number>
        deposit: (args: { account_id: number; market: 'TW'|'US'; amount: number; date: string; note?: string }) => Promise<number>
        withdraw: (args: { account_id: number; market: 'TW'|'US'; amount: number; date: string; note?: string }) => Promise<number>
      }
      backup: {
        exportDb: () => Promise<{ ok: boolean; path?: string; size?: number; message?: string }>
        restoreDb: () => Promise<{ ok: boolean; needsRestart?: boolean; backupPath?: string; message?: string }>
      }
      app: {
        relaunch: () => Promise<void>
      }
    }
  }
}
