import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { User } from './api'
import { can } from './api'
import { useAuth } from './auth/useAuth'
import { parseHash, type Route } from './route'
import sesurLogo from '../../../logo-1.png'

// Keep infrequently used screens out of the initial download. Vite creates a
// separate chunk for each feature module and loads it when its route is opened.
const LoginPage = lazy(() => import('./LoginPage').then(({ LoginPage }) => ({ default: LoginPage })))
const RegistrationPage = lazy(() => import('./RegistrationPage').then(({ RegistrationPage }) => ({ default: RegistrationPage })))
const TotpChallengePage = lazy(() => import('./TotpChallengePage').then(({ TotpChallengePage }) => ({ default: TotpChallengePage })))

const QuotesPage = lazy(() => import('./pages/QuotesPage').then(({ QuotesPage }) => ({ default: QuotesPage })))
const QuoteFormPage = lazy(() => import('./pages/QuotesPage').then(({ QuoteFormPage }) => ({ default: QuoteFormPage })))
const QuoteDetailPage = lazy(() => import('./pages/QuotesPage').then(({ QuoteDetailPage }) => ({ default: QuoteDetailPage })))
const QuoteEditPage = lazy(() => import('./pages/QuotesPage').then(({ QuoteEditPage }) => ({ default: QuoteEditPage })))

const AuditPage = lazy(() => import('./pages/AdminPages').then(({ AuditPage }) => ({ default: AuditPage })))
const ImportPage = lazy(() => import('./pages/AdminPages').then(({ ImportPage }) => ({ default: ImportPage })))
const ProductsPage = lazy(() => import('./pages/AdminPages').then(({ ProductsPage }) => ({ default: ProductsPage })))
const ProfilePage = lazy(() => import('./pages/AdminPages').then(({ ProfilePage }) => ({ default: ProfilePage })))
const UsersPage = lazy(() => import('./pages/AdminPages').then(({ UsersPage }) => ({ default: UsersPage })))

const ClientDetailPage = lazy(() => import('./pages/CrmPages').then(({ ClientDetailPage }) => ({ default: ClientDetailPage })))
const ClientFormPage = lazy(() => import('./pages/CrmPages').then(({ ClientFormPage }) => ({ default: ClientFormPage })))
const ClientsPage = lazy(() => import('./pages/CrmPages').then(({ ClientsPage }) => ({ default: ClientsPage })))
const ContactDetailPage = lazy(() => import('./pages/CrmPages').then(({ ContactDetailPage }) => ({ default: ContactDetailPage })))
const ContactFormPage = lazy(() => import('./pages/CrmPages').then(({ ContactFormPage }) => ({ default: ContactFormPage })))
const ContactsPage = lazy(() => import('./pages/CrmPages').then(({ ContactsPage }) => ({ default: ContactsPage })))
const HomePage = lazy(() => import('./pages/CrmPages').then(({ HomePage }) => ({ default: HomePage })))
const LeadDetailPage = lazy(() => import('./pages/CrmPages').then(({ LeadDetailPage }) => ({ default: LeadDetailPage })))
const LeadFormPage = lazy(() => import('./pages/CrmPages').then(({ LeadFormPage }) => ({ default: LeadFormPage })))
const LeadsPage = lazy(() => import('./pages/CrmPages').then(({ LeadsPage }) => ({ default: LeadsPage })))
const OpportunitiesPage = lazy(() => import('./pages/CrmPages').then(({ OpportunitiesPage }) => ({ default: OpportunitiesPage })))
const OpportunityFormPage = lazy(() => import('./pages/CrmPages').then(({ OpportunityFormPage }) => ({ default: OpportunityFormPage })))
const OpportunityDetailPage = lazy(() => import('./pages/CrmPages').then(({ OpportunityDetailPage }) => ({ default: OpportunityDetailPage })))

const CalendarPage = lazy(() => import('./pages/ActivityPages').then(({ CalendarPage }) => ({ default: CalendarPage })))
const TasksPage = lazy(() => import('./pages/ActivityPages').then(({ TasksPage }) => ({ default: TasksPage })))
const ContractsPage = lazy(() => import('./pages/SupportPages').then(({ ContractsPage }) => ({ default: ContractsPage })))
const TicketDetailPage = lazy(() => import('./pages/SupportPages').then(({ TicketDetailPage }) => ({ default: TicketDetailPage })))
const TicketsPage = lazy(() => import('./pages/SupportPages').then(({ TicketsPage }) => ({ default: TicketsPage })))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage').then(({ IntegrationsPage }) => ({ default: IntegrationsPage })))

const pageLoading = <p className="centered" role="status">Chargement de la page…</p>

type AccessRequirement = { resource: string; action: string }

