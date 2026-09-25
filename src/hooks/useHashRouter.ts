import { useState, useEffect, useCallback } from 'react';
import type { MenuSection } from '../components/Sidebar';

const DEFAULT_SECTION: MenuSection = 'api-integration';

const VALID_SECTIONS: Set<string> = new Set<MenuSection>([
  'api-integration', 'references', 'pivot-reports', 'clients-report',
  'staff-report', 'staff-pricelist', 'appointments', 'sales',
  'sales-report', 'sales-by-pricing', 'client-services', 'transactions',
  'sale-items', 'client-activity', 'client-card', 'expiring-packages',
  'linkage-health', 'margin-by-service', 'margin-by-staff', 'sleeping-clients',
]);

function parseHash(): { section: MenuSection; params: Record<string, string> } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query] = hash.split('?');
  const section = (VALID_SECTIONS.has(path) ? path : DEFAULT_SECTION) as MenuSection;
  const params: Record<string, string> = {};
  if (query) {
    for (const part of query.split('&')) {
      const [k, v] = part.split('=');
      if (k && v !== undefined) params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { section, params };
}

function buildHash(section: MenuSection, params?: Record<string, string>): string {
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

export function useHashRouter() {
  const [state, setState] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setState(parseHash());
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
