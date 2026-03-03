import { useState, useEffect } from 'react';
import { getConnectionStatus, subscribeConnectionStatus, hasEverConnected, type ConnectionStatus } from '@/lib/api';

export function useConnectionStatus(): { status: ConnectionStatus; wasConnected: boolean } {
  const [status, setStatus] = useState<ConnectionStatus>(getConnectionStatus);
  const [wasConnected, setWasConnected] = useState(hasEverConnected);

  useEffect(() => subscribeConnectionStatus((s) => {
    setStatus(s);
    if (s === 'connected') setWasConnected(true);
  }), []);

  return { status, wasConnected };
}