function requiredAccess(route: Route): AccessRequirement | null {
  switch (route.name) {
    case 'leads':
    case 'lead':
      return { resource: 'lead', action: 'read' }
    case 'clients':
    case 'client':
      return { resource: 'organization', action: 'read' }
    case 'contacts':
    case 'contact':
      return { resource: 'contact', action: 'read' }
    case 'opportunities':
    case 'opportunity':
      return { resource: 'opportunity', action: 'read' }
    case 'quotes':
    case 'quote':
      return { resource: 'quote', action: 'read' }
    case 'tasks':
      return { resource: 'task', action: 'read' }
    case 'calendar':
      return { resource: 'calendar', action: 'read' }
    case 'tickets':
    case 'ticket':
      return { resource: 'ticket', action: 'read' }
    case 'contracts':
      return { resource: 'contract', action: 'read' }
    case 'lead-new': return { resource: 'lead', action: 'create' }
    case 'client-new': return { resource: 'organization', action: 'create' }
    case 'contact-new': return { resource: 'contact', action: 'create' }
    case 'opportunity-new': return { resource: 'opportunity', action: 'create' }
    case 'quote-new': return { resource: 'quote', action: 'create' }
    case 'quote-edit': return { resource: 'quote', action: 'update' }
    case 'users': return { resource: 'user', action: 'read' }
    case 'products': return { resource: 'product', action: 'read' }
    case 'import': return { resource: 'import', action: 'create' }
    case 'audit': return { resource: 'audit', action: 'read' }
    case 'integrations': return { resource: 'integration', action: 'read' }
    case 'register':
    case 'home':
    case 'profile':
    case 'not-found':
      return null
  }
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

function Screen({ route, user, onPasswordChanged }: { route: Route; user: User; onPasswordChanged: () => void }) {
  const access = requiredAccess(route)
  const missingReadForQuoteEdit = route.name === 'quote-edit' && !can(user, 'quote', 'read')
  if ((access && !can(user, access.resource, access.action)) || missingReadForQuoteEdit) {
    return (
      <section className="panel surface-panel centered-panel" role="alert" aria-labelledby="access-denied-title">
        <h2 id="access-denied-title">Accès refusé</h2>
        <p>Votre rôle ne vous autorise pas à consulter cette page.</p>
        <a className="button" href="#/">Retour à Mes priorités</a>
      </section>
    )
  }

  switch (route.name) {
    case 'register':
      return <div className="panel surface-panel centered-panel"><h2>Inscription</h2><p>Utilisez le lien d’invitation reçu par e-mail.</p></div>
    case 'home':
      return <HomePage user={user} />
    case 'leads':
      return <LeadsPage user={user} />
    case 'lead-new':
      return <LeadFormPage user={user} />
    case 'lead':
      return <LeadDetailPage id={route.id} user={user} />
    case 'clients':
      return <ClientsPage user={user} />
    case 'client-new':
      return <ClientFormPage />
    case 'client':
      return <ClientDetailPage id={route.id} user={user} />
    case 'contacts':
      return <ContactsPage user={user} />
    case 'contact-new':
      return <ContactFormPage />
    case 'contact':
      return <ContactDetailPage id={route.id} user={user} />
    case 'opportunities':
      return <OpportunitiesPage user={user} />
    case 'opportunity-new':
      return <OpportunityFormPage user={user} />
    case 'opportunity':
      return <OpportunityDetailPage id={route.id} user={user} />
    case 'users':
      return <UsersPage user={user} />
    case 'products':
      return <ProductsPage user={user} />
    case 'import':
      return <ImportPage />
    case 'audit':
      return <AuditPage />
    case 'integrations':
      return <IntegrationsPage user={user} />
    case 'profile':
      return <ProfilePage onPasswordChanged={onPasswordChanged} />
    case 'quote-new':
      return <QuoteFormPage user={user} />
    case 'quotes':
      return <QuotesPage user={user} />
    case 'tasks':
      return <TasksPage user={user} />
    case 'calendar':
      return <CalendarPage user={user} />
    case 'tickets':
      return <TicketsPage user={user} />
    case 'ticket':
      return <TicketDetailPage id={route.id} user={user} />
    case 'contracts':
      return <ContractsPage user={user} />
    case 'quote':
  return <QuoteDetailPage id={route.id} user={user} />
    case 'quote-edit':
  return <QuoteEditPage id={route.id} user={user} />
    default:
      return (
        <div className="panel surface-panel centered-panel">
          <h2>Page introuvable</h2>
          <p>Cette adresse n’existe pas.</p>
        </div>
      )
  }
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6',
    leads: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m6.5-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.7a4 4 0 0 1 0 7.4M17 15h1a4 4 0 0 1 4 4v2',
    clients: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4',
    contacts: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    opportunities: 'M3 3v18h18M7 14l4-4 4 3 6-7m-5 0h5v5',
    quotes: 'M7 3h8l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 0v5h5M9 13h6m-6 4h6',
    tasks: 'm5 12 4 4L19 6M4 4h2m12 0h2M4 20h2m12 0h2',
    calendar: 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 4h2',
    tickets: 'M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Zm8 3v2m0 3v2',
    contracts: 'M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4',
    users: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m6.5-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6.5 2h5m-2.5-2.5v5',
    products: 'M12 3 3.5 7.5 12 12l8.5-4.5L12 3Zm-8.5 9L12 16.5l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
    import: 'M12 16V4m0 0 4 4m-4-4L8 8M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5',
    audit: 'M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h5',
    integrations: 'M8 7V5a2 2 0 1 1 4 0v14a2 2 0 1 0 4 0v-2M4 7h8m4 10h4',
    profile: 'M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  }

  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={paths[name] ?? paths.home} />
    </svg>
  )
}

