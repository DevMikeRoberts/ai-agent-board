import { useState, useEffect } from 'react';
import { getConnectionStatus, subscribeConnectionStatus, type ConnectionStatus } from '@/lib/api';

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(getConnectionStatus);

  useEffect(() => subscribeConnectionStatus(setStatus), []);

  return status;
}
