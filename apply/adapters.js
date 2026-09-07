// ATS-specific selectors and submission confirmation rules.

const GENERIC_FIELD_SELECTORS = {
  firstName: ['input[name*="first_name" i]', 'input[name*="first" i]', 'input[id*="first" i]'],
  lastName: ['input[name*="last_name" i]', 'input[name*="last" i]', 'input[id*="last" i]'],
  name: ['input[name*="name" i]', 'input[id*="name" i]', 'input[placeholder*="name" i]', 'input[name="your-name"]'],
  email: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]', 'input[name="your-email"]'],
  phone: ['input[type="tel"]', 'input[name*="phone" i]', 'input[id*="phone" i]', 'input[name="your-phone"]'],
  portfolio: ['input[name*="website" i]', 'input[name*="portfolio" i]', 'input[name*="urls" i]', 'input[placeholder*="website" i]'],
  linkedin: ['input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]'],
  github: ['input[name*="github" i]', 'input[placeholder*="github" i]'],
  coverLetter: ['textarea[name*="cover" i]', 'textarea[id*="cover" i]', 'textarea[placeholder*="cover" i]', 'textarea[name="your-message"]', 'textarea[placeholder*="letter" i]'],
};

const GENERIC_UPLOAD_SELECTORS = [
  'input[type="file"][accept*="pdf"]',
  'input[type="file"][name*="resume" i]',
  'input[type="file"][name*="cv" i]',
  'input[type="file"][id*="resume" i]',
  'input[type="file"][id*="cv" i]',
  'input[type="file"]',
];

const ADAPTERS = [
  {
    id: 'greenhouse',
    hosts: ['greenhouse.io'],
    submitSelectors: ['#submit_app', 'button[type="submit"]', 'input[type="submit"]'],
    submitText: [/submit application/i, /^submit$/i],
    confirmationSelectors: ['.application-confirmation', '[data-testid*="confirmation" i]'],
    confirmationText: [/thanks for applying/i, /application (?:has been )?submitted/i, /application received/i],
    uploadSelectors: ['input[type="file"][name*="resume" i]', ...GENERIC_UPLOAD_SELECTORS],
    fields: {},
  },
  {
    id: 'lever',
    hosts: ['lever.co'],
    submitSelectors: ['button[type="submit"]', '.posting-btn-submit'],
    submitText: [/submit application/i, /^submit$/i],
    confirmationSelectors: ['.confirmation-page', '[data-qa="confirmation"]'],
    confirmationText: [/application (?:was )?received/i, /thanks for applying/i, /successfully submitted/i],
    uploadSelectors: ['input[type="file"][name*="resume" i]', ...GENERIC_UPLOAD_SELECTORS],
    fields: {},
  },
  {
    id: 'workable',
    hosts: ['workable.com'],
    submitSelectors: ['button[type="submit"]', '[data-ui="submit-button"]'],
    submitText: [/submit application/i, /send application/i, /^submit$/i],
    confirmationSelectors: ['[data-ui="thank-you"]', '[data-ui*="success" i]'],
    confirmationText: [/application sent/i, /thanks for applying/i, /application received/i],
    uploadSelectors: ['input[type="file"][name*="resume" i]', ...GENERIC_UPLOAD_SELECTORS],
    fields: {},
  },
  {
    id: 'ashby',
    hosts: ['ashbyhq.com'],
    submitSelectors: ['button[type="submit"]'],
    submitText: [/submit application/i, /^submit$/i],
    confirmationSelectors: ['[data-testid*="success" i]', '[data-testid*="confirmation" i]'],
    confirmationText: [/application submitted/i, /thanks for applying/i, /successfully applied/i],
    uploadSelectors: ['input[type="file"]', ...GENERIC_UPLOAD_SELECTORS],
    fields: {},
  },
  {
    id: 'generic',
    hosts: [],
    submitSelectors: ['form button[type="submit"]', 'form input[type="submit"]'],
    submitText: [/submit application/i, /send application/i],
    confirmationSelectors: ['[class*="thank" i]', '[class*="success" i]', '[id*="confirmation" i]'],
    confirmationText: [/application submitted/i, /application received/i, /thanks for applying/i, /thank you for applying/i],
    uploadSelectors: GENERIC_UPLOAD_SELECTORS,
    fields: {},
  },
];

export function getApplicationAdapter(url = '') {
  const lowerUrl = String(url).toLowerCase();
  return ADAPTERS.find(adapter => adapter.hosts.some(host => lowerUrl.includes(host))) || ADAPTERS[ADAPTERS.length - 1];
}

export function getFieldSelectors(adapter, field) {
  return adapter.fields?.[field] || GENERIC_FIELD_SELECTORS[field] || [];
}

export function getUploadSelectors(adapter) {
  return adapter.uploadSelectors || GENERIC_UPLOAD_SELECTORS;
}

export function isConfirmationText(text, adapter) {
  const content = String(text || '');
  return (adapter.confirmationText || []).some(pattern => pattern.test(content));
}

export function isConfirmationUrl(url = '') {
  return /(?:thank[-_ ]?you|confirmation|success|application[-_ ]?received|submitted)/i.test(String(url));
}

export const applicationAdapters = ADAPTERS;