function NavLink({ href, label, current, icon }: { href: string; label: string; current: boolean; icon: string }) {
  return (
    <a href={href} aria-current={current ? 'page' : undefined} className={current ? 'nav-item active' : 'nav-item'} title={label}>
      <NavIcon name={icon} />
      <span>{label}</span>
    </a>
  )
}

function routeTitle(route: Route): string {
  const titles: Record<Route['name'], string> = {
    register: 'Inscription',
    home: 'Vue d’ensemble', leads: 'Prospects', 'lead-new': 'Nouveau prospect', lead: 'Fiche prospect',
    clients: 'Clients', 'client-new': 'Nouveau client', client: 'Fiche client', contacts: 'Contacts',
    'contact-new': 'Nouveau contact', contact: 'Fiche contact', users: 'Utilisateurs', products: 'Catalogue',
    import: 'Import de données', audit: 'Journal d’audit', integrations: 'Intégrations', profile: 'Mon profil',
    opportunities: 'Opportunités', 'opportunity-new': 'Nouvelle opportunité', opportunity: 'Fiche opportunité',
    quotes: 'Devis', tasks: 'Tâches', calendar: 'Agenda', tickets: 'Support client', ticket: 'Détail du ticket',
    contracts: 'Contrats', 'quote-new': 'Nouveau devis', quote: 'Détail du devis', 'quote-edit': 'Modifier le devis',
    'not-found': 'Page introuvable',
  }
  return titles[route.name]
}

