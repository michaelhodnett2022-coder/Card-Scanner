// On-device OCR (Tesseract.js, vendored locally) plus heuristics that turn
// raw recognized text from a business card into structured contact fields.
// The worker/library code ships with the app; only the WASM engine and the
// English language model are fetched on first use (and cached by Tesseract.js
// for offline reuse afterwards).

const OCR = {
  _worker: null,

  async recognize(canvasOrImage, onProgress) {
    if (!window.Tesseract) {
      await loadScript('js/vendor/tesseract.min.js');
    }
    if (!this._worker) {
      this._worker = await Tesseract.createWorker('eng', 1, {
        workerPath: 'js/vendor/worker.min.js',
        logger: m => {
          if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
        }
      });
    }
    const { data } = await this._worker.recognize(canvasOrImage);
    return data.text;
  }
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

// ---------- Business card field extraction ----------

const TITLE_WORDS = [
  'manager', 'director', 'president', 'ceo', 'cfo', 'coo', 'cto', 'founder',
  'owner', 'sales', 'engineer', 'consultant', 'representative', 'executive',
  'partner', 'principal', 'coordinator', 'specialist', 'analyst', 'officer',
  'lead', 'head of', 'vice president', 'vp ', 'supervisor', 'technician',
  'administrator', 'accountant', 'architect', 'designer', 'developer'
];
const COMPANY_WORDS = [
  'pty', 'ltd', 'llc', 'inc', 'co.', 'corp', 'group', 'company', 'holdings',
  'enterprises', 'solutions', 'services', 'industries', 'partners'
];
const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

function extractContact(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0].replace(/^[^a-zA-Z0-9]+/, '') : '';

  const phoneMatches = [...rawText.matchAll(/(\+?\(?\d[\d\s().-]{6,}\d)/g)]
    .map(m => m[0].trim())
    .filter(p => p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15);
  const phones = dedupe(phoneMatches);

  const urlMatch = rawText.match(/\b((https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.(com|net|org|com\.au|net\.au|org\.au|io|co)(\.[a-z]{2})?(\/\S*)?)\b/i);
  let website = urlMatch ? urlMatch[0] : '';
  if (website && email && website.includes(email.split('@')[1]) && !/^https?:/i.test(website) && website.split('.').length <= 2) {
    // Avoid mistaking the email domain fragment for a website when it's not a real match
  }

  const usedLines = new Set();
  const isNoise = (line) => {
    if (email && line.includes(email)) return true;
    if (website && line.includes(website)) return true;
    if (phones.some(p => line.includes(p))) return true;
    return false;
  };

  let title = '';
  let company = '';
  let name = '';
  let address = [];

  for (const line of lines) {
    if (usedLines.has(line) || isNoise(line)) continue;
    const lower = line.toLowerCase();
    if (!title && TITLE_WORDS.some(w => lower.includes(w))) {
      title = line;
      usedLines.add(line);
    }
  }

  for (const line of lines) {
    if (usedLines.has(line) || isNoise(line)) continue;
    const lower = line.toLowerCase();
    if (!company && COMPANY_WORDS.some(w => lower.includes(w))) {
      company = line;
      usedLines.add(line);
    }
  }

  for (const line of lines) {
    if (usedLines.has(line) || isNoise(line)) continue;
    const hasDigits = /\d/.test(line);
    const isAddressish = AU_STATES.some(s => new RegExp(`\\b${s}\\b`).test(line)) || /\b\d{4}\b/.test(line) ||
      /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|highway|hwy|suite|level|floor)\b/i.test(line);
    if (isAddressish) {
      address.push(line);
      usedLines.add(line);
    }
  }

  // First remaining short, digit-free line is the most likely candidate for a person's name.
  for (const line of lines) {
    if (usedLines.has(line) || isNoise(line)) continue;
    const wordCount = line.split(' ').length;
    if (!/\d/.test(line) && wordCount >= 2 && wordCount <= 4 && line.length <= 40) {
      name = line;
      usedLines.add(line);
      break;
    }
  }

  if (!company) {
    // Fall back to the longest remaining unclassified line.
    const rest = lines.filter(l => !usedLines.has(l) && !isNoise(l));
    if (rest.length) {
      company = rest.sort((a, b) => b.length - a.length)[0];
      usedLines.add(company);
    }
  }

  if (!name) {
    const rest = lines.filter(l => !usedLines.has(l) && !isNoise(l));
    if (rest.length) name = rest[0];
  }

  return {
    name: name || '',
    title: title || '',
    company: company || '',
    phone1: phones[0] || '',
    phone2: phones[1] || '',
    email: email || '',
    website: website || '',
    address: address.join(', '),
    rawText
  };
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(x => {
    const key = x.replace(/\D/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildVCard(fields, photoBase64) {
  const nameParts = (fields.name || '').trim().split(' ');
  const first = nameParts.slice(0, -1).join(' ') || fields.name || '';
  const last = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${escapeVCard(last)};${escapeVCard(first)};;;`);
  lines.push(`FN:${escapeVCard(fields.name || 'Unknown')}`);
  if (fields.company) lines.push(`ORG:${escapeVCard(fields.company)}`);
  if (fields.title) lines.push(`TITLE:${escapeVCard(fields.title)}`);
  if (fields.phone1) lines.push(`TEL;TYPE=CELL:${fields.phone1}`);
  if (fields.phone2) lines.push(`TEL;TYPE=WORK:${fields.phone2}`);
  if (fields.email) lines.push(`EMAIL:${fields.email}`);
  if (fields.website) lines.push(`URL:${fields.website.replace(/^(?!https?:\/\/)/, 'https://')}`);
  if (fields.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(fields.address)};;;;`);
  lines.push(`NOTE:Scanned with Card & Doc Scanner on ${new Date().toLocaleDateString()}`);
  if (photoBase64) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photoBase64}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function escapeVCard(str) {
  return String(str).replace(/([,;\\])/g, '\\$1');
}

if (typeof window !== 'undefined') {
  window.OCR = OCR;
  window.extractContact = extractContact;
  window.buildVCard = buildVCard;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractContact, buildVCard };
}
