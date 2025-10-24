# Shop Income & Expenses Web App (PHP 8.1 + MySQL)

## Prerequisites
- PHP 8.1
- MySQL (create DB `daily_expenses25`)
- XAMPP with Apache (serve `public/`)

## Install
1. Create database:
   - `CREATE DATABASE daily_expenses25 CHARACTER SET utf8mb4;`
2. Import schema and seeds:
   - `mysql -u root -p"" daily_expenses25 < migrations/001_schema.sql`
   - `mysql -u root -p"" daily_expenses25 < migrations/002_seed_accounts.sql`
3. Seed users (hashes):
   - `php scripts/seed_users.php`
4. Serve:
   - Put project into `c:/xampp/htdocs/rehan`
   - Visit `http://localhost/rehan/`

## API Endpoints
- POST `/api/login` { username, password }
- GET `/api/accounts` (auth)
- POST `/api/accounts` (admin)
- POST `/api/transactions` (auth user/admin)
- GET `/api/reports/day-summary?date=YYYY-MM-DD` (auth)
- GET `/api/reports/ledger?account_id=&from=&to=` (auth)
- GET `/api/reports/commissions?from=&to=` (auth)

## Notes
- DB: host `127.0.0.1`, db `daily_expenses25`, user `root`, password empty. Update in `src/config.php` if needed.
- Sessions use HttpOnly cookies. CSRF tokens available in session if building form UI (`App\\Core\\Security::csrfToken()`).
- Transactions implement double-entry and commission lines; loans receivable flow is scaffolded (table) but not wired yet.
- Role checks enforced on server. Readonly Admin has read-only access.

## Acceptance Test Quickstart
1. Login as `MyUser` / `Pass` via `POST /api/login`.
2. Create 5 MT transactions as per spec.
3. Run `GET /api/reports/day-summary?date=2025-10-19` and verify balances.
