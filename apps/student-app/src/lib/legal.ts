/**
 * Legal content for MunchAdda (India).
 *
 * ⚠️ TEMPLATE — have a qualified Indian lawyer review before relying on this.
 * Replace every [BRACKETED] placeholder with your real details (legal entity
 * name, registered address, GSTIN, grievance officer, contact email/phone).
 *
 * Structured for: Digital Personal Data Protection Act 2023 (DPDP), the IT Act
 * 2000 & IT Rules 2021 (grievance redressal), Consumer Protection Act 2019 /
 * e-commerce rules, and Razorpay's required merchant policy pages.
 */

export const LEGAL = {
  company: '[YOUR LEGAL ENTITY NAME]',
  brand: 'MunchAdda',
  address: '[YOUR REGISTERED ADDRESS, CITY, STATE, PIN]',
  email: 'support@munchadda.innvera.online',
  grievanceOfficer: '[GRIEVANCE OFFICER NAME]',
  grievanceEmail: 'grievance@munchadda.innvera.online',
  phone: '[+91-XXXXXXXXXX]',
  jurisdiction: '[YOUR CITY], India',
  updated: '12 June 2026',
};

export interface LegalSection {
  heading: string;
  body: string[];
}
export interface LegalDoc {
  slug: string;
  title: string;
  sections: LegalSection[];
}

const TERMS: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Service',
  sections: [
    {
      heading: '1. Acceptance of Terms',
      body: [
        `These Terms of Service ("Terms") are a legally binding agreement between you and ${LEGAL.company} ("${LEGAL.brand}", "we", "us"). By creating an account, accessing, or using the ${LEGAL.brand} app or website (the "Platform"), you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not use the Platform.`,
        'You must be at least 18 years of age, or have the consent of a parent or legal guardian if you are a minor, to use the Platform and to make payments.',
      ],
    },
    {
      heading: '2. What MunchAdda Is',
      body: [
        `${LEGAL.brand} is a technology platform that connects students with food outlets ("Canteens") operated by educational institutions or their licensees ("Institutes"). We facilitate ordering, payment processing (via third-party gateways), and pickup via QR codes.`,
        `${LEGAL.brand} is an intermediary and facilitator only. We do not prepare, cook, handle, own, or sell food. The Canteen is solely responsible for the preparation, quality, safety, hygiene, packaging, pricing, and fulfilment of all food items.`,
      ],
    },
    {
      heading: '3. Your Account',
      body: [
        'You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Provide accurate, current information and keep it updated.',
        'You agree not to misuse the Platform, including: placing fraudulent or fake orders, sharing or duplicating QR pickup codes, attempting unauthorised access, scraping, reverse engineering, or interfering with the Platform’s operation.',
      ],
    },
    {
      heading: '4. Orders, Pricing & Taxes',
      body: [
        'Prices, availability, and item descriptions are set by the Canteen and may change without notice. Applicable taxes (including GST) are shown at checkout where relevant.',
        'An order is an offer to purchase. The Canteen may accept or reject it (e.g., item unavailable, kitchen closed). On rejection, any amount paid is refunded per our Refund & Cancellation Policy.',
      ],
    },
    {
      heading: '5. Payments',
      body: [
        `Payments are processed by third-party payment gateways (e.g., Razorpay). ${LEGAL.brand} does not store your full card or bank details. Your use of the gateway is subject to its own terms and privacy policy.`,
        'Funds for food orders are settled to the respective Canteen/Institute account. You authorise us and the gateway to process the transaction amount shown at checkout.',
      ],
    },
    {
      heading: '6. Pickup & Order Fulfilment',
      body: [
        'Orders are for pickup at the selected Canteen. After payment, you receive a single-use QR code and a token number. Present the QR at the Canteen kiosk/counter to collect your order.',
        'QR codes are single-use and expire after the stated validity (typically 3 hours). It is your responsibility to collect within the pickup window. Uncollected orders may not be refundable (see Refund Policy).',
      ],
    },
    {
      heading: '7. Cancellations & Refunds',
      body: [
        'Cancellations and refunds are governed by our Refund & Cancellation Policy, which forms part of these Terms.',
      ],
    },
    {
      heading: '8. Food Quality, Allergens & Disclaimer',
      body: [
        'All information about food, including ingredients, allergens, nutrition, and images, is provided by the Canteen and is indicative only. If you have allergies or dietary restrictions, confirm directly with the Canteen before consuming.',
        `THE PLATFORM AND SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. ${LEGAL.brand} does not warrant uninterrupted or error-free operation, nor the quality or safety of any food, which is the Canteen’s sole responsibility.`,
      ],
    },
    {
      heading: '9. Limitation of Liability',
      body: [
        `To the maximum extent permitted by law, ${LEGAL.brand} and its officers, employees, and partners shall not be liable for any indirect, incidental, special, or consequential damages, or for any food-related illness, injury, or loss, which is the responsibility of the Canteen.`,
        `Our total aggregate liability for any claim arising out of or relating to the Platform shall not exceed the amount you paid for the specific order giving rise to the claim.`,
      ],
    },
    {
      heading: '10. Indemnity',
      body: [
        `You agree to indemnify and hold harmless ${LEGAL.company} from any claims, damages, or expenses arising from your breach of these Terms or misuse of the Platform.`,
      ],
    },
    {
      heading: '11. Suspension & Termination',
      body: [
        'We may suspend or terminate your access at any time for breach of these Terms, suspected fraud, or as required by law. You may stop using the Platform and delete your account at any time from Profile → Delete Account.',
      ],
    },
    {
      heading: '12. Governing Law & Disputes',
      body: [
        `These Terms are governed by the laws of India. Subject to the grievance process below, the courts at ${LEGAL.jurisdiction} shall have exclusive jurisdiction.`,
      ],
    },
    {
      heading: '13. Changes to Terms',
      body: [
        'We may update these Terms from time to time. Continued use after changes become effective constitutes acceptance. The "Last updated" date reflects the latest version.',
      ],
    },
    {
      heading: '14. Grievance Officer',
      body: [
        `In accordance with the Information Technology Act, 2000 and rules thereunder, the Grievance Officer is: ${LEGAL.grievanceOfficer}, Email: ${LEGAL.grievanceEmail}, Phone: ${LEGAL.phone}. We aim to acknowledge grievances within 48 hours and resolve them within 30 days.`,
      ],
    },
  ],
};

