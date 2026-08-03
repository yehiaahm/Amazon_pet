# Factory-reset Amazon Pet / AnimaSys local DB to first-use state.
# Usage (PowerShell):
#   .\scripts\factory-reset.ps1 -MySqlPassword 'YOUR_ROOT_PASSWORD'
#
# Keeps: tenants, branches, employees (login), warehouses, bank_accounts (balance -> 0)
# Clears: products, sales, customers, stock, finance history, services, imports, etc.

param(
  [Parameter(Mandatory = $true)]
  [string]$MySqlPassword,

  [string]$MySqlExe = "C:\projectes\Amazon_pet\desktop\bin\mysql\bin\mysql.exe",
  [int]$Port = 3306,
  [switch]$AlsoRestartBackend
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $MySqlExe)) {
  throw "mysql.exe not found at $MySqlExe"
}

$sql = @"
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE sale_items;
TRUNCATE TABLE sales;
TRUNCATE TABLE pos_sessions;
TRUNCATE TABLE appointments;
TRUNCATE TABLE boarding_reservations;
TRUNCATE TABLE pets;
TRUNCATE TABLE customers;
TRUNCATE TABLE journal_entries;
TRUNCATE TABLE journals;
TRUNCATE TABLE expenses;
TRUNCATE TABLE daily_closings;
TRUNCATE TABLE purchase_invoice_items;
TRUNCATE TABLE purchase_invoices;
TRUNCATE TABLE import_session_items;
TRUNCATE TABLE import_sessions;
TRUNCATE TABLE stock_movements;
TRUNCATE TABLE warehouse_stocks;
TRUNCATE TABLE product_batches;
TRUNCATE TABLE product_variants;
TRUNCATE TABLE products;
TRUNCATE TABLE categories;
TRUNCATE TABLE brands;
TRUNCATE TABLE suppliers;
TRUNCATE TABLE services;
TRUNCATE TABLE audit_logs;
UPDATE bank_accounts SET balance = 0;
SET FOREIGN_KEY_CHECKS = 1;
SELECT 'FACTORY_RESET_OK' AS status;
"@

$env:MYSQL_PWD = $MySqlPassword
try {
  & $MySqlExe -u root --port=$Port --database=animasys_erp -e $sql
  if ($LASTEXITCODE -ne 0) { throw "MySQL factory reset failed (exit $LASTEXITCODE)" }
  Write-Host "Database wiped to first-use state."
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

if ($AlsoRestartBackend) {
  $conn = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
  }
  $backend = "C:\projectes\Amazon_pet\animasys-backend"
  $env:SPRING_DATASOURCE_PASSWORD = $MySqlPassword
  Remove-Item "$backend\boot-out.log","$backend\boot-err.log" -ErrorAction SilentlyContinue
  Start-Process -FilePath "mvn" -ArgumentList @("-DskipTests","spring-boot:run") `
    -WorkingDirectory $backend -WindowStyle Hidden `
    -RedirectStandardOutput "$backend\boot-out.log" `
    -RedirectStandardError "$backend\boot-err.log"
  Write-Host "Backend restart launched. Watch $backend\boot-out.log"
}

Write-Host @"

Also clear browser localStorage (DevTools Console):
  localStorage.removeItem('token');
  localStorage.removeItem('amazon_pet_import_profiles');
  localStorage.removeItem('animasys_import_profiles');
Then hard-refresh and login: owner_marwan / 2026
"@
