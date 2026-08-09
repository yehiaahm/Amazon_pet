# Amazon Pet ERP — Full Engineering Audit
**Date:** 2026-08-07 · **Branch audited:** `production-hardening` · **Scope:** full monorepo (`animasys-backend/` + `src/`)
**Method:** static read-through of source (no execution/testing performed). Every claim below is traced to a file and line number. Nothing in this report was guessed or inferred beyond what the code shows.

---

## 1. Project Overview

**Purpose.** Amazon Pet is a single-tenant-per-deployment (schema supports multi-tenant) ERP for a pet-retail/grooming/boarding business: point-of-sale, inventory with FIFO costing, purchase-invoice intake (including AI-assisted OCR), finance/accounting, CRM, boarding reservations, grooming appointments, employee/RBAC administration, and an AI business-advisor chat. UI is Arabic-first.

**Main business domains** (mirrored 1:1 between backend `modules/` and frontend `src/modules/`):
- **Sales / POS** — cart, checkout, refunds, shift/session open-close, idempotent checkout
- **Inventory** — products/variants, FIFO/FEFO batch costing, purchase invoices (OCR), bulk import, barcode generation/printing, warehouses
- **Finance** — expenses, daily cash-drawer closing, general ledger (double-entry), accounts payable/installments
- **IAM** — tenants, branches, employees, roles, DB-backed RBAC permissions
- **CRM** — customers, pets, loyalty/ban/discount
- **Boarding** — pet-hotel reservations
- **Services** — grooming service catalog + appointments
- **AI** — Gemini-backed insights/chat and invoice-OCR parsing
- **Analytics** — KPI engine, business-rule alerts (low stock, expiring batches), dashboards

**Architecture style.** A layered modular monolith:
- **Backend:** Spring Boot 3.3.4 / Java 17, package-by-feature (`core/` cross-cutting + `modules/<domain>/{controller,service,repository,domain,dto}`), REST + JSON, stateless JWT auth, Flyway-versioned MySQL schema (H2 fallback for local dev), Spring Application Events for post-commit ledger posting.
- **Frontend:** React 18 + TypeScript (strict) SPA built with Vite, Zustand for client state, TanStack Query for server state, **no router** — module switching is a Zustand-driven `switch` in [App.tsx](src/App.tsx).
- **Packaging:** the Vite build outputs directly into `animasys-backend/src/main/resources/static` ([vite.config.ts](vite.config.ts)), so the SPA is served by the same Spring Boot jar; an Electron wrapper (`desktop/`) packages that jar + a bundled JRE + MySQL into a Windows installer for offline/on-prem use.

This is a genuinely substantial system (276 backend Java files, 78 frontend TS/TSX files, 36 Flyway migrations, 47 final DB tables) with real domain complexity (FIFO costing, double-entry ledger, OCR-assisted data entry) — not a toy CRUD app. The architecture's bones are reasonable; the issues found below are mostly about **incomplete hardening**, not a wrong architecture.

---

## 2. Frontend

### Structure & "Routing"
There is **no react-router** (confirmed absent from [package.json](package.json)). Navigation is a Zustand field: `useUIStore.activeModule` is switched on in [App.tsx:67-106](src/App.tsx:67), set via `setActiveModule()` calls scattered through the sidebar, POS quick-nav, and command palette. Consequences:
- **No deep-linking, no bookmarkable URLs, no browser back/forward support** — the URL bar never changes.
- **Refresh loses all navigation state and forces a fresh login.** `isAuthenticated`/`currentEmployee` live only in the non-persisted `uiStore`, while the JWT survives in `localStorage` — there is no "rehydrate session from stored token" bootstrap, so every F5 drops the user back to `<Login/>` even though a valid token exists.
- Theme preference is also lost on refresh (`uiStore.ts:59`, not persisted).

### State Management
Four Zustand stores: `uiStore` (nav/session/notifications/theme), `sessionStore` (POS shift state, hand-rolled async fetch instead of react-query), `cartStore` (POS cart + pricing rules), `permissionStore` (permission code set). The `sessionStore`/`permissionStore` pattern duplicates server state that react-query already owns elsewhere — a state-boundary inconsistency, not a hard bug.

The JWT is stored in `localStorage` ([endpoints.ts:132](src/core/api/endpoints.ts:132), [Login.tsx:38](src/components/ui/Login.tsx:38)) — readable by any XSS, with no `httpOnly` cookie boundary.

### Reusable Components & Design System
`src/components/ui/` has a real, consistent core (`Button`, `Input`, `Select`, `Card`, `StatCard`, `Badge`, `PageHeader`) built on genuine CSS-variable design tokens (`src/styles/tokens/*`: colors incl. dark mode via `data-theme`, spacing, typography, radius, shadow, motion). `Modal.tsx` and `Drawer.tsx` are near-duplicate hand-rolled implementations that should share one primitive, and neither has `role="dialog"`, `aria-modal`, Escape-to-close, or focus trapping. `DataTable.tsx` and `CommandPalette.tsx` are functionally strong (search/sort/filter/export/pagination; keyboard palette) but are **entirely in English** in an otherwise Arabic-only app, and `index.html:2` declares `lang="en"`.

**RTL is applied ad hoc**, not systemically: no `dir="rtl"` anywhere on `<html>`/`<body>`; instead 27 individual inline `style={{direction:'rtl'}}` occurrences across 12 files. Any component that forgets it renders Arabic text LTR by default.

### Weaknesses (frontend architecture)
- Fail-open module permission gating: `canAccessModule()` returns `true` for any module id not registered in `MODULE_PERMISSIONS` ([usePermissions.ts:13](src/core/permissions/usePermissions.ts:13), [navigationUtils.ts:29](src/core/permissions/navigationUtils.ts:29), confirmed by [navigationUtils.test.ts:19-21](src/core/permissions/__tests__/navigationUtils.test.ts:19)) — a deny-by-default pattern would be safer as the module list grows.
- Only 3 of 17 `components/ui` files have unit tests, and they test permission-gating logic, not the visual/interactive primitives (Button variants, DataTable sort/paginate, Modal open/close, toast auto-dismiss).
- `core/api/backendUrl.ts:20` hardcodes a `localhost:8080` fallback (documented as required for Electron packaging — a deliberate default, not an oversight).

