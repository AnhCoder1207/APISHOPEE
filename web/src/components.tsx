import { useEffect, useRef, type ReactNode } from 'react'

export type IconName = 'grid' | 'link' | 'receipt' | 'store' | 'key' | 'copy' | 'plus' | 'alert' | 'logout' | 'download' | 'menu' | 'shield'

export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true"><use href={`#icon-${name}`} /></svg>
}

export function IconSprite() {
  return (
    <svg className="svg-sprite" aria-hidden="true">
      <symbol id="icon-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></symbol>
      <symbol id="icon-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></symbol>
      <symbol id="icon-receipt" viewBox="0 0 24 24"><path d="M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2-3-2Z"/><path d="M9 9h6M9 13h6"/></symbol>
      <symbol id="icon-store" viewBox="0 0 24 24"><path d="M3 9l2-5h14l2 5"/><path d="M5 13v7h14v-7M9 20v-5h6v5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></symbol>
      <symbol id="icon-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M15 8l3 3M17 6l2 2"/></symbol>
      <symbol id="icon-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></symbol>
      <symbol id="icon-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
      <symbol id="icon-alert" viewBox="0 0 24 24"><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></symbol>
      <symbol id="icon-logout" viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></symbol>
      <symbol id="icon-download" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></symbol>
      <symbol id="icon-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
      <symbol id="icon-shield" viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5.2-3.4 8.6-8 10-4.6-1.4-8-4.8-8-10V6l8-3Z"/><path d="m9 12 2 2 4-5"/></symbol>
    </svg>
  )
}

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <><span className="brand-mark">C</span><span><strong>CamLink</strong><small>{inverse ? 'Affiliate workspace' : 'Công cụ Shopee Affiliate'}</small></span></>
}

export function Modal({ open, onClose, className = '', children }: { open: boolean; onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog ref={ref} className={`modal ${className}`} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Đóng">×</button>
      {children}
    </dialog>
  )
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return <div className="admin-pagination"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trang trước</button><span>Trang {page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Trang sau</button></div>
}
