// Small line icons for the navigation, drawn in currentColor so they follow the
// link's own color in light and dark. One path set per nav icon key.
const PATHS: Record<string, JSX.Element> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></>,
  orders: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  fulfillment: <><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>,
  plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  inquiries: <><path d="M4 5h16v11H9l-4 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  clients: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 20a5.2 5.2 0 0 0-3-4.7" /></>,
  organizations: <><path d="M4 21V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15" /><path d="M13 10h6a1 1 0 0 1 1 1v10" /><path d="M7 9h3M7 13h3M16 14h1M16 17h1M2 21h20" /></>,
  duplicates: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4h12" /></>,
  approvals: <><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  courses: <><path d="M4 5.5A2 2 0 0 1 6 4h12v14H6a2 2 0 0 0-2 2z" /><path d="M4 5.5V20" /><path d="M18 4v14" /></>,
  resources: <><path d="M12 21s-6.5-5-6.5-10a6.5 6.5 0 0 1 13 0c0 5-6.5 10-6.5 10z" /><circle cx="12" cy="11" r="2.3" /></>,
  elearning: <><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8 20h8M12 16.5V20" /></>,
  rollover: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></>,
  dashboard: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  reports: <><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2" /></>,
  comms: <><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4V6a1 1 0 0 1 1-1z" /><path d="M8 10h8M8 13h5" /></>,
  quality: <><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M12 8v4M12 15h.01" /></>,
}

export default function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || null}
    </svg>
  )
}