---

## 3. Backend

### Layers
Standard Spring layering per module: `controller → service → repository → domain(JPA entity)`, plus `dto/` for request/response shapes. Cross-cutting concerns live in `core/`: `security/` (JWT, RBAC filter chain), `config/`, `exception/` (`GlobalExceptionHandler`), `response/` (`ApiResponseWrapper`), `audit/`, `admin/` (factory reset).

### Controllers / API surface
24 controllers, ~130 endpoint methods, consistently RESTful (`GET/POST/PUT/DELETE /v1/<resource>`). See §6 (API Review) for validation/consistency findings.

### Services (notable design strengths)
- `GeneralLedgerService` and `FifoCostingServiceImpl` use `BigDecimal` throughout with pessimistic row locking (`findActiveBatchesForUpdate*`) — correct practice for financial/inventory math, in contrast to the frontend's plain-float arithmetic (§9).
- Two-layer authorization is applied consistently: a centralized `PermissionEnforcementFilter` (backed by a hand-maintained `EndpointPermissionRegistry`) plus `@PreAuthorize("@authz.has('...')")` on essentially every controller method — verified endpoint-by-endpoint by the audit agent, with no gaps found in the modules reviewed.
- Sale completion/refund use `@TransactionalEventListener(AFTER_COMMIT)` to defer ledger posting until the sale itself is safely committed — a sound event-sourcing-adjacent pattern, undermined somewhat by inconsistent async/logging treatment (§9, §11).

### Repositories & Dependency Graph
```
sales      -> inventory (FIFO deduction/return/adjustment, stock lookups)
sales      -> finance   (post-commit journal posting via events)
sales      -> crm       (banned-customer check, loyalty discount)
sales      -> services  (service-line pricing)
sales      -> iam       (employee/branch, manager-override re-auth)
inventory  -> iam       (tenant/employee resolution)
inventory  -> finance   (creates AP installment on invoice import)
finance    -> inventory (AP dashboard reads PurchaseInvoiceRepository — a reverse dependency on the same pair above: a mild two-way coupling)
finance    -> iam
crm        -> iam       (no outbound dependency into inventory/sales/finance)
services   -> iam       (sales calls INTO services, not vice versa)
analytics  -> inventory, finance, sales (aggregation only)
ai         -> analytics, inventory (context-building only)
```
`inventory` ↔ `finance` is the one bidirectional coupling in an otherwise clean, acyclic dependency graph.

---

## 4. Database

Full ERD, constraint, and index detail is in the companion findings; this section summarizes the load-bearing facts.

**Scale:** 36 Flyway migrations (V1–V36), 47 final tables, MySQL (Flyway-owned schema; `spring.jpa.hibernate.ddl-auto: none` — Hibernate never validates entities against the live schema at boot, so mismatches fail silently at runtime rather than at startup).

**ERD highlights:** `tenants → branches → {warehouses, employees, pos_sessions→sales, expenses, daily_closings}` is the backbone; `products —(1:1!)— product_variants` (see below); `sales → sale_items → sale_item_batch_allocations → inventory_batches`; `purchase_invoices → purchase_invoice_items / purchase_invoice_installments`; `roles ↔ permissions` via `role_permissions`.

