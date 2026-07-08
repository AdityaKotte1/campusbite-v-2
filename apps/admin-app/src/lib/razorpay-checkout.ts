import axios from 'axios';

/** Order details returned by our add-on checkout / resume-payment endpoints. */
export interface AddonOrder {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

/** Lazily inject the Razorpay checkout script. Resolves false if it can't load. */
export function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Open Razorpay for an order created by our add-on checkout or resume-payment
 * endpoint, then settle it via /subscriptions/verify (which activates the
 * canteen). Resolves on successful verification; rejects if the gateway fails
 * to load, the user dismisses the modal, or verification fails.
 */
export async function payAndVerify(order: AddonOrder, description: string): Promise<void> {
  const ok = await loadRazorpay();
  if (!ok) throw new Error('Could not load the payment gateway');

  await new Promise<void>((resolve, reject) => {
    const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
    const rzp = new RZP({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'MunchAdda',
      description,
      order_id: order.order_id,
      theme: { color: '#E8390E' },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await axios.post('/api/v1/admin/subscriptions/verify', resp);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.open();
  });
}
