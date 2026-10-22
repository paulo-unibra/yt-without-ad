import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { remainingSleepSeconds, sleepDeadline } from '../utils/sleep-timer';

export function useSleepTimer(onExpire: () => void) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const expires = useRef(onExpire);
  expires.current = onExpire;
  const activeDeadline = useRef<number | null>(null);
  const cancel = useCallback(() => {
    activeDeadline.current = null;
    setDeadline(null);
    setRemaining(0);
  }, []);
  const check = useCallback(() => {
    const target = activeDeadline.current;
    if (target === null) return false;
    const seconds = remainingSleepSeconds(target);
    setRemaining(seconds);
    if (seconds > 0) return false;
    cancel();
    expires.current();
    return true;
  }, [cancel]);
  const start = useCallback((minutes: number) => {
    const target = sleepDeadline(minutes);
    activeDeadline.current = target;
    setDeadline(target);
    setRemaining(remainingSleepSeconds(target));
  }, []);
  useEffect(() => {
    if (deadline === null) return;
    const interval = setInterval(check, 1000);
    const timeout = setTimeout(check, Math.max(0, deadline - Date.now()));
    const subscription = AppState.addEventListener('change', check);
    return () => { clearInterval(interval); clearTimeout(timeout); subscription.remove(); };
  }, [deadline, check]);
  return { active: deadline !== null, remaining, start, cancel, check };
}
