import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  Bug, ChevronDown, Database, LayoutDashboard, ListChecks, Monitor, ShieldCheck, Smartphone,
  TrendingUp, Users,
} from 'lucide-react'
import { OverviewPage } from './pages/OverviewPage'
import { SuitesPage } from './pages/SuitesPage'
import { SuiteDetailPage } from './pages/SuiteDetailPage'
import { BugsPage } from './pages/BugsPage'
import { MetricsPage } from './pages/MetricsPage'
import { TestUsersPage } from './pages/TestUsersPage'
import { PeoplePage } from './pages/PeoplePage'
import { AccountsPage } from './pages/AccountsPage'
import { LoginPage } from './pages/LoginPage'
import { UserMenu } from './components/UserMenu'
import { useAuth } from './lib/auth'
import { Loading } from './components/ui'
import { useOverview } from './lib/queries'

/** Tamanho padrão dos ícones do menu — 16px casa com o corpo de texto de 13px do nav. */
const NAV_ICON_SIZE = 16
/** Ícones de submenu são um pouco menores — reforça que são um nível abaixo. */
const NAV_SUB_ICON_SIZE = 14

export function App() {
  const { account, loading, can } = useAuth()
  const location = useLocation()

  // Enquanto a sessão não resolve, não dá para decidir entre app e login —
  // renderizar qualquer um dos dois aqui causaria um pisca a cada carregamento.
  if (loading) return <Loading label="Carregando…" />
  if (!account) return <LoginPage />

  return <Shell isAdmin={can('admin')} pathname={location.pathname} />
}

function Shell({ isAdmin, pathname }: { isAdmin: boolean; pathname: string }) {
  const overview = useOverview()

  // Aberto se a rota atual já é de bugs (refresh em /bugs/app não deve
  // esconder em qual plataforma a pessoa está); a partir daí, é manual.
  const [bugsExpanded, setBugsExpanded] = useState(() => pathname.startsWith('/bugs'))

  const openBugsByPlatform = Object.fromEntries(
    (overview.data?.byPlatform ?? []).map((item) => [item.platform, item.openBugs]),
  ) as Partial<Record<'Web' | 'App', number>>

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/swift-icon.svg" alt="Swift" className="brand-icon" />
          <strong>QA Hub</strong>
        </div>

        <nav className="nav">
          <NavLink to="/geral">
            <LayoutDashboard size={NAV_ICON_SIZE} className="nav-icon" />
            <span className="nav-label">Visão Geral</span>
          </NavLink>
          <NavLink to="/suites">
            <ListChecks size={NAV_ICON_SIZE} className="nav-icon" />
            <span className="nav-label">
              Ciclos de testes
              <span className="count">{overview.data?.totals.suites ?? ''}</span>
            </span>
          </NavLink>

          <div className="nav-sep" />
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={bugsExpanded}
            onClick={() => setBugsExpanded((current) => !current)}
          >
            <Bug size={NAV_ICON_SIZE} className="nav-icon" />
            <span className="nav-label">
              Bugs
              <ChevronDown size={14} className={`nav-chevron${bugsExpanded ? ' open' : ''}`} />
            </span>
          </button>
          {bugsExpanded && (
            <>
              <NavLink to="/bugs/web" className={({ isActive }) => `nav-sub${isActive ? ' active' : ''}`}>
                <Monitor size={NAV_SUB_ICON_SIZE} className="nav-icon" />
                <span className="nav-label">
                  Web
                  <span className="count">{openBugsByPlatform.Web ?? ''}</span>
                </span>
              </NavLink>
              <NavLink to="/bugs/app" className={({ isActive }) => `nav-sub${isActive ? ' active' : ''}`}>
                <Smartphone size={NAV_SUB_ICON_SIZE} className="nav-icon" />
                <span className="nav-label">
                  App
                  <span className="count">{openBugsByPlatform.App ?? ''}</span>
                </span>
              </NavLink>
            </>
          )}

          <div className="nav-sep" />
          <NavLink to="/metricas">
            <TrendingUp size={NAV_ICON_SIZE} className="nav-icon" />
            <span className="nav-label">Métricas</span>
          </NavLink>

          <div className="nav-sep" />
          <NavLink to="/massa-de-teste">
            <Database size={NAV_ICON_SIZE} className="nav-icon" />
            <span className="nav-label">Massa de teste</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/pessoas">
              <Users size={NAV_ICON_SIZE} className="nav-icon" />
              <span className="nav-label">Pessoas</span>
            </NavLink>
          )}

          {/* Contas de acesso só aparecem para quem administra. Quem barra de
              verdade é o gate do servidor; aqui é só não oferecer. */}
          {isAdmin && (
            <>
              <div className="nav-sep" />
              <NavLink to="/contas">
                <ShieldCheck size={NAV_ICON_SIZE} className="nav-icon" />
                <span className="nav-label">Contas de acesso</span>
              </NavLink>
            </>
          )}
        </nav>

        <UserMenu />
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/geral" replace />} />
          <Route path="/geral" element={<OverviewPage />} />
          <Route path="/suites" element={<SuitesPage />} />
          <Route path="/suites/:id" element={<SuiteDetailPage />} />
          <Route path="/bugs" element={<Navigate to="/bugs/web" replace />} />
          <Route path="/bugs/:platform" element={<BugsPage />} />
          <Route path="/metricas" element={<MetricsPage />} />
          <Route path="/massa-de-teste" element={<TestUsersPage />} />
          {isAdmin && <Route path="/pessoas" element={<PeoplePage />} />}
          {isAdmin && <Route path="/contas" element={<AccountsPage />} />}
          <Route path="*" element={<Navigate to="/geral" replace />} />
        </Routes>
      </main>
    </div>
  )
}
