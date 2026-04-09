import { useEffect, useMemo, useState } from 'react';

function readStoredValue(key) {
  if (typeof window === 'undefined' || !key) return '';
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStoredValue(key, value) {
  if (typeof window === 'undefined' || !key) return;
  try {
    if (value) {
      window.sessionStorage.setItem(key, value);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage access should never break the portal flow.
  }
}

function useParentChildSelection(role, user) {
  const storageKey = useMemo(() => {
    if (role !== 'parent') return '';
    const userKey = String(user?.sub || user?.email || '').trim().toLowerCase();
    return userKey ? `parent-child-scope:${userKey}` : '';
  }, [role, user?.email, user?.sub]);

  const [selectedChildId, setSelectedChildId] = useState(() => readStoredValue(storageKey));

  useEffect(() => {
    setSelectedChildId(readStoredValue(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (role !== 'parent') return;
    writeStoredValue(storageKey, selectedChildId);
  }, [role, selectedChildId, storageKey]);

  return [selectedChildId, setSelectedChildId];
}

export default useParentChildSelection;
