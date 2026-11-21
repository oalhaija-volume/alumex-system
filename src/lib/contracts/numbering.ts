// Workflow references retain the project number and approved revision, so a
// later contract revision cannot reuse an earlier reference. Governorates
// work is issued by the Karkh office unless its effective branch is Najaf.
export function formatWorkflowContractNumber(branch: unknown, projectNumber: string, revision: number) {
  const prefix = branch === 'Karkh' || branch === 'Governorates' ? 'KH'
    : branch === 'Rasafa' ? 'RA' : branch === 'Najaf' ? 'NAJ' : null;
  if (!prefix) throw new Error('Ask Admin to assign your branch before generating a contract.');
  if (typeof projectNumber !== 'string' || !projectNumber.trim() || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Unable to generate a contract reference. Check the project number and workflow revision.');
  }
  return `${prefix}-${projectNumber}-${revision}`;
}

export function formatContractNumber(year: number, month: number, sequence: number) {
  const period = `${year}${month.toString().padStart(2, "0")}`;

  return `CT-${period}-${sequence.toString().padStart(4, "0")}`;
}

export function generateNextContractNumber({
  contractNumbers,
  reservedNumbers = [],
  date = new Date(),
}: {
  contractNumbers: string[];
  reservedNumbers?: string[];
  date?: Date;
}) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const prefix = `CT-${year}${month.toString().padStart(2, "0")}-`;
  const unavailableNumbers = new Set([
    ...contractNumbers,
    ...reservedNumbers,
  ]);
  let sequence = contractNumbers.reduce((highest, contractNumber) => {
    if (!contractNumber.startsWith(prefix)) {
      return highest;
    }

    const parsedSequence = Number(contractNumber.slice(prefix.length));
    return Number.isFinite(parsedSequence)
      ? Math.max(highest, parsedSequence)
      : highest;
  }, 0);
  let candidate = "";

  do {
    sequence += 1;
    candidate = formatContractNumber(year, month, sequence);
  } while (unavailableNumbers.has(candidate));

  return candidate;
}
