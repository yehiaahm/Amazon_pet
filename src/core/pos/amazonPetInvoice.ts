/**
 * Amazon Pet Shop — customer-facing invoice (A4 print layout).
 * Matches the branded invoice design used at the shop.
 */

export type InvoiceLine = {
  name: string;
  quantity: number;
  price: number;
  /** Catalog price when sold at a different unit price */
  listPrice?: number;
};

export type AmazonPetInvoiceData = {
  saleNumber: string;
  date: string | Date;
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  branchName?: string;
  items: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  amountPaid?: number;
  changeDue?: number;
  paymentMethod?: string;
  status?: string;
};

const NAVY = '#1a2b5e';
const GOLD = '#c4a574';
const GOLD_DARK = '#b08d5a';
const BORDER = '#d8dce6';
const MUTED = '#6b7280';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n: number): string {
  return (Number(n) || 0).toFixed(2);
}

function fmtDateParts(input: string | Date): { date: string; time: string } {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return { date: '—', time: '—' };
  }
  const date = d.toLocaleDateString('en-GB'); // DD/MM/YYYY
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return { date, time };
}

const LOGO_SVG = `
<svg width="64" height="56" viewBox="0 0 64 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M8 28 L32 6 L56 28 V52 H8 Z" fill="none" stroke="${GOLD}" stroke-width="2.2"/>
  <path d="M28 52 V36 H36 V52" fill="none" stroke="${GOLD}" stroke-width="1.6"/>
  <!-- dog -->
  <ellipse cx="24" cy="38" rx="7" ry="6" fill="${NAVY}"/>
  <circle cx="20" cy="30" r="4.2" fill="${NAVY}"/>
  <path d="M16.5 27 L14 22 L19 26 Z" fill="${NAVY}"/>
  <path d="M23.5 27 L26 22 L21 26 Z" fill="${NAVY}"/>
  <!-- cat -->
  <ellipse cx="40" cy="39" rx="6.5" ry="5.5" fill="${NAVY}"/>
  <circle cx="40" cy="31" r="4" fill="${NAVY}"/>
  <path d="M36.5 28 L35 23 L39 27 Z" fill="${NAVY}"/>
  <path d="M43.5 28 L45 23 L41 27 Z" fill="${NAVY}"/>
  <!-- paws -->
  <circle cx="50" cy="34" r="1.4" fill="${GOLD}"/>
  <circle cx="53" cy="31" r="1.1" fill="${GOLD}"/>
  <circle cx="55" cy="27" r="0.9" fill="${GOLD}"/>
</svg>`;

function qrSvg(payload: string): string {
  // Deterministic faux-QR blocks from sale number (prints offline; looks like QR)
  const seed = payload.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const cells: string[] = [];
  const N = 21;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const finder =
        (x < 7 && y < 7) || (x > N - 8 && y < 7) || (x < 7 && y > N - 8);
      const onFinderBorder =
        finder &&
        (x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          x === N - 7 ||
          x === N - 1 ||
          y === N - 7 ||
          y === N - 1 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
          (x >= N - 5 && x <= N - 3 && y >= 2 && y <= 4) ||
          (x >= 2 && x <= 4 && y >= N - 5 && y <= N - 3));
      const hash = (seed * 31 + x * 17 + y * 13) % 7;
      const fill = finder ? onFinderBorder : hash % 2 === 0;
      if (fill) {
        cells.push(
          `<rect x="${x}" y="${y}" width="1" height="1" fill="#111"/>`
        );
      }
    }
  }
  return `<svg width="110" height="110" viewBox="0 0 ${N} ${N}" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">${cells.join('')}</svg>`;
}

