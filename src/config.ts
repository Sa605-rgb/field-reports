/**
 * Emulator reaches this computer through 10.0.2.2.
 * On a USB phone, run `adb reverse tcp:8787 tcp:8787` and use http://127.0.0.1:8787.
 */
export const API_URL = 'http://10.0.2.2:8787';

export const STALL_MS = 20_000;
export const JSON_TIMEOUT_MS = 20_000;
