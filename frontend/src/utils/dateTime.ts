// HTML datetime-local inputs expect a local wall-clock value, not a UTC ISO string.
export const toLocalDateTimeInput = (value: string | Date) => {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