const PRIVACY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  sections: [
    {
      heading: '1. Introduction',
      body: [
        `This Privacy Policy explains how ${LEGAL.company} ("${LEGAL.brand}") collects, uses, shares, and protects your personal data when you use the Platform, in accordance with India’s Digital Personal Data Protection Act, 2023 (DPDP) and the Information Technology Act, 2000.`,
      ],
    },
    {
      heading: '2. Data We Collect',
      body: [
        'Account data: your name, email address, phone number, and the institute you select.',
        'Order data: items ordered, amounts, order history, pickup QR tokens, and timestamps.',
        'Payment data: handled by our payment gateway (e.g., Razorpay). We receive a payment reference/status but do not store your full card or bank details.',
        'Technical data: device type, app version, IP address, and basic usage/diagnostic information to keep the service secure and reliable.',
      ],
    },
    {
      heading: '3. How We Use Your Data',
      body: [
        'To create and manage your account; to process and fulfil orders; to generate pickup QR codes; to process payments and refunds; to provide customer support; to prevent fraud and misuse; to comply with legal obligations; and to improve the Platform.',
        'We process your data based on your consent and to perform the services you request, as permitted under the DPDP Act.',
      ],
    },
    {
      heading: '4. Who We Share Data With',
      body: [
        'Canteens & Institutes: order details necessary to prepare and hand over your order.',
        'Payment gateway (e.g., Razorpay): to process transactions and refunds.',
        'Infrastructure providers (e.g., Supabase, Vercel) that host and run the Platform on our behalf under appropriate safeguards.',
        'Authorities: where required by law, legal process, or to protect rights and safety.',
        'We do not sell your personal data.',
      ],
    },
    {
      heading: '5. Data Retention',
      body: [
        'We retain personal data for as long as your account is active or as needed to provide the service, comply with legal/tax obligations, resolve disputes, and enforce agreements. Order and transaction records may be retained for the period required by law.',
      ],
    },
    {
      heading: '6. Your Rights (DPDP Act)',
      body: [
        'You have the right to access, correct, and update your personal data; to withdraw consent; to request erasure of your data; and to grievance redressal. You can manage your data from your Profile, or contact our Grievance Officer.',
        'Erasing your account may limit or end your ability to use the Platform. Certain records may be retained where required by law.',
      ],
    },
    {
      heading: '7. Security',
      body: [
        'We use reasonable technical and organisational measures, including encryption of sensitive secrets, access controls, and row-level security, to protect your data. However, no method of transmission or storage is 100% secure.',
      ],
    },
    {
      heading: '8. Children & Minors',
      body: [
        'The Platform is intended for college/university students. If you are under 18, you may use it only with the consent of a parent or legal guardian, as required under the DPDP Act.',
      ],
    },
    {
      heading: '9. Cookies & Local Storage',
      body: [
        'We use cookies/local storage for authentication (keeping you signed in), preferences, and basic analytics necessary to operate the Platform.',
      ],
    },
    {
      heading: '10. Grievances & Contact',
      body: [
        `For any privacy questions or to exercise your rights, contact our Grievance Officer: ${LEGAL.grievanceOfficer}, Email: ${LEGAL.grievanceEmail}, Phone: ${LEGAL.phone}, Address: ${LEGAL.address}. We respond in accordance with the DPDP Act and IT Rules.`,
      ],
    },
    {
      heading: '11. Changes',
      body: [
        'We may update this Policy. Material changes will be notified in-app or by email where appropriate. The "Last updated" date reflects the latest version.',
      ],
    },
  ],
};

