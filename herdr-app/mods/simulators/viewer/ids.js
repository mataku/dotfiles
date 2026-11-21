const UDID = /^[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/;
const SERIAL = /^emulator-\d{4,5}$/;
const AVD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TTY = /^\/dev\/ttys\d{1,4}$/;
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);

export const isUdid = (value) => matches(UDID, value);
export const isSerial = (value) => matches(SERIAL, value);
export const isAvdId = (value) => matches(AVD_ID, value);
export const isTty = (value) => matches(TTY, value);
