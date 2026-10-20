import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { ChevronDown, LogOut, User } from 'lucide-react';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  const email = user.email || '';
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-xs shrink-0">
          {initials}
        </div>
        <span className="hidden sm:inline max-w-[140px] truncate text-slate-700 font-medium">{email}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <User className="w-3.5 h-3.5" />
              Signed in as
            </div>
            <div className="text-sm font-medium text-slate-900 truncate mt-0.5">{email}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
