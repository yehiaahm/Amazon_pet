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
  customerAddress?: string;
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
  isDelivery?: boolean;
  deliveryFee?: number;
  deliveryAddress?: string;
};

const NAVY = '#1a2b5e';
const GOLD = '#c4a574';
const GOLD_DARK = '#b08d5a';
const BORDER = '#d8dce6';
const MUTED = '#6b7280';
const CREAM = '#fdf8ef';
const CREAM_BADGE = '#f3e8d8';

/** Small inline icon glyphs used for the meta/section badges (stroke = currentColor). */
const ICONS = {
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
};

/**
 * Renders as a <span class="badge badge-{kind}">; the *size* is intentionally left to the
 * per-format stylesheet (A4 vs thermal) so the exact same markup can be reused at two scales.
 */
function iconBadge(name: keyof typeof ICONS, opts?: { kind?: 'meta' | 'box' | 'contact' | 'footer'; bg?: string; fg?: string }): string {
  const kind = opts?.kind ?? 'meta';
  const bg = opts?.bg ?? CREAM_BADGE;
  const fg = opts?.fg ?? NAVY;
  return `<span class="badge badge-${kind}" style="background:${bg}">
    <svg viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>
  </span>`;
}

const PAW_WATERMARK_SVG = `
<svg width="90" height="90" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="32" cy="42" rx="14" ry="11" fill="currentColor"/>
  <circle cx="14" cy="30" r="7" fill="currentColor"/>
  <circle cx="26" cy="16" r="7.5" fill="currentColor"/>
  <circle cx="40" cy="16" r="7.5" fill="currentColor"/>
  <circle cx="51" cy="30" r="7" fill="currentColor"/>
</svg>`;

const SOCIAL_ICONS = {
  facebook: `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M13.6 8.4h1.7V6.1h-1.9c-1.9 0-3 1.2-3 3v1.5H8.7v2.4h1.7V19h2.6v-6h1.9l.3-2.4h-2.2V9.4c0-.6.2-1 .6-1Z" fill="#fff"/></svg>`,
  instagram: `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="igGrad" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="15%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="65%" stop-color="#d6249f"/><stop offset="100%" stop-color="#285AEB"/></radialGradient></defs><circle cx="12" cy="12" r="12" fill="url(#igGrad)"/><rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="15.6" cy="8.4" r="0.9" fill="#fff"/></svg>`,
  whatsapp: `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#25D366"/><path d="M12 6.2a5.8 5.8 0 0 0-4.94 8.83L6.2 17.8l2.86-.83A5.8 5.8 0 1 0 12 6.2Z" fill="none" stroke="#fff" stroke-width="0"/><path d="M12 6.7a5.3 5.3 0 0 0-4.5 8.1l.16.26-.62 2.24 2.3-.6.25.15A5.3 5.3 0 1 0 12 6.7Zm3.1 7.4c-.13.36-.75.7-1.03.74-.27.04-.6.06-.97-.06a8.6 8.6 0 0 1-1.98-.87c-1.55-.9-2.55-2.4-2.63-2.5-.08-.1-.63-.84-.63-1.6s.4-1.13.55-1.28c.14-.15.3-.19.4-.19h.3c.1 0 .23-.02.36.28.13.31.44 1.06.48 1.14.04.08.06.17.01.27-.05.1-.08.16-.16.25l-.24.28c-.08.08-.16.17-.07.33.09.16.4.68.87 1.1.6.55 1.1.72 1.27.8.16.08.26.07.36-.04.1-.11.4-.47.51-.63.11-.16.22-.13.36-.08.14.05.9.43 1.06.5.16.08.27.12.31.19.04.07.04.4-.09.76Z" fill="#fff"/></svg>`,
};

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

/**
 * Builds the shared invoice markup (same sections/wording/icons for both print formats).
 * Only the wrapping <style> differs between the A4 sheet and the 80mm thermal roll —
 * that's the only printer this shop actually owns, so it must show the exact same design.
 */