**Structural design issues:**
- **`product_variants` is enforced 1:1 with `products`** via `uk_product_variants_product UNIQUE(product_id)` ([V18__Catalog_Sku_Unique_Constraints.sql:52-59](animasys-backend/src/main/resources/db/migration/V18__Catalog_Sku_Unique_Constraints.sql)), contradicting the original schema's own comment (`V1__Schema_Init.sql:63`, `-- e.g. "10kg Bag", "2kg Bag"`) implying multi-variant products were intended. A product line that legitimately needs two sizes/SKUs cannot be modeled today.
- **Schema truth is split between Flyway and unversioned Java DDL.** `V16` and `V17` are stub no-op migrations (`SELECT 1;`); their real `ALTER TABLE` work is executed at boot by [`CatalogMigrationLifecycle.ensureFutureColumnsForJpaCompatibility()`](animasys-backend/src/main/java/com/animasys/core/config/CatalogMigrationLifecycle.java:111), guarded by try/catch-and-swallow on "already exists" errors, and only triggered when Flyway's recorded version is exactly 17. Fresh installs and desktop-upgrade installs can therefore take two structurally different code paths to reach the same nominal schema — a reproducibility hazard. The same class also calls `flyway.repair()` automatically on any checksum-validation failure ([`CatalogMigrationLifecycle.java:72-85`](animasys-backend/src/main/java/com/animasys/core/config/CatalogMigrationLifecycle.java:72)), which defeats Flyway's drift-detection safety net.
- **No CHECK constraints anywhere in the schema.** Every money/quantity column (`price`, `cost`, `amount`, `quantity`, `balance`, etc.) and every "enum-like" status column (`sales.status`, `purchase_invoices.status`, `inventory_batches.status`, etc.) is unconstrained free-text/unsigned-unchecked at the DB level; correctness relies entirely on application code remembering to validate (§12 shows several places it doesn't).
- **P0 runtime bug — confirmed independently, not just by the research agent:** [`DailyClosing.java:54-67`](animasys-backend/src/main/java/com/animasys/modules/finance/domain/DailyClosing.java:54) maps `cash_sales_total`, `card_sales_total`, `instapay_sales_total`, `vodafone_sales_total`, `total_sales` as `@Column`s, and [`POSSessionService.java`](animasys-backend/src/main/java/com/animasys/modules/sales/service/POSSessionService.java) actively populates and saves them when a shift is closed. **None of these five columns are created by any of the 36 migrations**, and `ddl-auto: none` means Hibernate won't catch this at startup — closing a POS shift against a schema built purely from the migrations in this repo will throw an "Unknown column" SQL error. See §13 item 1.
- **Multi-tenancy gaps at the schema level:** `sales` and `purchase_invoices` have **no `tenant_id` column at all** (tenant reachable only via 1–2 FK hops, and for `purchase_invoices` only via a *nullable* `supplier_id`); `employees.username`/`email` and `sales.sale_number` are globally unique instead of tenant-scoped; `barcode_sequences`/`tenant_barcode_settings` use `tenant_id` as PK with **no FK** to `tenants`; `idempotency_keys.tenant_id` has no FK either.
- **Missing indexes** on columns that clearly need them by analogy with siblings that already got one: `purchase_invoices.status/payment_status/supplier_id/dates` (unlike `sales`, indexed in V30), `audit_logs (entity,id)`/`timestamp` (unlike the newer `ai_request_logs`, indexed in V29), `appointments.date_time`, `boarding_reservations` date range, `stock_movements`.
- **Dead schema surface:** `stock_transfers`/`stock_transfer_items` (V10) have a complete table design but **zero JPA entity/service/repository code** anywhere in the backend — a fully designed feature that was never wired up (or was removed from the app layer without a matching migration).
- **Dates stored as `VARCHAR`, not `DATE`:** `purchase_invoices.invoice_date`/`due_date`, `purchase_invoice_installments.due_date` — breaks native date sort/range filtering, likely a workaround for inconsistent OCR-extracted date formats that was never normalized.

---

## 5. Authentication & Authorization

**Authentication:** username/password login and a 4–8 char "PIN login" both go through the same BCrypt-backed `DaoAuthenticationProvider` ([SecurityConfig.java:106-124](animasys-backend/src/main/java/com/animasys/core/security/SecurityConfig.java:106)). JWT (HS256) carries only `sub`/`iat`/`exp` — no roles/tenant claims, so `JwtAuthenticationFilter` re-loads the user (and their current permissions) from the DB on **every request**, which is good for permission freshness but has two consequences worth flagging:
- **No `isEnabled()`/`isAccountNonLocked()` check on JWT-authenticated requests** ([JwtAuthenticationFilter.java:48-56](animasys-backend/src/main/java/com/animasys/core/security/JwtAuthenticationFilter.java:48)) — deactivating an employee does not revoke their already-issued token; it remains usable until natural expiry.
- **No logout/refresh/revocation endpoint exists anywhere in the codebase.** `app.jwt.expiration-ms: 86400000` (24h) is the only bound on a leaked token's life.

**PIN login brute-force exposure:** a 4-digit PIN, BCrypt-checked in a loop over every employee for the resolved tenant ([AuthController.java:73-82](animasys-backend/src/main/java/com/animasys/modules/auth/AuthController.java:73)), with **no rate limiting or lockout anywhere in the codebase** (confirmed absent by search — no Bucket4j, no custom throttle filter). 10,000 possible PINs with no lockout is a real brute-force path.

**Critical — default credentials seeded into production.** [`DatabaseSeeder.java:46-48,69-92`](animasys-backend/src/main/java/com/animasys/core/config/DatabaseSeeder.java:46) unconditionally creates OWNER/CASHIER/GROOMER accounts with PIN `"2026"` whenever the `employees` table is empty — **not gated behind a dev/demo profile flag**, so it runs identically in production. The PINs are then logged in plaintext ([`DatabaseSeeder.java:190-191`](animasys-backend/src/main/java/com/animasys/modules/core/config/DatabaseSeeder.java:190)). Any fresh production deployment ships with a predictable, publicly-documented-in-logs owner PIN.

**Authorization (RBAC):** DB-backed, tenant-scoped roles/permissions, consistently double-enforced (filter registry + `@PreAuthorize`) as noted in §3. The registry itself is a hand-maintained map ([EndpointPermissionRegistry.java](animasys-backend/src/main/java/com/animasys/core/security/EndpointPermissionRegistry.java)) — an endpoint missing from it falls through to whatever `@PreAuthorize` alone provides, which was found consistently present but is a manual-sync risk.

**Multi-tenancy enforcement is manual, not structural** — no Hibernate tenant filter or AOP interceptor; every query must remember to filter by `tenantId`. `SecurityUtils.requireTenantId()`/`requireBranchId()` **silently swallow all exceptions and fall back to a hardcoded `"t-1"`/`"b-1"`** instead of denying ([SecurityUtils.java:37-55](animasys-backend/src/main/java/com/animasys/core/security/SecurityUtils.java:37)) — currently harmless only because the app is architected single-tenant-per-deployment, but it is a fail-open pattern that would silently misroute data in a true multi-tenant deployment.

**Security headers/session:** CSRF correctly disabled for stateless JWT, `SessionCreationPolicy.STATELESS`, sensible CSP/`X-Frame-Options: DENY`/`nosniff`/Referrer-Policy ([SecurityConfig.java:48-57](animasys-backend/src/main/java/com/animasys/core/security/SecurityConfig.java:48)), CORS origin allow-list configurable via env with safe localhost defaults. No explicit HSTS configuration was found (not necessarily absent — Spring's defaults weren't independently verified).

**Password policy** is 4–128 characters with no complexity requirement, and it's the *same* policy for real account passwords and 4-digit PINs ([EmployeeController.java:168-175](animasys-backend/src/main/java/com/animasys/modules/iam/controller/EmployeeController.java:168)).

**Audit trail is minimal.** `AuditLog` is written from exactly one place in the whole codebase: `SaleService` (checkout + refund). Employee/role changes, inventory adjustments, expenses, and the factory-reset action itself write no audit record. Factory reset additionally **deletes the tenant's own `audit_logs`** as part of the wipe ([FactoryResetService.java:196-201](animasys-backend/src/main/java/com/animasys/core/admin/FactoryResetService.java:196)) with no record created beforehand — a self-erasing superuser action.

---

## 6. API Review

- Consistent envelope (`ApiResponseWrapper`) and centralized error mapping (`GlobalExceptionHandler`) with no internal-detail leakage on auth failures (generic 401/403 messages, no user-enumeration via error text).
- **Validation is inconsistent across controllers.** Several endpoints bind JPA entities or loosely-typed DTOs directly as `@RequestBody` with **no `@Valid` and no bean-validation constraints**: `PurchaseInvoiceController.createInvoice` ([:22-33](animasys-backend/src/main/java/com/animasys/modules/inventory/controller/PurchaseInvoiceController.java:22)), `ExpenseController.createExpense` ([:41](animasys-backend/src/main/java/com/animasys/modules/finance/controller/ExpenseController.java:41)), `DailyClosingController` ([:42](animasys-backend/src/main/java/com/animasys/modules/finance/controller/DailyClosingController.java:42)), `SupplierController` ([:32,51](animasys-backend/src/main/java/com/animasys/modules/inventory/controller/SupplierController.java:32)), `PetController` ([:37,48](animasys-backend/src/main/java/com/animasys/modules/crm/controller/PetController.java:37)). `CreateProductRequest` is a `Map<String,Object>`-backed DTO with no annotations at all and silently defaults price/cost to `0` on malformed input rather than rejecting the request.
- `InventoryController.printPdf` is missing `@Valid` on its list body while the near-identical `printZpl` has it ([:439-464](animasys-backend/src/main/java/com/animasys/modules/inventory/controller/InventoryController.java:439)) — an inconsistency, not a single design choice.
- `AccountsPayableController`'s three write endpoints (`setInstallments`, `payInstallment`, `updateSettings`) are gated by `finance.view_reports` — a **read** permission — rather than a write/manage permission ([AccountsPayableController.java:40-76](animasys-backend/src/main/java/com/animasys/modules/finance/controller/AccountsPayableController.java:40)). Anyone who can view financial reports can also record supplier payments.
- `AskRequest.query` (AI chat) has `@NotBlank` but no `@Size` cap before being embedded in an LLM prompt — see §7 security.

---

## 7. Security Audit

Findings consolidated and de-duplicated across the security/core and business-module reviews, ranked by severity.

### Critical
1. **Default PIN `"2026"` seeded unconditionally in every environment including production, and logged in plaintext.** [DatabaseSeeder.java:46-48,190-191](animasys-backend/src/main/java/com/animasys/core/config/DatabaseSeeder.java:46). Highest-priority fix in this entire audit.
2. **Cross-tenant read/write in Daily Closings.** `DailyClosingController`/`DailyClosingService` accept a client-supplied `branchId` with **zero validation that it belongs to the caller's tenant** ([DailyClosingController.java:25-53](animasys-backend/src/main/java/com/animasys/modules/finance/controller/DailyClosingController.java:25), [DailyClosingService.java:28-62](animasys-backend/src/main/java/com/animasys/modules/finance/service/DailyClosingService.java:28)) — another tenant's cash-closing history can be read, or a closing record written into another tenant's branch and attributed to an arbitrary employee id.
3. **Tenant-isolation bypass in the import engine.** `ImportService.requireSessionForTenant` explicitly skips its own ownership check when the resolved tenant id equals the hardcoded string `"t-1"` ([ImportService.java:278-290](animasys-backend/src/main/java/com/animasys/modules/inventory/service/ImportService.java:278)) — `"t-1"` is exactly the id every first-run-setup tenant gets, so any such tenant can undo/delete any other tenant's import session. `finalizeSession` has **no tenant check of any kind** ([ImportService.java:146-159](animasys-backend/src/main/java/com/animasys/modules/inventory/service/ImportService.java:146)).
4. **No rate limiting or lockout anywhere in the backend**, combined with a 4-digit PIN login scheme checked in a per-tenant employee loop — a practical brute-force path against `/auth/pin-login`.
5. **JWTs cannot be revoked.** No logout endpoint, no blacklist, no re-check of `employee.active` on subsequent requests — a stolen token or a just-deactivated employee's token both remain valid for up to 24h. Combined with storing the token in `localStorage` (XSS-readable, no `httpOnly` boundary) on the frontend, this is a meaningful session-security gap for a financial ERP.

### High
6. **Multiple `findById` calls resolve client-influenced foreign entities with no tenant filter:** supplier linking on purchase-invoice creation ([PurchaseInvoiceService.java:258-261](animasys-backend/src/main/java/com/animasys/modules/inventory/service/PurchaseInvoiceService.java:258)), category linking on product create/update ([ProductService.java:211,368-370,452](animasys-backend/src/main/java/com/animasys/modules/inventory/service/ProductService.java:211)) — a caller can attach another tenant's supplier/category record to their own data.
7. **Global (non-tenant-scoped) duplicate-invoice detection.** `PurchaseInvoiceRepository.findByFingerprint` has no tenant filter ([PurchaseInvoiceRepository.java:12](animasys-backend/src/main/java/com/animasys/modules/inventory/repository/PurchaseInvoiceRepository.java:12)) — two unrelated tenants with a coincidentally identical invoice fingerprint collide.
8. **AI prompt-injection surface.** Raw user chat input is concatenated directly into the LLM prompt with only a length-truncating "sanitizer" (`AiClientContextSanitizer` — despite its name, it does not filter injection patterns) and no structural validation on the response ([PromptBuilder.java:34-42](animasys-backend/src/main/java/com/animasys/modules/ai/engine/PromptBuilder.java:34), [AiClientContextSanitizer.java:10-26](animasys-backend/src/main/java/com/animasys/modules/ai/context/AiClientContextSanitizer.java:10)); `AskRequest.query` also has no upper length bound, allowing arbitrarily large (cost-incurring) requests to the paid provider.
9. **`FactoryResetService` is not transactional** and can leave a tenant's data in a partially-wiped, inconsistent state on failure; it also deletes the tenant's own `audit_logs` as part of the same operation with no prior audit record of the reset itself ([FactoryResetService.java:196-226](animasys-backend/src/main/java/com/animasys/core/admin/FactoryResetService.java:196)).
10. **`SecurityUtils.requireTenantId()`/`requireBranchId()` fail open**, defaulting to `"t-1"`/`"b-1"` on any internal exception instead of denying the request ([SecurityUtils.java:37-55](animasys-backend/src/main/java/com/animasys/core/security/SecurityUtils.java:37)).

### Medium
11. Accounts-payable write endpoints gated by a read permission (§6).
12. Password policy has no complexity requirement and is shared between real passwords and PINs (§5).
13. Frontend fail-open module permission gating for unregistered module ids (§2).
14. `CatalogMigrationLifecycle`'s auto `flyway.repair()`-on-failure defeats Flyway's checksum drift protection (§4/§8).

---

## 8. Performance Audit

- **Database:** several tables lack indexes their siblings already received reactively (`purchase_invoices` filter/sort columns, `audit_logs`, `appointments.date_time`, `boarding_reservations` date range, `stock_movements`) — see §4. The pattern of V30/V31 ("pagination"/"dashboard analytics" indexes arriving at migration #30-31 of 36) indicates these were retrofitted after production performance problems, not designed upfront.
- **Frontend analytics correctness/perf bug:** `Reports.tsx:66`, `Dashboard.tsx:143`, `CRM.tsx:78`, `AIAdvisor.tsx:26` all call `useSales({ page: 0, size: 100, ... })` — every trend/margin/loyalty/best-seller calculation in Reports, Dashboard, CRM, and the AI advisor silently operates on **only the most recent 100 sales**, with no UI indication of truncation. `Finance.tsx:53` correctly fetches `size: 5000` for the equivalent master-ledger view — the other four modules were not given the same treatment. This will produce visibly wrong numbers for any shop doing more than ~100 sales in a selected reporting period.
- **No debounce on `InvoiceReview.tsx`'s search box** ([:613-624](src/modules/invoices/InvoiceReview.tsx:613)) — every keystroke fires a new server query, unlike POS's own search which correctly debounces via `useDebouncedValue` (280ms).
- **Deprecated `useProducts()`/`useVariants()` hooks each independently re-fetch a 5000-row catalog** ([endpoints.ts:230,236](src/core/api/endpoints.ts:230)) — if both are used alongside `useCatalog()` on the same screen, that's 2-3 duplicate full-catalog HTTP round trips (react-query caches by key, but the three hooks use different keys so none of them share a cache entry).
- **React-query invalidation is broad rather than surgical** — every mutation invalidates whole query-key families with no optimistic updates anywhere in `useERPData.ts`, meaning users see stale UI until refetches resolve. Reasonable safety trade-off, but worth noting as UX latency.
- **`@Async` refund-ledger posting has no bounded executor.** `@EnableAsync` is present but no `TaskExecutor` bean is configured, so Spring defaults to `SimpleAsyncTaskExecutor` — an unbounded new-thread-per-refund with no queueing/backpressure ([SaleRefundedListener.java:33-35](animasys-backend/src/main/java/com/animasys/modules/sales/listeners/SaleRefundedListener.java:33)) — a resource-exhaustion risk under a burst of refunds.
- **Large unbounded DML embedded directly in Flyway migrations** — e.g. V12's full-table `INSERT...SELECT` copy from `product_batches` to `inventory_batches`, V26/V9's full-table installment/warehouse-stock backfills — no chunking, which risks long table locks on a production-sized database.

---

## 9. Code Quality

**Strengths:** TypeScript `strict: true` plus `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` ([tsconfig.json:18-21](tsconfig.json:18)); `tsc && vite build` gates every production build on type-checking; backend finance/inventory-costing code consistently uses `BigDecimal`; Zustand selector usage avoids prop drilling almost everywhere; no stray `console.log`/TODO/FIXME comments were found in either codebase (a genuinely clean signal); the two-layer authorization pattern is applied with real discipline across ~130 endpoints.

**Weaknesses:**
- **Frontend money math is plain floating-point, not decimal-safe**, patched with `.toFixed(2)` roundtrips ([cartStore.ts:201-221](src/core/stores/cartStore.ts:201), [saleFinance.ts](src/core/utils/saleFinance.ts), [Finance.tsx:139-176](src/modules/finance/Finance.tsx:139), [Reports.tsx:196-240](src/modules/reports/Reports.tsx:196)) — a real (if usually small) correctness risk for a POS applying multiple stacked percentage discounts, in contrast to the backend's correct `BigDecimal` usage for the same domain.
- **`GlobalExceptionHandler` uses fragile substring matching** on raw DB error messages to choose which Arabic error text to show ([GlobalExceptionHandler.java:156-171](animasys-backend/src/main/java/com/animasys/core/exception/GlobalExceptionHandler.java:156)), and globally catches `NullPointerException` into a generic 400 ([:185-191](animasys-backend/src/main/java/com/animasys/core/exception/GlobalExceptionHandler.java:185)) — this masks real server-side bugs as if they were client input errors, making them invisible to API-level error monitoring.
- **`Modal`/`Drawer` duplication** instead of a shared overlay primitive (§2).
- **Ad hoc error handling instead of the shared reporter:** `errorReporting.ts`'s secret-redacting `reportClientError` is wired up only at the app-shell level; no file under `src/modules/**` uses it — every module hand-rolls its own `alert(err.message)` pattern instead.

---

## 10. Technical Debt

1. **Schema truth split between Flyway and unversioned Java DDL** (`CatalogMigrationLifecycle`), plus an auto-`flyway.repair()`-on-failure — the single largest structural debt item; see §4/§7.
2. **Multiple historical inventory-tracking mechanisms left coexisting.** `stock_movements` (V1) appears superseded by `inventory_ledger_transactions`/`warehouse_stocks` (V9-V10) but was never dropped or documented as deprecated; `product_batches` overlapped with the new `inventory_batches` FIFO engine for 5 migrations (V10→V15) before being dropped.
3. **`stock_transfers`/`stock_transfer_items` schema exists with zero application code** — a fully designed, never-implemented (or implemented-then-abandoned) feature (§4).
4. **`TransferService.transferStock` unconditionally throws**, yet its controller endpoint and request DTO remain fully live and documented as if functional ([TransferService.java:13-16](animasys-backend/src/main/java/com/animasys/modules/inventory/service/TransferService.java:13), [InventoryController.java:258-270](animasys-backend/src/main/java/com/animasys/modules/inventory/controller/InventoryController.java:258)) — and on the frontend, `Inventory.tsx`'s own Transfer Stock modal is fully built but has no button that ever opens it ([Inventory.tsx:86,571-619](src/modules/inventory/Inventory.tsx:86)). The feature is broken/disabled on both ends independently, with no consistency between them.
5. **~130 lines of dead, superseded per-row import logic retained in `ImportService`** alongside the `SingleItemImportProcessor` class that actually replaced it ([ImportService.java:301-430](animasys-backend/src/main/java/com/animasys/modules/inventory/service/ImportService.java:301)) — a future bugfix applied to only one copy would silently not apply to the other if a caller were ever rewired.
6. **~12,000 lines of stray dead files tracked in git at the repo root** (`beautified_inventory.js`, `edited_inventory.tsx`, `extracted_inventory_utf8.js`, `original_inventory.tsx`, `reconstructed_inventory.tsx`) plus `src/modules/inventory/Inventory.tsx.backup` — confirmed unreferenced anywhere in `src/`, left over from a refactor/recovery exercise (all six share July-14 timestamps within a 30-minute span).
7. **VARCHAR primary-key length inconsistency** (36 vs 50 vs 100 vs 255 across different migrations) and **dates stored as VARCHAR instead of DATE** on purchase-invoice tables — signals no shared migration template/convention was enforced project-wide.
8. **No systemic RTL support** for an Arabic-first product; RTL is a per-component opt-in via inline styles rather than a global `dir="rtl"`.

---

## 11. Bugs Discovered

Ranked by severity; each is independently traceable to the cited file/line.

**Critical / P0**
1. **`DailyClosing` entity references 5 DB columns that no migration creates** — closing a POS shift will fail at runtime against a schema built from this repo's migrations. Confirmed independently (§4).
2. **Cross-tenant read/write via `DailyClosingController`/`Service`** — no tenant validation of client-supplied `branchId` (§7 #2).
3. **`ImportService` tenant-isolation bypass** (`"t-1"` special-case + `finalizeSession` with no check at all) (§7 #3).
4. **Reports/Dashboard/CRM/AI Advisor silently analyze only the last 100 sales**, producing wrong revenue/margin/loyalty figures for any shop with higher sales volume in the selected period, with no truncation warning shown to the user (§8).

**High**
5. **`IdempotentCheckoutService`'s "FAILED" state is unreachable.** The entire method — including the catch-block's `UPDATE ... SET status='FAILED'` — runs inside one `REQUIRES_NEW` transaction; when `createSale` throws, Spring rolls back the whole transaction on re-throw, undoing the "mark FAILED" write along with everything else ([IdempotentCheckoutService.java:54-93](animasys-backend/src/main/java/com/animasys/modules/sales/service/IdempotentCheckoutService.java:54)). The idempotency-failure audit trail this code exists to create never actually persists.
6. **`POSSessionService` falls back to an arbitrary branch from the entire database** (`branchRepository.findAll().stream().findFirst()`) when both the session's and employee's branch are null ([POSSessionService.java:88-95](animasys-backend/src/main/java/com/animasys/modules/sales/service/POSSessionService.java:88)) — can attach a `DailyClosing` to a different tenant's branch if that code path is ever reached.
7. **`GroomingServiceController.seedDefaults` uses hardcoded, non-tenant-namespaced ids (`svc-1`..`svc-10`)** — silently a no-op for every tenant after the first that calls it ([GroomingServiceController.java:103-131](animasys-backend/src/main/java/com/animasys/modules/services/controller/GroomingServiceController.java:103)).
8. **`RoleBootstrapService` can skip creating the OWNER role.** Its early-return guard (`existingRoleCount >= 4`) assumes 4+ existing roles means the 4 system roles already exist; a tenant with 4+ *custom* roles created first never gets OWNER/MANAGER/CASHIER/GROOMER seeded ([RoleBootstrapService.java:40](animasys-backend/src/main/java/com/animasys/modules/iam/service/RoleBootstrapService.java:40)).
9. **`productMatcher.ts`'s "barcode match" step checks the wrong field** — it compares OCR-extracted barcodes against `Product.sku`, never against `ProductVariant.barcode` (the actual physical-barcode field), even though `variants` is passed in specifically for this purpose ([productMatcher.ts:112-127](src/core/utils/productMatcher.ts:112)) — undermines barcode-based invoice-line matching.
10. **`catalogDedupe.ts` is applied unconditionally to the POS barcode-scan catalog, not just the display grid.** Two genuinely different products that happen to compute the same display name are silently merged, and the losing product's own barcode becomes unscannable at the register ([catalogDedupe.ts:44-55](src/core/pos/catalogDedupe.ts:44), applied in [buildPosCatalog.ts:66,107](src/core/pos/buildPosCatalog.ts:66)).
11. **`Expense` creation has no positive-amount validation, and a failure to post its ledger entry is silently swallowed** — the `Expense` row persists with no corresponding journal entry, and the only trace is a log line ([ExpenseService.java:34-85](animasys-backend/src/main/java/com/animasys/modules/finance/service/ExpenseService.java:34)).
12. **Accounts-payable write endpoints gated by a view-only permission** (§6/§7 #11).

**Medium**
13. Hardcoded placeholder data reachable in production output: a fake fallback pet-owner name `'سارة أحمد'` ([Pets.tsx:20](src/modules/pets/Pets.tsx:20)), a hardcoded fake 3-person `STAFF_LIST` used as a real fallback in the appointments table ([Services.tsx:27-31](src/modules/services/Services.tsx:27)), and a hardcoded owner name baked into the printable P&L statement ([Reports.tsx:1097](src/modules/reports/Reports.tsx:1097)).
14. `Finance.tsx`'s expense form silently no-ops on invalid input (negative amount / empty category) with no user-facing error, unlike every other form in the codebase ([Finance.tsx:178-203](src/modules/finance/Finance.tsx:178)).
15. `Inventory.tsx`'s manual stock-adjustment modal accepts a `diff` of 0 silently and has no negative-stock guard, inconsistent with `handleTransferStock` in the very same file which does validate ([Inventory.tsx:245-303](src/modules/inventory/Inventory.tsx:245)).
16. No overlap/double-booking validation for boarding reservations (same room, overlapping dates) or grooming appointments (same groomer, same time) ([BoardingReservationService.java:29-70](animasys-backend/src/main/java/com/animasys/modules/crm/service/BoardingReservationService.java:29), [AppointmentController.java:44-72](animasys-backend/src/main/java/com/animasys/modules/services/controller/AppointmentController.java:44)).
17. Negative price/cost accepted through manual purchase-invoice entry, the OCR review screen, and bulk CSV import (the number-parsing regex explicitly preserves the `-` sign) — none of these paths hard-block negative values, only soft-warn on cost>price ([PurchaseInvoicePanel.tsx:492-502](src/modules/inventory/PurchaseInvoicePanel.tsx:492), [importMapping.ts:117](src/modules/inventory/importMapping.ts:117)).
18. Employee passwords accept any single character ≥4 chars with no complexity check, mirrored on the backend (§5).

**Low**
19. `saleFinance.ts:98-103` — a dead `if` branch identical to its own fallback.
20. Printed invoice "QR code" is a decorative deterministic pattern generator, not a real scannable QR ([amazonPetInvoice.ts:84-85](src/core/pos/amazonPetInvoice.ts:84)) — a product-facing correctness issue if customers try to scan it.

---

## 12. Duplicate Logic

**Backend:**
- Manager-elevated-approval flow (resolve manager → re-authenticate → verify elevated role) copy-pasted near-identically between `SaleController.requireElevatedApproval` and `SaleService.requireElevatedApproval` ([SaleController.java:227-252](animasys-backend/src/main/java/com/animasys/modules/sales/controller/SaleController.java:227), [SaleService.java:530-555](animasys-backend/src/main/java/com/animasys/modules/sales/service/SaleService.java:530)).
- `isVariantReferenced`-style "is this row used elsewhere" native-SQL check reimplemented three times across `ProductService`, `ImportService`, and `InventoryController` instead of sharing one repository method.
- `findOrCreateCategory`/`findOrCreateBrand`/`findOrCreateSupplier` independently reimplemented (with slightly different truncation limits) in `ProductService`, `ImportService`, and `SingleItemImportProcessor`.
- The `"t-1"` tenant-fallback string is reimplemented three times with **three different, inconsistent meanings** (default substitution, authorization bypass, lookup fallback) — the security-relevant one (`ImportService`, §7) is the most dangerous instance of this pattern to have copy-pasted.

**Frontend:**
- Levenshtein-distance/string-similarity implemented from scratch twice, once in `productMatcher.ts` (Arabic-aware) and once in `voiceCatalogMatch.ts` (English-only) — near-identical DP implementations that differ only in normalization.
- Local `YYYY-MM-DD` date formatting reimplemented inline in `POS.tsx` and `InvoiceReview.tsx` instead of reusing `periodFinance.ts`'s `formatLocalDate`.
- Money formatting bypasses the shared `formatMoney` utility (manual `.toFixed(2)` + hardcoded `' ج.م'` suffix) in `Inventory.tsx` and `ThermalLabelPrintModal.tsx`.
- No shared Arabic date/time display formatter exists — every module reimplements `toLocaleString('ar-EG', {...})` with slightly different options.

---

## 13. Dead Code

- Root-level stray files (`beautified_inventory.js`, `edited_inventory.tsx`, `extracted_inventory_utf8.js`, `original_inventory.tsx`, `reconstructed_inventory.tsx`) and `src/modules/inventory/Inventory.tsx.backup` — confirmed unreferenced, safe to delete (§10).
- `Inventory.tsx`'s Transfer Stock modal (state + ~50 lines of JSX) — never opened by any button ([Inventory.tsx:86,571-619](src/modules/inventory/Inventory.tsx:86)); paired with the backend's permanently-throwing `TransferService.transferStock` (§10).
- ~130 lines of superseded per-row import pipeline retained in `ImportService.java:301-430` alongside the class that replaced it (§10).
- `StockService`'s `@Deprecated` `adjustStock`/`deductForSale`/`restoreForRefund` — intentional tombstones that unconditionally throw; worth confirming zero remaining callers and removing.
- `saleFinance.ts:98-103` dead identical `if` branch (§11 #19).
- `stock_transfers`/`stock_transfer_items` DB tables with no application code anywhere (§4/§10).

---

## 14. Missing Validations

**Backend:**
- `PurchaseInvoiceController`, `ExpenseController`, `DailyClosingController`, `SupplierController`, `PetController` all bind entities/loose DTOs with no `@Valid` (§6).
- `CreateProductRequest`/`UpdateProductRequest` (`Map<String,Object>`-backed) have zero bean-validation annotations; malformed price/cost silently defaults to `0` instead of rejecting.
- `SkuCatalogService.updateOrCreateSingleVariant` never checks price/cost are non-negative on **create**, while the update path does — an inconsistency that lets a negative-priced product be created but not later edited into a negative price.
- `CustomerService.createPet`/`updatePet` never validate `dto.getName()` (unlike the sibling customer methods in the same file).
- `EmployeeController` accepts an arbitrary `role` string with no check it maps to an existing tenant role (silently produces a permission-less account, not a security bug but an operational footgun).
- `AskRequest.query` has no upper length bound before being embedded in an LLM prompt (§7 #8).
- No overlap validation for boarding reservations / appointments (§11 #16).

**Frontend:**
- Negative price/cost accepted in manual invoice entry, OCR review, and bulk import (§11 #17).
- `Inventory.tsx` stock adjustment accepts a no-op `diff=0` and has no negative-stock guard.
- `Finance.tsx` expense form has no `type="number"`/`min` on the amount field and fails silently rather than showing an error (§11 #14).
- Employee password field has no strength requirement beyond length ≥4 (§11 #18).
- `InvoiceReview.tsx` search has no debounce (§8).

---

## 15. Production Readiness Score

### **42 / 100 — Not production-ready as-is.**

| Category | Score | Rationale |
|---|---|---|
| Architecture & design | 68/100 | Sound layered modular monolith, clean module boundaries (one bidirectional coupling), correct use of `BigDecimal` in financial code, real defense-in-depth RBAC. Undermined by schema truth split across Flyway/Java and several abandoned/half-wired features. |
| Security | 28/100 | A default production PIN logged in plaintext, multiple confirmed cross-tenant IDOR/data-leak paths, no rate limiting anywhere, no token revocation, JWT in `localStorage`. These are the kind of findings that block a production launch outright. |
| Data integrity / correctness | 38/100 | A confirmed P0 runtime bug (`DailyClosing`), silently-wrong financial analytics (100-sale cap), no DB-level CHECK constraints anywhere, several unvalidated negative-value paths, an idempotency safety net that doesn't actually persist on failure. |
| Performance | 55/100 | Reactive-not-proactive indexing (patched in late migrations), a couple of real N+1/no-debounce issues, an unbounded async executor — none of these are severe at small scale but all are real. |
| Code quality | 62/100 | Clean, disciplined TypeScript; genuinely no dead debug artifacts (console.log/TODO) in either codebase's living source; some duplicate logic and a few fragile string-matching error handlers. |
| Test coverage | 35/100 | Frontend has targeted unit tests for permission logic only — the visual/interactive component layer (Button, DataTable, Modal, forms) is essentially untested; backend test scope was not exhaustively audited here but no integration-test evidence for the cross-tenant paths that are broken was found. |

The system has a genuinely competent architectural foundation and several well-executed subsystems (FIFO costing, double-entry ledger, two-layer RBAC). What keeps the score low is a cluster of **security and correctness issues that are cheap to fix but currently live in the default/happy path** — a seeded production credential, several tenant-isolation gaps, and a runtime-breaking schema/entity mismatch. None of these require an architecture change; all are addressable without a rewrite.

---

## 16. Prioritized Roadmap

### Critical — fix before any production deployment
1. Add the missing Flyway migration for `daily_closings`' 5 missing columns (or remove the unused entity fields if they're truly not needed) — [§11 #1](#11-bugs-discovered).
2. Gate `DatabaseSeeder`'s default-account/PIN creation behind an explicit non-production profile flag; stop logging PINs in plaintext; force real credential setup on first production boot.
3. Fix `DailyClosingController`/`Service` to validate `branchId` against the caller's tenant.
4. Remove the `"t-1"` tenant-check bypass in `ImportService`; add a tenant-ownership check to `finalizeSession`.
5. Fix the 100-record sales cap in Reports/Dashboard/CRM/AIAdvisor (mirror `Finance.tsx`'s `size: 5000`, or better, move aggregation server-side).
6. Add rate limiting/lockout to `/auth/login` and `/auth/pin-login`.
7. Add a way to revoke JWTs (minimum: check `employee.active` on every `JwtAuthenticationFilter` pass, not just at login).

### High
8. Add tenant filters to the `findById` calls in supplier/category resolution (`PurchaseInvoiceService`, `ProductService`) and tenant-scope the invoice-fingerprint duplicate check.
9. Fix `IdempotentCheckoutService` so the "FAILED" state actually persists (move the failure-marking write outside the rolled-back transaction, e.g. `REQUIRES_NEW` on just that update).
10. Remove `POSSessionService`'s any-branch-in-the-database fallback; fail closed instead.
11. Fix `RoleBootstrapService`'s role-count assumption; namespace `GroomingServiceController.seedDefaults`' ids per tenant.
12. Add `@Valid` + bean-validation annotations across every raw-entity-bound controller (`Expense`, `DailyClosing`, `Supplier`, `Pet`, `PurchaseInvoice`, `CreateProductRequest`).
13. Move accounts-payable write endpoints off `finance.view_reports` onto a dedicated write permission.
14. Fix `catalogDedupe.ts`'s unconditional application to the barcode-scan catalog (product-hiding bug); fix `productMatcher.ts`'s barcode-match field bug.
15. Move the JWT out of `localStorage` (or at minimum add logout/revocation and shorten the token TTL) — decide alongside item 7.
16. Make `SecurityUtils.requireTenantId()`/`requireBranchId()` fail closed instead of defaulting to `"t-1"`/`"b-1"`.

### Medium
17. Decide the fate of Transfer Stock (wire it up end-to-end, or remove the dead UI/endpoint on both sides consistently).
18. Expand audit logging beyond POS checkout/refund to employee/role changes, inventory adjustments, and factory reset — and make `FactoryResetService` `@Transactional`, writing its own audit record before wiping the tenant's audit history.
19. Add CHECK constraints (or equivalent app-layer validation) for negative money/quantity values across the schema; add the missing indexes identified in §4/§8.
20. Consolidate `CatalogMigrationLifecycle`'s unversioned DDL into proper numbered Flyway migrations; remove the automatic `flyway.repair()`-on-failure call.
21. Add debounce to `InvoiceReview.tsx`'s search; fix `Finance.tsx`'s silent expense-validation failure.
22. Remove the hardcoded fake data reachable in production (`Pets.tsx` name fallback, `Services.tsx` `STAFF_LIST`, `Reports.tsx` owner name).
23. Add overlap validation for boarding reservations and grooming appointments.
24. Fix the frontend's fail-open module-permission gating to deny by default.
25. Move frontend money math to a decimal-safe representation (integer cents or a decimal library) instead of float + `.toFixed(2)`.

### Low
26. Delete the confirmed-dead root files and `Inventory.tsx.backup`; remove `ImportService`'s ~130 lines of superseded pipeline code.
27. Extract a shared `Modal`/`Drawer` overlay primitive with proper ARIA roles, Escape-to-close, and focus trapping.
28. Add systemic `dir="rtl"` instead of per-component inline styles; translate `DataTable`/`CommandPalette` into Arabic.
29. Replace the fake decorative "QR code" on printed invoices with a real one, or remove it.
30. Standardize primary-key `VARCHAR` lengths; convert invoice/installment date columns from `VARCHAR` to `DATE`.
31. Consolidate the duplicated utility logic identified in §12 (Levenshtein, date formatting, `findOrCreate*` helpers, the `"t-1"` fallback pattern) into shared, single-source-of-truth implementations.