function Workspace({ user, onSignOut, route }: { user: User; onSignOut: () => void; route: Route }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null)
  const wasMobileNavOpen = useRef(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [route])

  useEffect(() => {
    if (!mobileNavOpen) {
      if (wasMobileNavOpen.current) mobileNavToggleRef.current?.focus()
      wasMobileNavOpen.current = false
      return
    }
    wasMobileNavOpen.current = true
    sidebarRef.current?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileNavOpen])

  return (
    <div className="layout">
      {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setMobileNavOpen(false)} />}
      <aside
        id="primary-sidebar"
        ref={sidebarRef}
        className={`sidebar${mobileNavOpen ? ' is-open' : ''}`}
        aria-label="Navigation principale"
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen || undefined}
      >
        <div className="brand-block" aria-label="SESUR CRM">
          <img className="brand-logo" src={sesurLogo} alt="SESUR" />
          <div className="brand-copy">
            <strong>SESUR CRM</strong>
            <span>ESPACE DE PILOTAGE</span>
          </div>
        </div>
        <button type="button" className="sidebar-close" aria-label="Fermer le menu" onClick={() => setMobileNavOpen(false)}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          <div className="nav-group">
            <span className="nav-group-label">Espace de travail</span>
            <NavLink href="#/" label="Vue d’ensemble" icon="home" current={route.name === 'home'} />
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Développement commercial</span>
            {can(user, 'lead', 'read') && <NavLink href="#/leads" label="Prospects" icon="leads" current={route.name.startsWith('lead')} />}
            {can(user, 'organization', 'read') && <NavLink href="#/clients" label="Clients" icon="clients" current={route.name.startsWith('client')} />}
            {can(user, 'contact', 'read') && <NavLink href="#/contacts" label="Contacts" icon="contacts" current={route.name.startsWith('contact')} />}
            {can(user, 'opportunity', 'read') && <NavLink href="#/opportunities" label="Opportunités" icon="opportunities" current={route.name.startsWith('opportunit')} />}
            {can(user, 'quote', 'read') && <NavLink href="#/quotes" label="Devis" icon="quotes" current={route.name.startsWith('quote')} />}
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Opérations</span>
            {can(user, 'task', 'read') && <NavLink href="#/taches" label="Tâches" icon="tasks" current={route.name === 'tasks'} />}
            {can(user, 'calendar', 'read') && <NavLink href="#/agenda" label="Agenda" icon="calendar" current={route.name === 'calendar'} />}
            {can(user, 'ticket', 'read') && <NavLink href="#/sav/tickets" label="Support / Tickets" icon="tickets" current={route.name === 'tickets' || route.name === 'ticket'} />}
            {can(user, 'contract', 'read') && <NavLink href="#/contrats" label="Contrats" icon="contracts" current={route.name === 'contracts'} />}
          </div>
          {(can(user, 'user', 'read') || can(user, 'product', 'read') || can(user, 'import', 'create') || can(user, 'audit', 'read') || can(user, 'integration', 'read')) && (
            <div className="nav-group">
              <span className="nav-group-label">Administration</span>
              {can(user, 'user', 'read') && <NavLink href="#/admin/utilisateurs" label="Utilisateurs" icon="users" current={route.name === 'users'} />}
              {can(user, 'product', 'read') && <NavLink href="#/admin/produits" label="Catalogue" icon="products" current={route.name === 'products'} />}
              {can(user, 'import', 'create') && <NavLink href="#/admin/import" label="Import" icon="import" current={route.name === 'import'} />}
              {can(user, 'audit', 'read') && <NavLink href="#/admin/audit" label="Audit" icon="audit" current={route.name === 'audit'} />}
              {can(user, 'integration', 'read') && <NavLink href="#/admin/integrations" label="Intégrations" icon="integrations" current={route.name === 'integrations'} />}
            </div>
          )}
        </nav>

        <div className="sidebar-profile">
          <div className="profile-avatar" aria-hidden="true">
            {user.firstName?.charAt(0)?.toUpperCase() ?? 'U'}
            {user.lastName?.charAt(0)?.toUpperCase() ?? 'S'}
          </div>
          <div className="profile-meta">
            <strong>
              {user.firstName} {user.lastName}
            </strong>
            <span>{user.roles.join(' · ')}</span>
          </div>
          <a className="profile-settings" href="#/profil" aria-label="Ouvrir mon profil"><NavIcon name="profile" /></a>
          <button type="button" className="ghost-button" onClick={onSignOut} aria-label="Déconnexion" title="Déconnexion">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m9-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
          </button>
        </div>
      </aside>

      <main className="main-panel" aria-hidden={mobileNavOpen}>
        <header className="topbar" aria-label="Barre d'outils">
          <div className="topbar-heading">
            <button
              ref={mobileNavToggleRef}
              type="button"
              className="mobile-nav-toggle"
              aria-label={mobileNavOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-controls="primary-sidebar"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span /><span /><span />
            </button>
            <div className="breadcrumb">
              <span className="eyebrow">SESUR CRM <span aria-hidden="true">/</span></span>
              <h1>{routeTitle(route)}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="system-status"><i aria-hidden="true" /> Espace sécurisé</span>
            <time className="date-chip" dateTime={new Date().toISOString()}>{new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</time>
            <a className="topbar-user" href="#/profil" aria-label={`Mon profil, ${user.firstName} ${user.lastName}`}>
              <span className="profile-avatar" aria-hidden="true">{user.firstName?.charAt(0)?.toUpperCase() ?? 'U'}{user.lastName?.charAt(0)?.toUpperCase() ?? 'S'}</span>
            </a>
          </div>
        </header>
        <div className="page-content" key={`${route.name}-${'id' in route ? route.id : ''}`}>
          <Suspense fallback={pageLoading}>
            <Screen route={route} user={user} onPasswordChanged={onSignOut} />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

function App() {
  const { state, signOut } = useAuth()
  const route = useRoute()

  if (route.name === 'register') {
    const registrationChallenge = state.status === 'totp-challenge' && state.flow === 'registration'
      ? state.challenge
      : undefined
    return (
      <Suspense fallback={pageLoading}>
        <RegistrationPage token={route.token} challenge={registrationChallenge} />
      </Suspense>
    )
  }

  switch (state.status) {
    case 'loading':
      return <p className="centered">Chargement…</p>
    case 'error':
      return (
        <p role="alert" className="centered">
          {state.message}
        </p>
      )
    case 'anonymous':
      return <Suspense fallback={pageLoading}><LoginPage /></Suspense>
    case 'totp-challenge':
      return <Suspense fallback={pageLoading}><TotpChallengePage challenge={state.challenge} /></Suspense>
    case 'authenticated':
      return <Workspace user={state.user} onSignOut={() => void signOut()} route={route} />
  }
}

export default App
