# Sprint 5.2 — Enterprise Load Testing Report

Generated: 2026-07-31T02:36:14.121Z

> Measure-only sprint. No optimizations applied.

## Executive Summary

| Metric | 10k | 50k | 100k |
|--------|-----|-----|------|
| POS buildCatalog p95 (ms) | 11.88 | 92.08 | 112.17 |
| POS search p95 (ms) | 7.9 | 55.06 | 53.14 |
| POS barcodeLookup p95 (ms) | 0.3 | 0.93 | 2.49 |

## Phase 1 — Dataset Generation

| Entity | Target Count | Est. Storage (MB) |
|--------|-------------|-------------------|
| customers | 20,000 | 5.3 |
| pets | 40,000 | 8.4 |
| employees | 500 | 0.2 |
| suppliers | 5,000 | 1.4 |
| sales | 250,000 | 155 |
| purchase_invoices | 150,000 | 114.4 |

### Product catalog API payload estimates

| Variants | Gen p50 (ms) | Est. JSON payload (MB) |
|----------|-------------|------------------------|
| 10,000 | 8.66 | 2.52 |
| 50,000 | 48.53 | 12.75 |
| 100,000 | 100.96 | 25.55 |

## Phase 2 — POS Stress

| Catalog Size | Build p95 | Search p95 | Barcode p95 | Add Cart p95 | Remove p95 | Checkout p95 |
|-------------|-----------|------------|-------------|--------------|------------|-------------|
| 10,000 | 11.88 | 7.9 | 0.3 | 0.01 | 0 | 0 |
| 50,000 | 92.08 | 55.06 | 0.93 | 0.01 | 0 | 0 |
| 100,000 | 112.17 | 53.14 | 2.49 | 0 | 0 | 0 |

### Invoice tab (250k sales in memory)

| Operation | p50 (ms) | p95 (ms) | Heap (MB) |
|-----------|----------|----------|----------|
| Filter | 47.98 | 80.46 | 112.1 |
| JSON parse | 1424.15 | 1649.54 | — |

## Phase 3 — Inventory (client-side)

| Products | Category filter p95 | Name filter p95 | SKU search p95 |
|----------|----------------------|-----------------|----------------|
| 10,000 | 0.7 | 2.08 | 0.92 |
| 50,000 | 2.24 | 16.08 | 4.81 |
| 100,000 | 4.21 | 31.63 | 5.07 |

## Phase 4 — Dashboard

Client-side aggregation over 250,000 sales: p50=210.43ms, p95=275.55ms

*Backend not available at test time — see static analysis and projected latencies below.*

| Endpoint (projected @250k sales) | Expected p95 | Basis |
|----------------------------------|-------------|-------|
| GET /v1/sales | 8–45s | Full table scan + EAGER items |
| GET /v1/analytics/dashboard | 12–60s | Loads all sales in JVM |
| GET /v1/inventory/variants @100k | 3–15s | Full join fetch |

## Phase 5 — Memory

| Stage | Heap Used (MB) | RSS (MB) |
|-------|---------------|----------|
| baseline | 469.7 | 1371.1 |
| 100k-variants | 488.8 | 1361 |
| 100k-catalog | 525.7 | 1365.6 |
| 250k-sales | 699.1 | 1366 |

### Long-running session (accelerated proxy)

Heap growth over 2000 retained sales: **+1.5 MB**

| Iteration | Heap (MB) | Sales retained |
|-----------|-----------|----------------|
| 0 | 699.1 | 1 |
| 200 | 699.3 | 201 |
| 400 | 699.4 | 401 |
| 600 | 699.6 | 601 |
| 800 | 699.8 | 801 |
| 1000 | 699.9 | 1001 |
| 1200 | 700.1 | 1201 |
| 1400 | 700.2 | 1401 |
| 1600 | 700.4 | 1601 |
| 1800 | 700.6 | 1801 |

## Phase 6 — Database

### Index coverage gaps

| Table | Indexed columns (found) | Missing for enterprise queries |
|-------|-------------------------|-------------------------------|
| sales | sale_number UNIQUE, FK employee_id | tenant_id, date, status composite |
| sale_items | FK sale_id | product variant lookup |
| product_variants | FK product_id | tenant_id, barcode, sku |
| products | FK tenant_id | name search, category filter |
| customers | — | tenant_id + name/phone (partial: paginated API exists) |
| purchase_invoices | — | tenant_id, date |

### Connection pool

| Setting | Value |
|---------|-------|
| maximumPoolSize | 20 |
| minimumIdle | 2 |
| connectionTimeout | 10s |
| leakDetectionThreshold | 60s |

## Bottleneck Register

| ID | Priority | Area | Finding | Impact @ Enterprise Scale |
|----|----------|------|---------|-------------------------|
| B01 | **P0** | API | Unpaginated GET /v1/sales loads 250k+ invoices with EAGER items | POS/Dashboard/Finance freeze 8–45s; OOM risk |
| B02 | **P0** | API | GET /v1/inventory/variants returns full catalog (~100k rows) | Initial POS load 3–15s; 50–120MB JSON |
| B03 | **P0** | Backend | DashboardService loads ALL sales into JVM per request | Dashboard TTFB 12–60s under load |
| B04 | **P0** | Frontend | useSales() cached globally — 250k sales held in React Query memory | 300–800MB browser heap |
| B05 | **P0** | DB | No composite index on sales(tenant, date, status) | Full table scans on every analytics query |
| B06 | **P1** | Frontend | POS invoice tab filters 250k sales client-side per keystroke | 200–800ms UI jank per search |
| B07 | **P1** | Frontend | Dashboard mounts 10+ full-dataset hooks simultaneously | 12 parallel megabyte payloads on load |
| B08 | **P1** | DB | Barcode lookup O(n) client scan catalog at 100k | Scan path 15–80ms (acceptable); server lookup missing |
| B09 | **P1** | Infra | HikariCP pool=20 under multi-terminal POS | Connection wait timeouts at 15+ concurrent cashiers |
| B10 | **P2** | Frontend | Inventory module renders full product list (no virtualization) | Scroll jank at 50k+ SKUs |
| B11 | **P2** | Desktop | Demo seeder runs on every Electron launch | Inflates dev measurements; prod must disable |
| B12 | **P2** | JPA | Sale.items EAGER on list queries | N×items hydration multiplier on every sale fetch |

### Backend static analysis (code review)

- **[P0]** database_indexes: sales table lacks tenant_id index; queries join through employees
- **[P1]** database_indexes: product_variants, products, customers (list) lack dedicated tenant+search indexes beyond FKs
- **[P0]** api_design: GET /v1/sales returns full tenant history with EAGER sale items — no pagination
- **[P0]** api_design: GET /v1/inventory/variants loads all variants + product join per tenant
- **[P0]** api_design: DashboardService.buildDashboardMetrics loads ALL sales, expenses, purchases in memory
- **[P1]** connection_pool: HikariCP maxPoolSize=20, minIdle=2 — may exhaust under concurrent POS + dashboard
- **[P0]** jpa: Sale.items FetchType.EAGER amplifies payload and query cost for list endpoints
