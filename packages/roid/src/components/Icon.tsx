type IconName = 'scan' | 'shield' | 'upload' | 'camera' | 'lock' | 'arrow' | 'check' | 'alert' | 'close';
const shapes: Record<IconName, React.ReactNode> = {
  scan: <path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 1-1 1h-4" />,
  shield: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z" /><path d="m8 12 3 3 5-5" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v14H3z" /><circle cx="12" cy="14" r="4" /></>,
  lock: <><path d="M7 10V6a5 5 0 0 1 10 0v4" /><rect x="4" y="10" width="16" height="12" rx="2" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m4 12 5 5L20 6" />,
  alert: <><path d="m12 3 10 18H2zM12 9v5" /><path d="M12 17h.01" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
