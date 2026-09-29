export function intakeCompanyName(
  clientType: string,
  clientName: string,
  companyName: string,
) {
  const name = companyName.trim();
  // The guided form requires only the customer name; company details are optional.
  return name || (clientType === "company" ? clientName.trim() : null);
}
