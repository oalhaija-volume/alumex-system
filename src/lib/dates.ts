// Business dates use Gregorian day/month/year and English digits in both languages.
const dateOptions: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Baghdad', calendar: 'gregory', numberingSystem: 'latn',
  day: '2-digit', month: '2-digit', year: 'numeric',
};
const dateFormatter = new Intl.DateTimeFormat('en-GB', dateOptions);
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  ...dateOptions, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function display(formatter: Intl.DateTimeFormat, value: Date | string | number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatter.format(date) : '—';
}
export function formatBusinessDate(value: Date | string | number) {
  return display(dateFormatter, value);
}
export function formatBusinessDateTime(value: Date | string | number) {
  return display(dateTimeFormatter, value);
}
