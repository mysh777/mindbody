import { supabase } from './supabase';

export class NotSignedInError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'NotSignedInError';
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new NotSignedInError();
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}