function renderInvoiceBody(data: AmazonPetInvoiceData): string {
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
          ? `${fmtNum(i.price)}<div class="list-price-note">أساسي ${fmtNum(listPrice)} (${Number(delta) > 0 ? '+' : ''}${delta})</div>`
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

  return `
  <div class="sheet">
    ${refundBanner}
    <div class="header">
      <div class="brand">
        <div class="brand-logo">${LOGO_SVG}</div>
        <div class="brand-text">
          <h1>AMAZON</h1>
          <div class="brand-sub">PET SHOP</div>
          <div class="tagline">🐾 Everything your pets need 🐾</div>
        </div>
      </div>
      <div class="invoice-head">
        <div class="invoice-title">INVOICE<span class="paw">🐾</span></div>
        <div class="invoice-sub">SALES INVOICE</div>
        <div class="meta-box">
          <div class="meta-row"><span class="label">Invoice No.</span><span class="value-group"><span class="value">${esc(data.saleNumber)}</span>${iconBadge('file')}</span></div>
          <div class="meta-row"><span class="label">Date</span><span class="value-group"><span class="value">${esc(date)}</span>${iconBadge('calendar')}</span></div>
          <div class="meta-row"><span class="label">Time</span><span class="value-group"><span class="value">${esc(time)}</span>${iconBadge('clock')}</span></div>
          <div class="meta-row"><span class="label">Branch</span><span class="value-group"><span class="value">${esc(branch)}</span>${iconBadge('pin')}</span></div>
        </div>
      </div>
    </div>

    <div class="customer-box">
      <div class="box-head"><span>CUSTOMER DETAILS</span>${iconBadge('user', { kind: 'box', bg: 'rgba(255,255,255,.18)', fg: '#fff' })}</div>
      <div class="box-body">
        <div class="row"><span class="label">Cashier:</span><span class="value">${esc(data.cashierName)}</span></div>
        <div class="row"><span class="label">Customer:</span><span class="value">${esc(data.customerName)}</span></div>
        <div class="row"><span class="label">Phone No.:</span><span class="value">${esc(phone)}</span></div>
        ${data.customerAddress ? `<div class="row"><span class="label">Address:</span><span class="value">${esc(data.customerAddress)}</span></div>` : ''}
        ${data.isDelivery && data.deliveryAddress && data.deliveryAddress !== data.customerAddress ? `<div class="row"><span class="label">Delivery Address:</span><span class="value">${esc(data.deliveryAddress)}</span></div>` : ''}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>ITEM</th>
          <th>QTY</th>
          <th>UNIT PRICE</th>
          <th>TOTAL PRICE</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4" style="text-align:center;color:${MUTED}">No items</td></tr>`}
      </tbody>
    </table>

    <div class="bottom">
      <div>
        <div class="summary-box">
          <div class="box-head"><span>INVOICE SUMMARY</span>${iconBadge('dollar', { kind: 'box', bg: 'rgba(255,255,255,.18)', fg: '#fff' })}</div>
          <div class="box-body">
            <div class="sum-row"><span>Total Quantity</span><span>${totalQty}</span></div>
            <div class="sum-row"><span>Total Items</span><span>${totalItems}</span></div>
            <div class="sum-row"><span>Subtotal</span><span>${fmtNum(data.subtotal)}</span></div>
            <div class="sum-row"><span>Discount</span><span>${fmtNum(data.discount)}</span></div>
            ${data.isDelivery ? `<div class="sum-row"><span>Delivery Fee / رسوم التوصيل</span><span>${fmtNum(data.deliveryFee || 0)}</span></div>` : ''}
            <div class="sum-row highlight"><span>Total Before Payment</span><span>${fmtNum(data.total)}</span></div>
            <div class="sum-row"><span>Amount Paid</span><span>${fmtNum(amountPaid)}</span></div>
            <div class="sum-row change"><span>CHANGE DUE</span><span>${fmtNum(changeDue)}</span></div>
          </div>
        </div>
        <div class="contact-box">
          <div class="contact-row">${iconBadge('pin', { kind: 'contact' })} <strong>431 El Geish St.</strong> – Hadaeq El Ahram – Gate Mina</div>
          <div class="contact-row">${iconBadge('phone', { kind: 'contact' })} <strong>01018412223</strong></div>
        </div>
      </div>

      <div>
        <div class="total-card">
          <div class="total-label">TOTAL AMOUNT</div>
          <div class="total-value">${fmtNum(data.total)}</div>
          <div class="total-currency">EGP</div>
        </div>
        <div class="thanks">Thank you for your trust <span class="heart">♥</span></div>
        <div class="qr-wrap">${qrSvg(data.saleNumber)}</div>
        <div class="shop-name">AMAZON PET SHOP</div>
        <div class="socials">
          ${SOCIAL_ICONS.facebook}${SOCIAL_ICONS.instagram}${SOCIAL_ICONS.whatsapp}
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-left">
        ${iconBadge('shield', { kind: 'footer', bg: 'rgba(255,255,255,.18)', fg: GOLD })}
        <div>
          <strong>Because your pets deserve the best…</strong>
          <span class="muted">For returns or exchanges within 14 days of purchase.</span>
        </div>
      </div>
      <div class="footer-phone">${iconBadge('phone', { kind: 'footer', bg: 'rgba(255,255,255,.18)', fg: '#fff' })} 01018412223</div>
      <div class="footer-paw">${PAW_WATERMARK_SVG}</div>
    </div>
  </div>`;
}

/** Shared component styling — colors, borders and section anatomy that never differ between formats. */
const SHARED_INVOICE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: ${NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand-logo svg { display: block; }
  .brand-sub { display: flex; align-items: center; color: ${GOLD_DARK}; font-weight: 700; }
  .brand-sub::before, .brand-sub::after { content: ""; flex: 1; height: 1px; background: ${GOLD}; }
  .tagline { color: ${GOLD_DARK}; font-style: italic; }
  .invoice-title { font-weight: 800; display: inline-flex; align-items: center; }
  .invoice-title .paw { color: ${GOLD}; }
  .invoice-sub { border-bottom-color: ${GOLD}; color: ${GOLD_DARK}; font-weight: 700; }
  .meta-box { border: 1px solid ${BORDER}; background: #fff; text-align: left; }
  .meta-row { display: flex; align-items: center; justify-content: space-between; }
  .meta-row + .meta-row { border-top: 1px solid ${BORDER}; }
  .meta-row .label { color: ${MUTED}; font-weight: 600; }
  .meta-row .value-group { display: flex; align-items: center; }
  .meta-row .value { font-weight: 700; color: ${NAVY}; }
  .customer-box, .summary-box, .contact-box, .total-card { background: #fff; }
  .customer-box, .summary-box { border: 1px solid ${BORDER}; overflow: hidden; }
  .box-head { background: ${NAVY}; color: #fff; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
  .box-body .row { display: flex; justify-content: space-between; }
  .box-body .label { color: ${MUTED}; font-weight: 600; }
  .box-body .value { font-weight: 700; }
  .summary-box .box-body { padding: 0; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead th { background: ${NAVY}; color: #fff; text-align: left; font-weight: 700; }
  table.items thead th:nth-child(2), table.items thead th:nth-child(3), table.items thead th:nth-child(4), table.items td.num { text-align: center; }
  table.items td { border: 1px solid ${BORDER}; }
  table.items td.item-name { text-align: left; font-weight: 600; }
  .list-price-note { color: ${MUTED}; font-weight: 600; }
  .sum-row { display: flex; justify-content: space-between; border-bottom: 1px solid ${BORDER}; }
  .sum-row.highlight { background: ${CREAM_BADGE}; font-weight: 700; }
  .sum-row.change { background: ${NAVY}; color: #fff; font-weight: 800; border-bottom: none; }
  .contact-box { border: 1px solid ${BORDER}; }
  .contact-row { display: flex; align-items: center; color: ${MUTED}; }
  .contact-row strong { color: ${NAVY}; font-weight: 700; }
  .total-card { border: 2px solid ${GOLD}; text-align: center; position: relative; }
  .total-label { font-weight: 800; position: relative; z-index: 1; }
  .total-value { font-weight: 800; line-height: 1.1; color: ${NAVY}; position: relative; z-index: 1; }
  .total-currency { color: ${GOLD_DARK}; font-weight: 700; display: flex; align-items: center; justify-content: center; position: relative; z-index: 1; }
  .total-currency::before, .total-currency::after { content: ""; height: 1px; background: ${GOLD}; }
  .thanks { text-align: center; font-weight: 600; }
  .thanks .heart { color: ${GOLD_DARK}; }
  .qr-wrap { text-align: center; }
  .qr-wrap svg { display: block; margin: 0 auto; }
  .shop-name { font-weight: 800; text-align: center; }
  .socials { display: flex; justify-content: center; }
  .footer { background: ${NAVY}; color: #fff; position: relative; overflow: hidden; }
  .footer-left { display: flex; align-items: center; position: relative; z-index: 1; }
  .footer-phone { display: flex; align-items: center; font-weight: 700; position: relative; z-index: 1; }
  .footer strong { display: block; }
  .footer .muted { opacity: 0.85; }
  .footer-paw { position: absolute; top: 50%; transform: translateY(-50%); color: ${GOLD}; opacity: 0.25; }
  .badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; flex: none; }
  .badge svg { display: block; }
  .refund-banner { background: #fee2e2; color: #991b1b; text-align: center; font-weight: 800; }
  .refund-banner.partial { background: #fef3c7; color: #92400e; }
`;