export function buildAmazonPetInvoiceHtml(data: AmazonPetInvoiceData): string {
  const { date, time } = fmtDateParts(data.date);
  const branch = data.branchName || 'Hadaeq El Ahram';
  const phone = data.customerPhone?.trim() || '---';
  const amountPaid = data.amountPaid ?? data.total;
  const changeDue = data.changeDue ?? 0;
  const totalQty = data.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalItems = data.items.length;

  const rows = data.items
    .map(
      (i) => {
        const listPrice = typeof i.listPrice === 'number' ? i.listPrice : i.price;
        const adjusted = Math.abs(i.price - listPrice) > 0.001;
        const delta = adjusted ? (i.price - listPrice).toFixed(2) : '';
        const priceCell = adjusted
          ? `${fmtNum(i.price)}<div style="font-size:10px;color:${MUTED};font-weight:600">أساسي ${fmtNum(listPrice)} (${Number(delta) > 0 ? '+' : ''}${delta})</div>`
          : fmtNum(i.price);
        return `
      <tr>
        <td class="item-name">${esc(i.name)}</td>
        <td class="num">${esc(String(i.quantity))}</td>
        <td class="num">${priceCell}</td>
        <td class="num">${fmtNum(i.price * i.quantity)}</td>
      </tr>`;
      }
    )
    .join('');

  const refundBanner =
    data.status === 'REFUNDED'
      ? `<div class="refund-banner">REFUNDED / مرتجعة بالكامل</div>`
      : data.status === 'PARTIALLY_REFUNDED'
        ? `<div class="refund-banner partial">PARTIAL REFUND / مرتجع جزئي</div>`
        : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${esc(data.saleNumber)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    color: ${NAVY};
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    max-width: 800px;
    margin: 0 auto;
    padding: 18px 22px 12px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 18px;
  }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .brand-text h1 {
    font-size: 28px;
    letter-spacing: 1px;
    line-height: 1;
    color: ${NAVY};
  }
  .brand-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    color: ${GOLD_DARK};
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
  }
  .brand-sub::before, .brand-sub::after {
    content: "";
    flex: 1;
    height: 1px;
    background: ${GOLD};
    min-width: 18px;
  }
  .tagline {
    margin-top: 4px;
    color: ${GOLD_DARK};
    font-size: 11px;
    font-style: italic;
  }
  .invoice-head { text-align: right; min-width: 220px; }
  .invoice-title {
    font-size: 30px;
    font-weight: 800;
    letter-spacing: 1px;
    border-bottom: 2px solid ${GOLD};
    display: inline-block;
    padding-bottom: 2px;
    margin-bottom: 10px;
  }
  .invoice-title .paw { color: ${GOLD}; font-size: 18px; margin-left: 4px; }
  .meta-box {
    border: 1px solid ${BORDER};
    border-radius: 10px;
    padding: 8px 12px;
    background: #f7f8fb;
    font-size: 12px;
    text-align: left;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
  }
  .meta-row span:first-child { color: ${MUTED}; font-weight: 600; }
  .meta-row span:last-child { font-weight: 700; color: ${NAVY}; }
  .customer-box {
    border: 1px solid ${BORDER};
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 14px;
    max-width: 340px;
  }
  .box-head {
    background: ${NAVY};
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .box-body { padding: 10px 12px; font-size: 12.5px; }
  .box-body .row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    gap: 10px;
  }
  .box-body .label { color: ${MUTED}; font-weight: 600; }
  .box-body .value { font-weight: 700; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 16px;
    font-size: 12.5px;
  }
  table.items thead th {
    background: ${NAVY};
    color: #fff;
    padding: 9px 10px;
    text-align: left;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  table.items thead th:nth-child(2),
  table.items thead th:nth-child(3),
  table.items thead th:nth-child(4),
  table.items td.num { text-align: center; }
  table.items td {
    border: 1px solid ${BORDER};
    padding: 9px 10px;
  }
  table.items td.item-name { text-align: left; font-weight: 600; }
  .bottom {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 18px;
    align-items: start;
    margin-top: 4px;
  }
  .summary-box {
    border: 1px solid ${BORDER};
    border-radius: 10px;
    overflow: hidden;
  }
  .summary-box .box-body { padding: 0; }
  .sum-row {
    display: flex;
    justify-content: space-between;
    padding: 7px 12px;
    font-size: 12.5px;
    border-bottom: 1px solid ${BORDER};
  }
  .sum-row.highlight { background: #f3e8d8; font-weight: 700; }
  .sum-row.change {
    background: ${NAVY};
    color: #fff;
    font-weight: 800;
    border-bottom: none;
  }
  .contact {
    margin-top: 12px;
    font-size: 11px;
    color: ${MUTED};
    line-height: 1.55;
  }
  .contact strong { color: ${NAVY}; }
  .total-card {
    border: 2px solid ${GOLD};
    border-radius: 12px;
    padding: 14px 12px 12px;
    text-align: center;
    position: relative;
    background: #fff;
  }
  .total-label {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
    margin-bottom: 8px;
    position: relative;
    z-index: 1;
  }
  .total-value {
    font-size: 42px;
    font-weight: 800;
    line-height: 1.1;
    color: ${NAVY};
    position: relative;
    z-index: 1;
    letter-spacing: 0.5px;
  }
  .total-currency {
    margin-top: 8px;
    color: ${GOLD_DARK};
    font-weight: 700;
    letter-spacing: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    position: relative;
    z-index: 1;
  }
  .total-currency::before, .total-currency::after {
    content: "";
    width: 28px;
    height: 1px;
    background: ${GOLD};
  }
  .thanks {
    text-align: center;
    margin-top: 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .thanks .heart { color: ${GOLD_DARK}; }
  .qr-wrap { text-align: center; margin-top: 10px; }
  .shop-name {
    margin-top: 8px;
    font-weight: 800;
    letter-spacing: 0.5px;
    font-size: 13px;
  }
  .socials {
    margin-top: 6px;
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  .socials span {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: ${GOLD};
    color: #fff;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }
  .footer {
    margin-top: 18px;
    background: ${NAVY};
    color: #fff;
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 11px;
  }
  .footer strong { display: block; font-size: 12px; }
  .footer .muted { opacity: 0.9; font-size: 10px; }
  .refund-banner {
    background: #fee2e2;
    color: #991b1b;
    text-align: center;
    font-weight: 800;
    padding: 6px;
    border-radius: 8px;
    margin-bottom: 10px;
    letter-spacing: 1px;
  }
  .refund-banner.partial {
    background: #fef3c7;
    color: #92400e;
  }
  @media print {
    body { background: #fff; }
    .sheet { padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    ${refundBanner}
    <div class="header">
      <div class="brand">
        ${LOGO_SVG}
        <div class="brand-text">
          <h1>AMAZON</h1>
          <div class="brand-sub">PET SHOP</div>
          <div class="tagline">• Everything Your Pet Needs •</div>
        </div>
      </div>
      <div class="invoice-head">
        <div class="invoice-title">INVOICE<span class="paw">🐾</span></div>
        <div class="meta-box">
          <div class="meta-row"><span>Invoice No.</span><span>${esc(data.saleNumber)}</span></div>
          <div class="meta-row"><span>Date</span><span>${esc(date)}</span></div>
          <div class="meta-row"><span>Time</span><span>${esc(time)}</span></div>
          <div class="meta-row"><span>Branch</span><span>${esc(branch)}</span></div>
        </div>
      </div>
    </div>

    <div class="customer-box">
      <div class="box-head"><span>CUSTOMER DETAILS</span><span>👤</span></div>
      <div class="box-body">
        <div class="row"><span class="label">Cashier:</span><span class="value">${esc(data.cashierName)}</span></div>
        <div class="row"><span class="label">Customer:</span><span class="value">${esc(data.customerName)}</span></div>
        <div class="row"><span class="label">Phone No.:</span><span class="value">${esc(phone)}</span></div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>ITEM</th>
          <th>QUANTITY</th>
          <th>UNIT PRICE</th>
          <th>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4" style="text-align:center;color:${MUTED}">No items</td></tr>`}
      </tbody>
    </table>

    <div class="bottom">
      <div>
        <div class="summary-box">
          <div class="box-head"><span>SUMMARY</span><span>💵</span></div>
          <div class="box-body">
            <div class="sum-row"><span>Total Items</span><span>${totalItems}</span></div>
            <div class="sum-row"><span>Total Quantity</span><span>${totalQty}</span></div>
            <div class="sum-row"><span>Subtotal</span><span>${fmtNum(data.subtotal)}</span></div>
            <div class="sum-row"><span>Discount</span><span>${fmtNum(data.discount)}</span></div>
            <div class="sum-row highlight"><span>Total Before Payment</span><span>${fmtNum(data.total)}</span></div>
            <div class="sum-row"><span>Amount Paid</span><span>${fmtNum(amountPaid)}</span></div>
            <div class="sum-row change"><span>Change Due</span><span>${fmtNum(changeDue)}</span></div>
          </div>
        </div>
        <div class="contact">
          <div>📍 <strong>431 El Geish St.</strong> – Hadaeq El Ahram – Gate Mina</div>
          <div>📞 <strong>01018412223</strong></div>
        </div>
      </div>

      <div>
        <div class="total-card">
          <div class="total-label">TOTAL AMOUNT</div>
          <div class="total-value">${fmtNum(data.total)}</div>
          <div class="total-currency">EGP</div>
        </div>
        <div class="thanks">Thank you for trusting us! <span class="heart">♥</span></div>
        <div class="qr-wrap">${qrSvg(data.saleNumber)}</div>
        <div class="shop-name" style="text-align:center">AMAZON PET SHOP</div>
        <div class="socials">
          <span>f</span><span>ig</span><span>wa</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>
        <strong>🛡 Your Pet's Health … Our Priority</strong>
        <span class="muted">Exchange or return within 14 days of purchase.</span>
      </div>
      <div style="font-weight:700;font-size:13px">📞 01018412223</div>
    </div>
  </div>
</body>
</html>`;
}

export function printAmazonPetInvoice(data: AmazonPetInvoiceData): void {
  printInvoiceHtml(buildAmazonPetInvoiceHtml(data), 'amazon-pet-invoice-print');
}

/** Compact 80mm thermal receipt for POS printers. */
export function buildThermalReceiptHtml(data: AmazonPetInvoiceData): string {
  const { date, time } = fmtDateParts(data.date);
  const payLabel =
    data.paymentMethod === 'CARD'
      ? 'Card'
      : data.paymentMethod === 'MOBILE'
        ? 'Mobile'
        : 'Cash';
  const statusBanner =
    data.status === 'REFUNDED'
      ? '<div style="text-align:center;font-weight:700;color:#b91c1c;margin:6px 0">*** REFUNDED ***</div>'
      : data.status === 'PARTIALLY_REFUNDED'
        ? '<div style="text-align:center;font-weight:700;color:#b45309;margin:6px 0">*** PARTIAL REFUND ***</div>'
        : '';

  const lines = data.items
    .map((item) => {
      const lineTotal = item.quantity * item.price;
      return `<tr>
        <td style="padding:2px 0;vertical-align:top">${esc(item.name)}</td>
        <td style="padding:2px 4px;text-align:center;white-space:nowrap">${item.quantity}</td>
        <td style="padding:2px 0;text-align:left;white-space:nowrap">${fmtNum(lineTotal)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(data.saleNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; width: 72mm; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .muted { color: #555; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  .sum td { padding: 2px 0; }
  .total { font-size: 14px; font-weight: 700; border-top: 1px dashed #999; padding-top: 6px; margin-top: 4px; }
  hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
</style>
</head>
<body>
  <div class="center bold" style="font-size:13px">AMAZON PET SHOP</div>
  <div class="center muted">${esc(data.branchName || 'Hadaeq El Ahram')}</div>
  <div class="center muted">431 El Geish St. – Gate Mina</div>
  <div class="center muted">Tel: 01018412223</div>
  <hr/>
  ${statusBanner}
  <div><span class="muted">Invoice:</span> ${esc(data.saleNumber)}</div>
  <div><span class="muted">Date:</span> ${date} ${time}</div>
  <div><span class="muted">Cashier:</span> ${esc(data.cashierName)}</div>
  <div><span class="muted">Customer:</span> ${esc(data.customerName)}</div>
  <hr/>
  <table>
    <thead>
      <tr class="muted">
        <th style="text-align:left">Item</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:left">Total</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <hr/>
  <table class="sum">
    <tr><td>Subtotal</td><td style="text-align:right">${fmtNum(data.subtotal)}</td></tr>
    <tr><td>Discount</td><td style="text-align:right">-${fmtNum(data.discount)}</td></tr>
    <tr class="total"><td>TOTAL (EGP)</td><td style="text-align:right">${fmtNum(data.total)}</td></tr>
    <tr><td>Payment</td><td style="text-align:right">${payLabel}</td></tr>
  </table>
  <hr/>
  <div class="center muted">Thank you for your visit!</div>
  <div class="center muted">Exchange within 14 days</div>
</body>
</html>`;
}

export function printThermalReceipt(data: AmazonPetInvoiceData): void {
  printInvoiceHtml(buildThermalReceiptHtml(data), 'amazon-pet-thermal-print');
}

function printInvoiceHtml(html: string, iframeId: string): void {
  let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  }, 280);
}

export function saleToInvoiceData(opts: {
  sale: {
    saleNumber: string;
    date: string;
    customerId?: string;
    employeeId?: string;
    items: Array<{ name?: string; quantity: number; price: number; listPrice?: number; itemId?: string; type?: string }>;
    totalAmount: number;
    tax?: number;
    discount?: number;
    paymentMethod?: string;
    status?: string;
  };
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  branchName?: string;
  /** Optional catalog lookup to fill missing item names on older sales */
  resolveName?: (item: { name?: string; itemId?: string; type?: string }) => string | undefined;
}): AmazonPetInvoiceData {
  const { sale } = opts;
  const subtotal = (sale.items || []).reduce(
    (s, i) => s + Number(i.price) * Number(i.quantity),
    0
  );
  const discount = Number(sale.discount || 0);
  const total = Number(sale.totalAmount) - Number(sale.tax || 0);

  const isPlaceholderName = (n: string) => {
    const t = n.trim().toLowerCase();
    return !t || t === '...' || t === 'standard' || t === 'default' || t === 'item' || t === 'product';
  };

  const items = (sale.items || []).map((i) => {
    const raw = (i.name || '').trim();
    const resolved = opts.resolveName?.(i)?.trim();
    // Catalog resolve wins when present; avoids variant-only names like "Standard" / "1kg"
    const name =
      (resolved && !isPlaceholderName(resolved) ? resolved : '') ||
      (!isPlaceholderName(raw) ? raw : '') ||
      resolved ||
      raw ||
      'Product';
    return {
      name,
      quantity: i.quantity,
      price: Number(i.price) || 0,
      listPrice: typeof i.listPrice === 'number' ? Number(i.listPrice) : undefined,
    };
  });

  return {
    saleNumber: sale.saleNumber,
    date: sale.date,
    customerName: opts.customerName,
    customerPhone: opts.customerPhone,
    cashierName: opts.cashierName,
    branchName: opts.branchName || 'Hadaeq El Ahram',
    items,
    subtotal,
    discount,
    total,
    amountPaid: total,
    changeDue: 0,
    paymentMethod: sale.paymentMethod,
    status: sale.status,
  };
}
