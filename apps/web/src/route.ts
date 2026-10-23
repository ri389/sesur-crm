export type Route =
  | { name: 'home' }
  | { name: 'leads' }
  | { name: 'lead-new' }
  | { name: 'lead'; id: string }
  | { name: 'clients' }
  | { name: 'client-new' }
  | { name: 'client'; id: string }
  | { name: 'contacts' }
  | { name: 'contact-new' }
  | { name: 'contact'; id: string }
  | { name: 'users' }
  | { name: 'products' }
  | { name: 'import' }
  | { name: 'audit' }
  | { name: 'profile' }
  | { name: 'opportunities' }
  | { name: 'opportunity-new' }
  | { name: 'opportunity'; id: string }
  | { name: 'quotes' }
  | { name: 'quote-new' }
  | { name: 'quote'; id: string }
  | { name: 'quote-edit'; id: string }
  | { name: 'not-found' }
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'leads' && parts[1] === 'nouveau') return { name: 'lead-new' }
  if (parts[0] === 'leads' && parts[1]) return { name: 'lead', id: parts[1] }
  if (parts[0] === 'leads') return { name: 'leads' }
  if (parts[0] === 'clients' && parts[1] === 'nouveau') return { name: 'client-new' }
  if (parts[0] === 'clients' && parts[1]) return { name: 'client', id: parts[1] }
  if (parts[0] === 'clients') return { name: 'clients' }
  if (parts[0] === 'contacts' && parts[1] === 'nouveau') return { name: 'contact-new' }
  if (parts[0] === 'contacts' && parts[1]) return { name: 'contact', id: parts[1] }
  if (parts[0] === 'contacts') return { name: 'contacts' }
  if (parts[0] === 'admin' && parts[1] === 'utilisateurs') return { name: 'users' }
  if (parts[0] === 'admin' && parts[1] === 'produits') return { name: 'products' }
  if (parts[0] === 'admin' && parts[1] === 'import') return { name: 'import' }
  if (parts[0] === 'admin' && parts[1] === 'audit') return { name: 'audit' }
  if (parts[0] === 'profil') return { name: 'profile' }
  if (parts[0] === 'opportunities') {
    if (parts[1] === 'nouveau') return { name: 'opportunity-new' }
    if (parts[1]) return { name: 'opportunity', id: parts[1] }
    return { name: 'opportunities' }
  }
  if (parts[0] === 'quotes') {
    if (parts[1] && parts[2] === 'modifier') {
      return { name: 'quote-edit', id: parts[1] }
      }
    if (parts[1] === 'nouveau') return { name: 'quote-new' }
    if (parts[1]) return { name: 'quote', id: parts[1] }
    return { name: 'quotes' }
  }
  return { name: 'not-found' }
}