/** A4 sheet — geometry, spacing and type scale for a full page. */
const A4_INVOICE_CSS = `
  @page { size: A4; margin: 12mm; }
  body { background: ${CREAM}; }
  .sheet { max-width: 800px; margin: 0 auto; padding: 18px 22px 12px; position: relative; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .brand-logo svg { width: 64px; height: 56px; }
  .brand-text h1 { font-size: 28px; letter-spacing: 1px; line-height: 1; }
  .brand-sub { gap: 8px; margin-top: 4px; font-size: 13px; letter-spacing: 2px; }
  .brand-sub::before, .brand-sub::after { min-width: 18px; }
  .tagline { margin-top: 4px; font-size: 11px; }
  .invoice-head { text-align: right; min-width: 240px; }
  .invoice-title { font-size: 30px; letter-spacing: 1px; gap: 6px; }
  .invoice-title .paw { font-size: 18px; }
  .invoice-sub { border-bottom: 2px solid; font-size: 11px; letter-spacing: 2px; padding-bottom: 8px; margin-bottom: 10px; }
  .meta-box { border-radius: 10px; padding: 6px 10px; font-size: 12px; }
  .meta-row { gap: 10px; padding: 4px 0; }
  .meta-row .value-group { gap: 8px; }
  .customer-box { border-radius: 10px; margin-bottom: 14px; max-width: 340px; }
  .box-head { font-size: 12px; letter-spacing: 0.5px; padding: 8px 12px; }
  .box-body { padding: 10px 12px; font-size: 12.5px; }
  .box-body .row { padding: 3px 0; gap: 10px; }
  table.items { margin: 8px 0 16px; font-size: 12.5px; }
  table.items thead th { padding: 9px 10px; letter-spacing: 0.4px; }
  table.items td { padding: 9px 10px; }
  .list-price-note { font-size: 10px; }
  .bottom { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; align-items: start; margin-top: 4px; }
  .sum-row { padding: 7px 12px; font-size: 12.5px; }
  .sum-row.change { letter-spacing: 0.5px; }
  .contact-box { border-radius: 10px; margin-top: 12px; padding: 8px 12px; font-size: 11.5px; }
  .contact-row { gap: 8px; padding: 3px 0; }
  .total-card { border-radius: 12px; padding: 14px 12px 12px; }
  .total-label { font-size: 12px; letter-spacing: 1px; margin-bottom: 8px; }
  .total-value { font-size: 42px; letter-spacing: 0.5px; }
  .total-currency { margin-top: 8px; letter-spacing: 3px; gap: 10px; }
  .total-currency::before, .total-currency::after { width: 28px; }
  .thanks { margin-top: 12px; font-size: 13px; }
  .qr-wrap { margin-top: 10px; }
  .qr-wrap svg { width: 110px; height: 110px; }
  .shop-name { margin-top: 8px; letter-spacing: 0.5px; font-size: 13px; }
  .socials { margin-top: 6px; gap: 8px; }
  .socials svg { width: 20px; height: 20px; }
  .footer { margin-top: 18px; border-radius: 8px; padding: 10px 14px; justify-content: space-between; gap: 12px; font-size: 11px; }
  .footer-left { gap: 10px; }
  .footer-phone { gap: 6px; font-size: 13px; }
  .footer strong { font-size: 12px; }
  .footer .muted { font-size: 10px; }
  .footer-paw { right: -16px; }
  .footer-paw svg { width: 90px; height: 90px; }
  .badge-meta { width: 22px; height: 22px; } .badge-meta svg { width: 12px; height: 12px; }
  .badge-box { width: 24px; height: 24px; } .badge-box svg { width: 14px; height: 14px; }
  .badge-contact { width: 18px; height: 18px; } .badge-contact svg { width: 10px; height: 10px; }
  .badge-footer { width: 26px; height: 26px; } .badge-footer svg { width: 14px; height: 14px; }
  .refund-banner { padding: 6px; border-radius: 8px; margin-bottom: 10px; letter-spacing: 1px; }
  @media print { body { background: #fff; } .sheet { padding: 0; max-width: none; } }
`;

