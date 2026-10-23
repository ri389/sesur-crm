import { useEffect, useState } from 'react'
import type { User } from './api'
import { can } from './api'
import { LoginPage } from './LoginPage'
import { useAuth } from './auth/useAuth'
import { QuotesPage, QuoteFormPage, QuoteDetailPage, QuoteEditPage } from './pages/QuotesPage'
import {
  AuditPage,
  ImportPage,
  ProductsPage,
  ProfilePage,
  UsersPage,
} from './pages/AdminPages'
import {
  ClientDetailPage,
  ClientFormPage,
  ClientsPage,
  ContactDetailPage,
  ContactFormPage,
  ContactsPage,
  HomePage,
  LeadDetailPage,
  LeadFormPage,
  LeadsPage,
  OpportunitiesPage,
  OpportunityFormPage,
  OpportunityDetailPage,
} from './pages/CrmPages'
import { parseHash, type Route } from './route'

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
  switch (route.name) {
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
      return <UsersPage />
    case 'products':
      return <ProductsPage />
    case 'import':
      return <ImportPage />
    case 'audit':
      return <AuditPage />
    case 'profile':
      return <ProfilePage onPasswordChanged={onPasswordChanged} />
    case 'quote-new':
      return <QuoteFormPage user={user} />
    case 'quotes':
      return <QuotesPage user={user} />
    case 'quote':
  return <QuoteDetailPage id={route.id} user={user} />
    case 'quote-edit':
  return <QuoteEditPage id={route.id} user={user} />
    default:
      return (
        <>
          <h2>Page introuvable</h2>
          <p>Cette adresse n’existe pas.</p>
        </>
      )
  }
}

function NavLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <a href={href} aria-current={current ? 'page' : undefined}>
      {label}
    </a>
  )
}

function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const route = useRoute()
  console.log('Utilisateur connecté :', user)
  console.log('Permissions :', user.permissions)

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>SESUR CRM</h1>
        <nav aria-label="Navigation principale">
          <NavLink href="#/" label="Mes priorités" current={route.name === 'home'} />
          {can(user, 'lead', 'read') && (
            <NavLink href="#/leads" label="Prospects" current={route.name.startsWith('lead')} />
          )}
          {can(user, 'organization', 'read') && (
            <NavLink href="#/clients" label="Clients" current={route.name.startsWith('client')} />
          )}
          {can(user, 'contact', 'read') && (
            <NavLink href="#/contacts" label="Contacts" current={route.name.startsWith('contact')} />
          )}
          {can(user, 'opportunity', 'read') && (
            <NavLink href="#/opportunities" label="Opportunités" current={route.name === 'opportunities'} />
          )}
          {can(user, 'quote', 'read') && (
            <NavLink
              href="#/quotes"
              label="Devis"
              current={route.name === 'quotes' || route.name === 'quote' || route.name === 'quote-new'}
            />
          )}
          {can(user, 'user', 'read') && (
            <NavLink href="#/admin/utilisateurs" label="Utilisateurs" current={route.name === 'users'} />
          )}
          {can(user, 'product', 'read') && (
            <NavLink href="#/admin/produits" label="Catalogue" current={route.name === 'products'} />
          )}
          {can(user, 'import', 'create') && (
            <NavLink href="#/admin/import" label="Import" current={route.name === 'import'} />
          )}
          {can(user, 'audit', 'read') && (
            <NavLink href="#/admin/audit" label="Audit" current={route.name === 'audit'} />
          )}
          <NavLink href="#/profil" label="Mon profil" current={route.name === 'profile'} />
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <button type="button" onClick={onSignOut}>
            Se déconnecter
          </button>
        </header>
        <Screen route={route} user={user} onPasswordChanged={onSignOut} />
      </main>
    </div>
  )
}

function App() {
  const { state, signOut } = useAuth()

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
      return <LoginPage />
    case 'authenticated':
      return <Workspace user={state.user} onSignOut={() => void signOut()} />
  }
}

export default App
