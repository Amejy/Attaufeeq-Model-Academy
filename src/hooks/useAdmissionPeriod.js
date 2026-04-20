import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const defaultPeriod = {
  enabled: false,
  isOpen: false,
  guardianEmailRequired: false,
  startDate: '',
  endDate: '',
  programs: {
    modern: { enabled: true, startDate: '', endDate: '', isOpen: false },
    madrasa: { enabled: true, startDate: '', endDate: '', isOpen: false },
    memorization: { enabled: true, startDate: '', endDate: '', isOpen: false }
  }
};

let cachedAdmissionPeriod = defaultPeriod;
let cachedAdmissionLoading = false;
let admissionPeriodLoaded = false;
let admissionPeriodPromise = null;
const listeners = new Set();

function emitChange() {
  listeners.forEach((listener) => listener());
}

async function loadAdmissionPeriod(apiJson) {
  if (admissionPeriodPromise) return admissionPeriodPromise;

  cachedAdmissionLoading = true;
  emitChange();

  admissionPeriodPromise = (async () => {
    try {
      const data = await apiJson('/admissions/period', { omitAuth: true });
      cachedAdmissionPeriod = {
        ...defaultPeriod,
        ...(data.admissionPeriod || {})
      };
    } catch {
      cachedAdmissionPeriod = defaultPeriod;
    } finally {
      cachedAdmissionLoading = false;
      admissionPeriodLoaded = true;
      admissionPeriodPromise = null;
      emitChange();
    }

    return cachedAdmissionPeriod;
  })();

  return admissionPeriodPromise;
}

function useAdmissionPeriod() {
  const { apiJson } = useAuth();
  const [state, setState] = useState(() => ({
    admissionPeriod: cachedAdmissionPeriod,
    isLoading: cachedAdmissionLoading || !admissionPeriodLoaded
  }));

  useEffect(() => {
    let cancelled = false;

    function syncState() {
      if (cancelled) return;
      setState({
        admissionPeriod: cachedAdmissionPeriod,
        isLoading: cachedAdmissionLoading || !admissionPeriodLoaded
      });
    }

    listeners.add(syncState);
    syncState();

    if (!admissionPeriodLoaded && !admissionPeriodPromise) {
      void loadAdmissionPeriod(apiJson);
    }

    return () => {
      cancelled = true;
      listeners.delete(syncState);
    };
  }, [apiJson]);

  return {
    admissionPeriod: state.admissionPeriod,
    isLoading: state.isLoading,
    periodOpen: state.admissionPeriod.isOpen !== false
  };
}

export default useAdmissionPeriod;
