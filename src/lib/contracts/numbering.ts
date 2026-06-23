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