const REFUNDS: LegalDoc = {
  slug: 'refunds',
  title: 'Refund & Cancellation Policy',
  sections: [
    {
      heading: '1. Cancellations by You',
      body: [
        'You may cancel an order before the Canteen accepts/starts preparing it, from the order screen. Once preparation has begun, cancellation may not be possible.',
      ],
    },
    {
      heading: '2. When You Get a Refund',
      body: [
        'You are eligible for a full refund if: the Canteen rejects your order; a paid item is unavailable; the order cannot be fulfilled due to the Canteen; or a payment is charged but the order is not confirmed.',
        'If you are charged twice for the same order due to a technical error, the duplicate amount is refunded in full.',
      ],
    },
    {
      heading: '3. When Refunds May Not Apply',
      body: [
        'No-shows: if your order is prepared and ready but you do not collect it within the pickup window, it may not be refundable.',
        'Change of mind after preparation has started.',
        'Issues you do not report within a reasonable time (see below).',
      ],
    },
    {
      heading: '4. Refund Method & Timeline',
      body: [
        'Approved refunds are made to your original payment method via the payment gateway. Refunds typically reflect within 5–7 business days, depending on your bank/provider.',
      ],
    },
    {
      heading: '5. How to Request a Refund',
      body: [
        'Raise a support ticket from Profile → Help & Support with your order number and a description of the issue. We will review with the Canteen and respond as quickly as possible.',
      ],
    },
  ],
};

const SHIPPING: LegalDoc = {
  slug: 'shipping',
  title: 'Order Fulfilment & Pickup Policy',
  sections: [
    {
      heading: '1. Pickup, Not Delivery',
      body: [
        `${LEGAL.brand} is a self-pickup ordering platform. There is no physical shipping or home delivery. You collect your order in person at the selected Canteen on your campus.`,
      ],
    },
    {
      heading: '2. How Pickup Works',
      body: [
        'After successful payment, your order is confirmed and you receive a single-use QR code and a token number. When your order is ready, present the QR code at the Canteen kiosk/counter to collect it.',
      ],
    },
    {
      heading: '3. Pickup Window & Validity',
      body: [
        'QR codes are valid for a limited time (typically 3 hours) and are single-use. Please collect within the pickup window. Uncollected orders may not be refundable (see Refund & Cancellation Policy).',
      ],
    },
    {
      heading: '4. Order Readiness',
      body: [
        'Preparation time depends on the Canteen and current demand (e.g., peak lunch hours). Estimated times shown in the app are indicative.',
      ],
    },
  ],
};

const CONTACT: LegalDoc = {
  slug: 'contact',
  title: 'Contact Us',
  sections: [
    {
      heading: 'Get in Touch',
      body: [
        `${LEGAL.company} (${LEGAL.brand})`,
        `Address: ${LEGAL.address}`,
        `Support email: ${LEGAL.email}`,
        `Phone: ${LEGAL.phone}`,
      ],
    },
    {
      heading: 'Grievance Officer',
      body: [
        `Name: ${LEGAL.grievanceOfficer}`,
        `Email: ${LEGAL.grievanceEmail}`,
        'As per the IT Act and rules, we aim to acknowledge grievances within 48 hours and resolve them within 30 days.',
      ],
    },
    {
      heading: 'Support Tickets',
      body: [
        'For order issues, refunds, or account help, the fastest way to reach us is to raise a ticket from Profile → Help & Support inside the app.',
      ],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [TERMS, PRIVACY, REFUNDS, SHIPPING, CONTACT];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}
