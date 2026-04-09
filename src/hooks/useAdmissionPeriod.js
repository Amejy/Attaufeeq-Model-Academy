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

function useAdmissionPeriod() {
  const { apiJson } = useAuth();
  const [admissionPeriod, setAdmissionPeriod] = useState(defaultPeriod);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAdmissionPeriod() {
      try {
        const data = await apiJson('/admissions/period', { omitAuth: true });

        if (!cancelled) {
          setAdmissionPeriod({
            ...defaultPeriod,
            ...(data.admissionPeriod || {})
          });
        }
      } catch {
        if (!cancelled) {
          setAdmissionPeriod(defaultPeriod);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadAdmissionPeriod();

    return () => {
      cancelled = true;
    };
  }, [apiJson]);

  return {
    admissionPeriod,
    isLoading,
    periodOpen: admissionPeriod.isOpen !== false
  };
}

export default useAdmissionPeriod;
