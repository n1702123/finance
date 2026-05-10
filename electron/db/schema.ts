export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  market     TEXT    NOT NULL CHECK(market IN ('TW','US')),
  currency   TEXT    NOT NULL CHECK(currency IN ('TWD','USD')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS securities (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol   TEXT NOT NULL,
  name     TEXT NOT NULL,
  market   TEXT NOT NULL CHECK(market IN ('TW','US')),
  currency TEXT NOT NULL CHECK(currency IN ('TWD','USD')),
  UNIQUE(symbol, market)
);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  type        TEXT    NOT NULL CHECK(type IN ('BUY','SELL','DIVIDEND','FEE','SPLIT')),
  trade_date  TEXT    NOT NULL,
  quantity    REAL    NOT NULL DEFAULT 0,
  price       REAL    NOT NULL DEFAULT 0,
  fee         REAL    NOT NULL DEFAULT 0,
  tax         REAL    NOT NULL DEFAULT 0,
  fx_rate     REAL,
  note        TEXT,
  reason      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_security_date ON transactions(security_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);

CREATE TABLE IF NOT EXISTS fx_rates (
  date     TEXT NOT NULL,
  from_ccy TEXT NOT NULL,
  to_ccy   TEXT NOT NULL,
  rate     REAL NOT NULL,
  PRIMARY KEY (date, from_ccy, to_ccy)
);

CREATE TABLE IF NOT EXISTS price_history (
  security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  close       REAL    NOT NULL,
  PRIMARY KEY (security_id, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`
