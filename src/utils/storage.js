const STORAGE_KEY = 'dpv_credentials';

export async function getAllCredentials() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function saveCredential(cred) {
  const all = await getAllCredentials();
  const idx = all.findIndex(c => c.id === cred.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...cred, updatedAt: Date.now() };
  } else {
    all.push({ ...cred, createdAt: Date.now(), updatedAt: Date.now() });
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  return all;
}

export async function deleteCredential(id) {
  const all = await getAllCredentials();
  const filtered = all.filter(c => c.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  return filtered;
}

export async function exportData() {
  const all = await getAllCredentials();
  return JSON.stringify({ version: 1, credentials: all, exportedAt: Date.now() }, null, 2);
}

export async function importData(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.credentials || !Array.isArray(data.credentials)) {
    throw new Error('Invalid format');
  }
  const existing = await getAllCredentials();
  const existingIds = new Set(existing.map(c => c.id));
  const toAdd = data.credentials.filter(c => !existingIds.has(c.id));
  const merged = [...existing, ...toAdd];
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return { added: toAdd.length, total: merged.length };
}