/** 80mm thermal roll — the ONLY printer this shop owns, so it must carry the exact same design, single-column and scaled down. */
const THERMAL_INVOICE_CSS = `
  @page { size: 80mm auto; margin: 0; }
  body { background: #fff; width: 78mm; margin: 0 auto; }
  .sheet { padding: 6px 6px 16px; position: relative; }
  .header { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin-bottom: 12px; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .brand-logo svg { width: 48px; height: 42px; }
  .brand-text h1 { font-size: 22px; letter-spacing: 1px; line-height: 1.1; }
  .brand-sub { gap: 6px; margin-top: 3px; font-size: 12px; letter-spacing: 1.5px; }
  .brand-sub::before, .brand-sub::after { min-width: 10px; }
  .tagline { margin-top: 3px; font-size: 9.5px; }
  .invoice-head { text-align: center; min-width: 0; width: 100%; }
  .invoice-title { font-size: 20px; letter-spacing: 0.5px; gap: 4px; justify-content: center; }
  .invoice-title .paw { font-size: 15px; }
  .invoice-sub { border-bottom: 1.5px solid; font-size: 9.5px; letter-spacing: 1.5px; padding-bottom: 5px; margin-bottom: 8px; display: inline-block; }
  .meta-box { border-radius: 8px; padding: 6px 9px; font-size: 11px; width: 100%; }
  .meta-row { gap: 8px; padding: 4px 0; }
  .meta-row .value-group { gap: 6px; }
  .customer-box { border-radius: 8px; margin-bottom: 10px; max-width: none; width: 100%; }
  .box-head { font-size: 11px; letter-spacing: 0.3px; padding: 7px 9px; }
  .box-body { padding: 8px 9px; font-size: 11px; }
  .box-body .row { padding: 3px 0; gap: 8px; }
  table.items { margin: 6px 0 10px; font-size: 10.5px; }
  table.items thead th { padding: 5px 5px; letter-spacing: 0.3px; }
  table.items td { padding: 5px 5px; }
  .list-price-note { font-size: 8px; }
  .bottom { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 2px; }
  .sum-row { padding: 5px 9px; font-size: 11px; }
  .sum-row.change { letter-spacing: 0.3px; }
  .contact-box { border-radius: 8px; margin-top: 8px; padding: 7px 9px; font-size: 10.5px; }
  .contact-row { gap: 7px; padding: 3px 0; }
  .total-card { border-radius: 10px; padding: 10px 10px 9px; border-width: 2px; }
  .total-label { font-size: 10px; letter-spacing: 0.5px; margin-bottom: 6px; }
  .total-value { font-size: 30px; letter-spacing: 0.3px; }
  .total-currency { margin-top: 6px; letter-spacing: 2px; gap: 8px; font-size: 11px; }
  .total-currency::before, .total-currency::after { width: 18px; }
  .thanks { margin-top: 10px; font-size: 11.5px; }
  .qr-wrap { margin-top: 8px; }
  .qr-wrap svg { width: 76px; height: 76px; }
  .shop-name { margin-top: 7px; letter-spacing: 0.3px; font-size: 11.5px; }
  .socials { margin-top: 6px; gap: 7px; }
  .socials svg { width: 19px; height: 19px; }
  .footer { margin-top: 12px; border-radius: 8px; padding: 9px 10px; flex-direction: column; align-items: flex-start; gap: 6px; font-size: 9.5px; }
  .footer-left { gap: 8px; }
  .footer-phone { gap: 6px; font-size: 11px; }
  .footer strong { font-size: 10.5px; }
  .footer .muted { font-size: 8.5px; }
  .footer-paw { right: -12px; }
  .footer-paw svg { width: 54px; height: 54px; }
  .badge-meta { width: 17px; height: 17px; } .badge-meta svg { width: 9px; height: 9px; }
  .badge-box { width: 18px; height: 18px; } .badge-box svg { width: 10px; height: 10px; }
  .badge-contact { width: 15px; height: 15px; } .badge-contact svg { width: 8.5px; height: 8.5px; }
  .badge-footer { width: 19px; height: 19px; } .badge-footer svg { width: 10.5px; height: 10.5px; }
  .refund-banner { padding: 6px; border-radius: 6px; margin-bottom: 8px; letter-spacing: 0.5px; font-size: 11px; }
`;

