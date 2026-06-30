// Seller / tax details printed on subscription invoices.
// Fill the [BRACKETED] placeholders with your registered business details.
// The GSTIN line + the GST amount line only appear on an invoice that was
// actually charged with GST (its gst_paise > 0), i.e. once
// SUBSCRIPTION_GST_ENABLED is turned on.
export const BILLING_SELLER = {
  brand: 'MunchAdda',
  legalName: '[REGISTERED LEGAL ENTITY NAME]',
  address: '[REGISTERED ADDRESS LINE]',
  cityStatePin: '[CITY], [STATE] [PINCODE]',
  email: 'support@munchadda.in',
  gstin: '[GSTIN]',
} as const;
