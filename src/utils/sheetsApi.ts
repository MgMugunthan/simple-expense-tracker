export interface Expense {
  id: string;
  name: string;
  amount: number;
  image: string | null;
}

export interface Contributor {
  id: string;
  name: string;
  amount: number;
  photo: string | null;
}

export interface SharedSheetData {
  expenses: Expense[];
  contributions: Contributor[];
  totalAmount: number;
}

interface AppsScriptResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  authenticated?: boolean;
}

export const SPREADSHEET_ID = '1Nj_19SGCW1ti5FPtGiyPAGFFOiUMSH-Ey5nCfS--JLI';
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbykCi7J8K9XVTP_mSThCKbPnV0E8lCiFxqgHA3tS3uNfQhYsf3GPSMWUePDgzYIz8wI-g/exec';

const CALLBACK_NAME_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/;

export function createUniqueId(prefix: 'exp' | 'con'): string {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeExpenses(raw: unknown): Expense[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? '').trim();
    const name = String(record.name ?? '').trim();
    const amount = Number(record.amount);
    const imageVal = typeof record.image === 'string' && record.image.trim() !== '' ? record.image : null;
    if (!id || !name || !Number.isFinite(amount)) return null;
    return { id, name, amount, image: imageVal };
  }).filter((item): item is Expense => item !== null);
}

function normalizeContributions(raw: unknown): Contributor[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? '').trim();
    const name = String(record.name ?? '').trim();
    const amount = Number(record.amount);
    const photoValue = record.photo ?? record.image;
    const photo = typeof photoValue === 'string' && photoValue.trim() !== '' ? photoValue : null;
    if (!id || !name || !Number.isFinite(amount)) return null;
    return { id, name, amount, photo };
  }).filter((item): item is Contributor => item !== null);
}

export function fetchSharedSheetData(): Promise<SharedSheetData> {
  return new Promise((resolve, reject) => {
    const callbackName = '__gsCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    if (!CALLBACK_NAME_REGEX.test(callbackName)) {
      reject(new Error('Invalid JSONP callback name.'));
      return;
    }

    let settled = false;
    let scriptEl: HTMLScriptElement | null = null;
    const win = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
      delete win[callbackName];
    };

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Timed out while loading data from Google Sheets. Check your connection and Apps Script deployment.'));
    }, 15000);

    win[callbackName] = (response: AppsScriptResponse<Record<string, unknown>>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      if (!response || response.ok !== true || !response.data) {
        reject(new Error(response?.error || 'Failed to read shared data from Google Sheets.'));
        return;
      }
      const total = Number(response.data.totalAmount);
      resolve({
        expenses: normalizeExpenses(response.data.expenses),
        contributions: normalizeContributions(response.data.contributions),
        totalAmount: Number.isFinite(total) && total >= 0 ? total : 0,
      });
    };

    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', 'getAll');
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_t', String(Date.now()));
    scriptEl = document.createElement('script');
    scriptEl.src = url.toString();
    scriptEl.async = true;
    scriptEl.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Unable to connect to Google Sheets. Check the Apps Script Web App deployment and network connection.'));
    };
    document.head.appendChild(scriptEl);
  });
}

function postToAppsScript(payload: Record<string, unknown>): Promise<AppsScriptResponse> {
  return new Promise((resolve, reject) => {
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const iframeName = 'gs_post_' + requestId;
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = APPS_SCRIPT_URL;
    form.target = iframeName;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify({ ...payload, requestId });
    form.appendChild(input);

    let finished = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (form.parentNode) form.parentNode.removeChild(form);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('The Google Sheets request timed out. Please refresh and check whether the change was saved.'));
    }, 20000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || !event.data || event.data.requestId !== requestId) return;
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      cleanup();
      if (event.data.response && typeof event.data.response.ok === 'boolean') {
        resolve(event.data.response as AppsScriptResponse);
      } else {
        reject(new Error('Received an invalid response from Google Apps Script.'));
      }
    };

    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

export async function verifyAdminPassword(password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error('Please enter the admin password.');
  const response = await postToAppsScript({ action: 'verifyAdmin', password: trimmed });
  if (!response.ok || !response.authenticated) {
    throw new Error(response.error || 'Invalid admin password.');
  }
}

async function performWriteAndVerify(
  payload: Record<string, unknown>,
  verifyFn: (data: SharedSheetData) => boolean,
  verificationErrorMessage: string
): Promise<SharedSheetData> {
  const response = await postToAppsScript(payload);
  if (!response.ok) throw new Error(response.error || 'Failed to save changes to Google Sheets.');
  const latest = await fetchSharedSheetData();
  if (!verifyFn(latest)) throw new Error(verificationErrorMessage);
  return latest;
}

export async function saveTotalBudget(password: string, amount: number): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'setTotal', password, amount },
    (data) => Math.abs(data.totalAmount - amount) < 0.005,
    'Could not confirm the updated total budget in Google Sheets.'
  );
}

export async function addExpenseToSheet(password: string, expense: Expense): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'addExpense', password, id: expense.id, name: expense.name, amount: expense.amount, image: expense.image ?? '' },
    (data) => data.expenses.some((item) => item.id === expense.id && item.name === expense.name && Math.abs(item.amount - expense.amount) < 0.005),
    'Could not confirm the new expense in Google Sheets.'
  );
}

export async function updateExpenseInSheet(password: string, expense: { id: string; name: string; amount: number }): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'updateExpense', password, id: expense.id, name: expense.name, amount: expense.amount },
    (data) => data.expenses.some((item) => item.id === expense.id && item.name === expense.name && Math.abs(item.amount - expense.amount) < 0.005),
    'Could not confirm the expense update in Google Sheets.'
  );
}

export async function deleteExpenseFromSheet(password: string, id: string): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'deleteExpense', password, id },
    (data) => !data.expenses.some((item) => item.id === id),
    'Could not confirm expense deletion in Google Sheets.'
  );
}

export async function resetExpensesInSheet(password: string): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'resetExpenses', password },
    (data) => data.expenses.length === 0 && data.totalAmount === 0,
    'Could not confirm reset in Google Sheets.'
  );
}

export async function addContributionToSheet(password: string, contributor: Contributor): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'addContribution', password, id: contributor.id, name: contributor.name, amount: contributor.amount, photo: contributor.photo ?? '' },
    (data) => data.contributions.some((item) => item.id === contributor.id && item.name === contributor.name && Math.abs(item.amount - contributor.amount) < 0.005),
    'Could not confirm the new contribution in Google Sheets.'
  );
}

export async function updateContributionInSheet(password: string, contributor: { id: string; name: string; amount: number }): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'updateContribution', password, id: contributor.id, name: contributor.name, amount: contributor.amount },
    (data) => data.contributions.some((item) => item.id === contributor.id && item.name === contributor.name && Math.abs(item.amount - contributor.amount) < 0.005),
    'Could not confirm the contribution update in Google Sheets.'
  );
}

export async function deleteContributionFromSheet(password: string, id: string): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'deleteContribution', password, id },
    (data) => !data.contributions.some((item) => item.id === id),
    'Could not confirm contribution deletion in Google Sheets.'
  );
}

export async function clearContributionsInSheet(password: string): Promise<SharedSheetData> {
  return performWriteAndVerify(
    { action: 'clearContributions', password },
    (data) => data.contributions.length === 0,
    'Could not confirm clearing contributions in Google Sheets.'
  );
}
