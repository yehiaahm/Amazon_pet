import { describe, it, expect } from 'vitest';
import {
  buildAmazonPetInvoiceHtml,
  buildThermalReceiptHtml,
  type AmazonPetInvoiceData,
  type InvoiceLine,
} from '../amazonPetInvoice';

function invoice(line: InvoiceLine): AmazonPetInvoiceData {
  const total = line.price * line.quantity;
  return {
    saleNumber: 'INV-1',
    date: '2026-01-01T10:00:00.000Z',
    customerName: 'عميل',
    cashierName: 'كاشير',
    items: [line],
    subtotal: total,
    discount: 0,
    total,
  };
}

/**
 * The catalog price is an internal number. Printing it next to a higher charged price makes the
 * shop look like it is overcharging, so a raised line must carry the charged price alone.
 */
describe('invoice line notes — raised unit price', () => {
  const raised = invoice({ name: 'طعام قطط', quantity: 1, price: 200, listPrice: 180 });

  it('prints neither the catalog price nor the delta on the A4 invoice', () => {
    const html = buildAmazonPetInvoiceHtml(raised);
    expect(html).not.toContain('أساسي');
    expect(html).not.toContain('180.00');
    expect(html).not.toContain('+20.00');
    expect(html).toContain('200.00');
  });

  it('prints neither on the thermal receipt', () => {
    const html = buildThermalReceiptHtml(raised);
    expect(html).not.toContain('أساسي');
    expect(html).not.toContain('180.00');
  });

  it('still hides the catalog price when the raised line is then discounted', () => {
    // 180 catalog -> charged 200 -> 10% off = 180 net. The pre-discount figure shown is 200.
    const html = buildAmazonPetInvoiceHtml(
      invoice({ name: 'طعام قطط', quantity: 1, price: 180, listPrice: 180, discountPercent: 10, priceBeforeDiscount: 200 })
    );
    expect(html).not.toContain('أساسي');
    expect(html).toContain('قبل الخصم 200.00');
  });
});

describe('invoice line notes — lowered unit price', () => {
  it('still shows the catalog price, since that is a saving for the customer', () => {
    const html = buildAmazonPetInvoiceHtml(
      invoice({ name: 'طعام قطط', quantity: 1, price: 160, listPrice: 180 })
    );
    expect(html).toContain('أساسي 180.00');
    expect(html).toContain('-20.00');
  });
});
