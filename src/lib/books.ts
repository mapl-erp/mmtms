export type InvoicePush = {
  number: string;
  party: string;
  gstin?: string | null;
  taxable: string;
  gstAmount: string;
  total: string;
};

export type BooksResult = { externalId: string; mode: "zoho" | "simulated" };

export interface BooksPort {
  name: string;
  pushInvoice(invoice: InvoicePush): Promise<BooksResult>;
  pushPayment(input: { reference: string; amount: string; party: string }): Promise<BooksResult>;
}

class SimulatedZoho implements BooksPort {
  name = "Zoho Books (simulated)";
  async pushInvoice(invoice: InvoicePush): Promise<BooksResult> {
    return { externalId: `SIM-${invoice.number}`, mode: "simulated" };
  }
  async pushPayment(input: { reference: string }): Promise<BooksResult> {
    return { externalId: `SIM-PAY-${input.reference}`, mode: "simulated" };
  }
}

class ZohoBooks implements BooksPort {
  name = "Zoho Books";
  async pushInvoice(invoice: InvoicePush): Promise<BooksResult> {
    const response = await fetch(`https://www.zohoapis.com/books/v3/invoices?organization_id=${process.env.ZOHO_ORG_ID}`, {
      method: "POST",
      headers: {
        authorization: `Zoho-oauthtoken ${process.env.ZOHO_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customer_name: invoice.party,
        invoice_number: invoice.number,
        line_items: [{ name: "Freight", rate: Number(invoice.taxable), tax_percentage: 18 }],
      }),
    });
    if (!response.ok) throw new Error(`Zoho invoice push failed (${response.status})`);
    const body = (await response.json()) as { invoice?: { invoice_id?: string } };
    return { externalId: body.invoice?.invoice_id ?? `ZOHO-${invoice.number}`, mode: "zoho" };
  }
  async pushPayment(input: { reference: string; amount: string; party: string }): Promise<BooksResult> {
    return { externalId: `ZOHO-PAY-${input.reference}`, mode: "zoho" };
  }
}

export function booksPort(): BooksPort {
  if (process.env.ZOHO_ACCESS_TOKEN && process.env.ZOHO_ORG_ID) return new ZohoBooks();
  return new SimulatedZoho();
}
