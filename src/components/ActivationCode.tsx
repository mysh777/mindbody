import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Key, Copy, CheckCircle } from 'lucide-react';

export function ActivationCode() {
  const [loading, setLoading] = useState(false);
  const [activationData, setActivationData] = useState<{
    code: string;
    link: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateActivationCode = async () => {
    setLoading(true);
    setError(null);
    setActivationData(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-activation-code`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate activation code');
      }

      setActivationData({
        code: data.activationCode,
        link: data.activationLink,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-blue-100 p-3 rounded-lg">
          <Key className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Site Activation</h2>
          <p className="text-sm text-slate-600">Generate activation code for Mindbody site access</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-900 mb-2">Important: Required Setup Step</h3>
          <p className="text-sm text-amber-800 mb-3">
            Before you can sync data from Mindbody, the site owner must approve your access:
          </p>
          <ol className="text-sm text-amber-800 space-y-2 list-decimal list-inside">
            <li>Click "Generate Activation Code" below</li>
            <li>Send the activation link or code to the Mindbody site owner</li>
            <li>The owner must log in and approve the integration at: <span className="font-mono bg-amber-100 px-1 rounded">Settings → API Integrations</span></li>
            <li>Once approved, you can start syncing data</li>
          </ol>
        </div>

        <button
          onClick={generateActivationCode}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Key className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Generating...' : 'Generate Activation Code'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-900 mb-1">Error</p>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {activationData && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 text-green-800 mb-3">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Activation Code Generated!</span>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Activation Link (Send this to site owner)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={activationData.link}
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-sm font-mono"
                />
                <button
                  onClick={() => copyToClipboard(activationData.link)}
                  className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Activation Code (Alternative - owner can enter manually)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={activationData.code}
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-sm font-mono"
                />
                <button
                  onClick={() => copyToClipboard(activationData.code)}
                  className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-900">
                <strong>Next step:</strong> Send the activation link to your Mindbody site owner.
                They need to click it or enter the code at Settings → API Integrations in their Mindbody dashboard.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
