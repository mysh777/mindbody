import { useState, useEffect, useCallback } from 'react';
import { resolveSection, type MenuSection } from '../lib/pages';

function parseQuery(query: string | undefined): Record<string, string> {
  const params: Record<string, string> = {};
  if (query) {
    for (const part of query.split('&')) {
      const [k, v] = part.split('=');
      if (k && v !== undefined) params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return params;
}

export function parseHash(hash: string = window.location.hash): { section: MenuSection; params: Record<string, string>; redirected: boolean } {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const { section, redirected, params: redirectParams } = resolveSection(path);
  return { section, params: { ...redirectParams, ...parseQuery(query) }, redirected };
}

export function buildHash(section: MenuSection, params?: Record<string, string>): string {
  let h = `#/${section}`;
  if (params && Object.keys(params).length > 0) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) h += `?${qs}`;
  }
  return h;
}

function readLocation() {
  const { section, params, redirected } = parseHash();
  if (redirected) window.history.replaceState(null, '', buildHash(section, params));
  return { section, params };
}

export function useHashRouter() {
  const [state, setState] = useState(readLocation);

  useEffect(() => {
    const onHashChange = () => setState(readLocation());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((section: MenuSection, params?: Record<string, string>) => {
    const hash = buildHash(section, params);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setState({ section, params: params || {} });
  }, []);

  const setParams = useCallback((params: Record<string, string>) => {
    setState(prev => {
      const hash = buildHash(prev.section, params);
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
      return { ...prev, params };
    });
  }, []);

  return {
    section: state.section,
    params: state.params,
    navigate,
    setParams,
  };
}

export function buildReportUrl(section: MenuSection, params?: Record<string, string>): string {
  const base = window.location.origin + window.location.pathname;
  return base + buildHash(section, params);
}