export function buildAmazonPetInvoiceHtml(data: AmazonPetInvoiceData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${esc(data.saleNumber)}</title>
<style>${SHARED_INVOICE_CSS}${A4_INVOICE_CSS}</style>
</head>
<body>${renderInvoiceBody(data)}</body>
</html>`;
}

export function printAmazonPetInvoice(data: AmazonPetInvoiceData): void {
  printInvoiceHtml(buildAmazonPetInvoiceHtml(data), 'amazon-pet-invoice-print');
}

/** 80mm thermal receipt — the exact same branded invoice design as buildAmazonPetInvoiceHtml, laid out for the shop's actual printer. */
export function buildThermalReceiptHtml(data: AmazonPetInvoiceData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${esc(data.saleNumber)}</title>
<style>${SHARED_INVOICE_CSS}${THERMAL_INVOICE_CSS}</style>
</head>
<body>${renderInvoiceBody(data)}</body>
</html>`;
}

/**
 * Windows keeps virtual printers (Print to PDF, XPS, Fax) installed alongside the real
 * receipt printer. If one of those became the OS default, the print dialog opens on it
 * and the receipt comes out as an A4 PDF instead of the 80mm roll. In the desktop app,
 * point the OS default printer at the shop's real printer first so the dialog that
 * window.print() below opens is already on the right device.
 */
