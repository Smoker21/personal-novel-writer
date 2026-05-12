import { useCallback, useEffect, useState } from 'react';

const KEY = 'nw:dark';

export function useDarkMode(): [boolean, (on: boolean) => void, () => void] {
  const [on, setOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem(KEY);
    return v === '1';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (on) html.classList.add('dark');
    else html.classList.remove('dark');
    try {
      window.localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // ignore
    }
  }, [on]);

  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, setOn, toggle];
}
