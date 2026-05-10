import { useState } from 'react'
import type { Account } from '../../types'
import { Button, Input, Select, Field } from '../ui'

export function CashForm({ market, accounts, balance, ccy, onSaved }: {
  market: 'TW'|'US'
  accounts: Account[]
  balance: number
  ccy: string
  onSaved: () => void
}) {
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (accounts.length === 0) {
    return <p className="text-sm text-slate-500">尚未建立 {market === 'TW' ? '台股' : '美股'} 帳戶,請先到「設定」新增。</p>
  }

  async function submit(action: 'deposit' | 'withdraw') {
    const amt = Number(amount)
    if (!amt || amt <= 0) return alert('請輸入正確金額')
    if (action === 'withdraw' && amt > balance) {
      if (!confirm(`提領金額 (${amt}) 超過目前餘額 (${balance}),確定繼續?`)) return
    }
    setBusy(true)
    try {
      const args = { account_id: accountId, market, amount: amt, date, note: note.trim() || undefined }
      if (action === 'deposit') await window.api.cash.deposit(args)
      else await window.api.cash.withdraw(args)
      setAmount(''); setNote('')
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-5">
      <Field label="帳戶">
        <Select value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field label="日期">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>
      <Field label={`金額 (${ccy})`}>
        <Input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" />
      </Field>
      <Field label="備註">
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="薪資轉入 / 出金匯回 ..." />
      </Field>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => submit('deposit')}>存入</Button>
        <Button variant="ghost" disabled={busy} onClick={() => submit('withdraw')}>提領</Button>
      </div>
    </div>
  )
}