function ensureReceiptPrinterDefault(): Promise<unknown> {
  const electronAPI = (window as any).electronAPI;
  if (!electronAPI?.ensureReceiptPrinterDefault) return Promise.resolve(undefined);
  return Promise.race([
    electronAPI.ensureReceiptPrinterDefault().catch(() => undefined),
    new Promise((resolve) => window.setTimeout(resolve, 3000)),
  ]);
}

export function printThermalReceipt(data: AmazonPetInvoiceData): void {
  const html = buildThermalReceiptHtml(data);
  ensureReceiptPrinterDefault().finally(() => printInvoiceHtml(html, 'amazon-pet-thermal-print'));
}

export function printTestThermalReceipt80mm(): void {
  const dummyData: AmazonPetInvoiceData = {
    saleNumber: 'INV-TEST-80MM',
    date: new Date().toLocaleString('ar-EG'),
    customerName: 'عميل تجربة المعايرة الميدانية',
    cashierName: 'مسئول المعايرة الميدانية',
    branchName: 'أمازون بت شوب — فرع المحل الرئيسي',
    items: [
      { name: 'طعام قطط بيست بت رطب 400ج (Best Pet Salmon 400g)', quantity: 2, price: 120, listPrice: 120 },
      { name: 'خدمة قص ونظافة أليق احترافية (Full Grooming)', quantity: 1, price: 250, listPrice: 250 },
    ],
    subtotal: 490,
    discount: 40,
    total: 450,
    amountPaid: 500,
    changeDue: 50,
    paymentMethod: 'CASH (نقدية بالدرج)',
  };
  printThermalReceipt(dummyData);
}

function printInvoiceHtml(html: string, iframeId: string): void {
  let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe) {
    iframe.remove();
  }
  iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch (e) {
      console.error('Failed to trigger print dialog', e);
    }
  }, 300);
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
    delivery?: boolean;
    deliveryFee?: number;
    deliveryAddress?: string;
  };
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
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
    customerAddress: opts.customerAddress,
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
    isDelivery: sale.delivery,
    deliveryFee: sale.deliveryFee,
    deliveryAddress: sale.deliveryAddress,
  };
}
