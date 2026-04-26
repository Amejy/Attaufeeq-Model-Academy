/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { resolveApiBaseUrl } from '../utils/apiBase';

const AuthContext = createContext(null);
const API_BASE_URL = resolveApiBaseUrl();
const AUTH_SESSION_FLAG = 'auth-active';
const AUTH_TOKEN_KEY = 'auth-token';
const AUTH_USER_KEY = 'auth-user';

function decodeTokenPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

async function parseJsonSafely(response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

function readSessionFlag() {
  try {
    return sessionStorage.getItem(AUTH_SESSION_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeSessionFlag(isActive) {
  try {
    if (isActive) {
      sessionStorage.setItem(AUTH_SESSION_FLAG, '1');
    } else {
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
    }
  } catch {
    // ignore storage failures
  }
}

function shouldBootstrapSession() {
  if (typeof window === 'undefined') return true;
  return window.location.pathname.startsWith('/portal') || readSessionFlag();
}

function isTokenUsable(token) {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return Boolean(token);
  return payload.exp * 1000 > Date.now() + 5_000;
}

function readStoredSession() {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    const rawUser = sessionStorage.getItem(AUTH_USER_KEY);
    if (!token || !rawUser || !isTokenUsable(token)) return null;
    return {
      token,
      user: JSON.parse(rawUser)
    };
  } catch {
    return null;
  }
}

function writeStoredSession(token, user) {
  try {
    if (token && user) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const tokenRef = useRef(null);
  const refreshInFlightRef = useRef(null);

  const persistSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    tokenRef.current = nextToken;
    writeStoredSession(nextToken, nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cachedSession = readStoredSession();

    if (cachedSession) {
      persistSession(cachedSession.token, cachedSession.user);
      setProfileReady(true);
    }

    async function bootstrapSession() {
      if (!shouldBootstrapSession()) {
        if (!cachedSession && !cancelled) {
          setProfileReady(true);
        }
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });
        if (!response.ok) return;

        const data = await response.json();
        if (cancelled) return;
        persistSession(data.token, data.user);
      } catch {
        // ignore boot-time refresh failures
      } finally {
        if (!cancelled && !cachedSession) {
          setProfileReady(true);
        }
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [persistSession]);

  const login = useCallback(({ token: nextToken, user: nextUser }) => {
    persistSession(nextToken, nextUser);
    setSessionExpired(false);
    writeSessionFlag(true);
    try {
      sessionStorage.removeItem('session-expired');
    } catch {
      // ignore storage failures
    }
  }, [persistSession]);

  const updateUser = useCallback((nextUser) => {
    setUser((previous) => {
      const resolved = typeof nextUser === 'function' ? nextUser(previous) : nextUser;
      writeStoredSession(tokenRef.current, resolved);
      return resolved;
    });
  }, []);

  const logout = useCallback(async (options = {}) => {
    const preserveSessionFlag = Boolean(options?.preserveSessionExpired);
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // ignore network failures on logout cleanup
    }

    setToken(null);
    setUser(null);
    setProfileReady(true);
    writeSessionFlag(false);
    writeStoredSession(null, null);
    if (!preserveSessionFlag) {
      setSessionExpired(false);
      try {
        sessionStorage.removeItem('session-expired');
      } catch {
        // ignore storage failures
      }
    }
    tokenRef.current = null;
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    refreshInFlightRef.current = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await parseJsonSafely(response);
      if (!response.ok) throw new Error(data.message || 'Session refresh failed.');
      login(data);
      return data;
    } catch {
      setSessionExpired(true);
      try {
        sessionStorage.setItem('session-expired', '1');
      } catch {
        // ignore storage failures
      }
      await logout({ preserveSessionExpired: true });
      return null;
    }
    })();

    try {
      return await refreshInFlightRef.current;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [login, logout]);

  const apiFetch = useCallback(async (path, options = {}) => {
    const {
      headers,
      retryOnUnauthorized = true,
      omitAuth = false,
      credentials = 'include',
      ...rest
    } = options;

    const requestHeaders = new Headers(headers || {});
    const currentToken = tokenRef.current;
    if (!omitAuth && currentToken && !requestHeaders.has('Authorization')) {
      requestHeaders.set('Authorization', `Bearer ${currentToken}`);
    }

    const run = () =>
      fetch(path.startsWith('http') ? path : `${API_BASE_URL}${path}`, {
        ...rest,
        headers: requestHeaders,
        credentials
      });

    let response = await run();
    if (response.status === 401 && retryOnUnauthorized && !omitAuth) {
      const refreshed = await refreshSession();
      if (refreshed?.token) {
        requestHeaders.set('Authorization', `Bearer ${refreshed.token}`);
        response = await run();
      }
    }

    return response;
  }, [refreshSession]);

  const apiJson = useCallback(async (path, options = {}) => {
    const requestOptions = { ...options };
    if (
      requestOptions.body &&
      !(requestOptions.body instanceof FormData) &&
      typeof requestOptions.body !== 'string'
    ) {
      const nextHeaders = new Headers(requestOptions.headers || {});
      if (!nextHeaders.has('Content-Type')) {
        nextHeaders.set('Content-Type', 'application/json');
      }
      requestOptions.headers = nextHeaders;
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    const response = await apiFetch(path, requestOptions);
    const data = await parseJsonSafely(response);

    if (!response.ok) {
      const error = new Error(data?.message || 'Request failed.');
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }, [apiFetch]);

  useEffect(() => {
    if (!token) return undefined;
    const payload = decodeTokenPayload(token);
    if (!payload?.exp) return undefined;

    const refreshAt = payload.exp * 1000 - 60 * 1000;
    const timeoutMs = Math.max(10_000, refreshAt - Date.now());

    const timer = setTimeout(() => {
      refreshSession();
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [token, refreshSession]);

  useEffect(() => {
    if (!token || !user?.id) return;
    if (user?.scopeHydrated) {
      setProfileReady(true);
      return;
    }

    let cancelled = false;
    const requestToken = token;

    async function hydrateScope() {
      setProfileReady(false);
      try {
        const response = await fetch(`${API_BASE_URL}/dashboard/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok || cancelled || tokenRef.current !== requestToken) return;

        updateUser((previous) => ({
          ...(previous || {}),
          ...(data.user || {}),
          scope: data.scope || data.user?.scope || previous?.scope || null,
          profile: data.profile || previous?.profile || null,
          scopeHydrated: true
        }));
      } catch {
        // ignore scope hydration failures; protected APIs still enforce access
      } finally {
        if (!cancelled) {
          setProfileReady(true);
        }
      }
    }

    hydrateScope();

    return () => {
      cancelled = true;
    };
  }, [token, updateUser, user?.id, user?.scopeHydrated]);

  const value = useMemo(
    () => ({
      token,
      user,
      profileReady,
      isAuthenticated: Boolean(token && user),
      sessionExpired,
      login,
      updateUser,
      logout,
      refreshSession,
      apiFetch,
      apiJson
    }),
    [token, user, profileReady, sessionExpired, login, updateUser, logout, refreshSession, apiFetch, apiJson]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
