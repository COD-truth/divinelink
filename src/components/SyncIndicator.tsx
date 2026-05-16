import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { onSyncStatus, syncNow, type SyncStatus } from '@/lib/supabaseSync';
import { useLang } from '@/contexts/LangContext';

export function SyncIndicator() {
  const { t } = useLang();
  const [status, setStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    const unsub = onSyncStatus(setStatus);
    return unsub;
  }, []);

  // Hide entirely when unconfigured
  if (status === 'unconfigured') return null;

  const handleClick = () => {
    syncNow().catch(() => { /* errors handled inside syncNow */ });
  };

  const label = (() => {
    switch (status) {
      case 'syncing':   return t('sync.status.syncing');
      case 'success':   return t('sync.status.success');
      case 'error':     return t('sync.status.error');
      case 'offline':   return t('sync.status.offline');
      default:          return t('sync.status.idle');
    }
  })();

  const icon = (() => {
    switch (status) {
      case 'syncing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'offline':
        return <CloudOff className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Cloud className="w-4 h-4 text-muted-foreground" />;
    }
  })();

  const colorClass = (() => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error':   return 'text-destructive';
      case 'offline': return 'text-muted-foreground';
      case 'syncing': return 'text-primary';
      default:        return 'text-muted-foreground';
    }
  })();

  return (
    <button
      onClick={handleClick}
      title={status === 'error' ? t('sync.manualSync') : label}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors text-xs ${colorClass}`}
      disabled={status === 'syncing' || status === 'offline'}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
