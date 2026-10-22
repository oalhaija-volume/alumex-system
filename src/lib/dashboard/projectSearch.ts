type SearchableProject = {
  project_name: string;
  project_number: string;
  phone?: string | null;
  address?: string | null;
  governorate?: string | null;
};

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)))
    .trim();
}

export function matchesProjectSearch(project: SearchableProject, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = normalize([project.project_name, project.project_number, project.phone, project.address, project.governorate].filter(Boolean).join(' '));
  const phone = normalize(project.phone ?? '').replace(/\D/g, '');
  return terms.every(term => text.includes(term) || (
    /^[+\d().-]+$/.test(term) && !!term.replace(/\D/g, '') && phone.includes(term.replace(/\D/g, ''))
  ));
}
