type DeliveryTerm = { title?: string; text: string };

const fallback = 'وفق شروط العقد';
const clauseStart = /^مدة\s+تنفيذ\s+المشروع(?:\s+للمراحل\s+الجاهزة)?\s+هي\s*\(/u;
const duration = /^مدة\s+تنفيذ\s+المشروع(?:\s+للمراحل\s+الجاهزة)?\s+هي\s*\(\s*([0-9٠-٩۰-۹]+)\s*\)([^\r\n]*)/u;

// The cover summarizes the saved delivery clause; it must not supply a new
// duration when a historical or custom contract does not state one clearly.
export function contractDeliverySummary(terms: readonly DeliveryTerm[] | null | undefined): string {
  const clauses = (terms ?? []).map(term => typeof term.text === 'string' ? term.text.trim() : '')
    .filter(text => clauseStart.test(text));
  if (clauses.length !== 1) return fallback;
  const match = clauses[0].match(duration);
  if (!match) return fallback;
  const digits = match[1].replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
  const days = Number(digits);
  if (!Number.isSafeInteger(days) || days <= 0) return fallback;
  const wording = match[2].replace(/[\u064b-\u065f\u0670\u0640]/g, '');
  const dayType = wording.match(/(?:^|\s)(?:يوم(?:ا)?|أيام|ايام)\s+([^\s،.;]+)/u)?.[1];
  if (dayType === 'عمل') return `${days} يوم عمل وفق شروط العقد`;
  if (dayType && /^تقويم(?:ي(?:ا)?|ية)$/u.test(dayType)) return `${days} يوم تقويمي وفق شروط العقد`;
  return fallback;
}
