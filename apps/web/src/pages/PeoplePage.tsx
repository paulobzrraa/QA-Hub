import { useMemo, useState } from 'react'
import { Merge, Trash2, UserPlus } from 'lucide-react'
import { ApiError } from '../lib/api'
import {
  useCreatePerson, useDeletePerson, useMergePeople, useMeta, usePeople, useUpdatePerson,
} from '../lib/queries'
import type { Person } from '../lib/types'
import { Empty, ErrorBanner, Field, Loading, Select, Stat } from '../components/ui'

/** Trabalho atribuído a alguém. Zero em tudo = dá para excluir de verdade. */
function workload(person: Person) {
  const counts = person._count ?? { suites: 0, cases: 0, bugs: 0 }
  return { ...counts, total: counts.suites + counts.cases + counts.bugs }
}

/**
 * Gestão de pessoas (US-4.5).
 *
 * Existe para corrigir o que a planilha trouxe: o mesmo profissional aparecia
 * com grafias diferentes em abas diferentes, e nomes no formato "Sobrenome,
 * Nome" chegaram partidos em dois registros. A mescla reatribui ciclos,
 * cenários e bugs antes de remover a duplicata.
 */
export function PeoplePage() {
  const meta = useMeta()
  const people = usePeople()
  const update = useUpdatePerson()
  const remove = useDeletePerson()
  const merge = useMergePeople()
  const create = useCreatePerson()

  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('QA')
  const [mergeSource, setMergeSource] = useState<Person | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const totals = useMemo(() => {
    const list = people.data ?? []
    return {
      total: list.length,
      active: list.filter((person) => person.active).length,
      qa: list.filter((person) => person.role === 'QA').length,
      dev: list.filter((person) => person.role === 'DEV').length,
    }
  }, [people.data])

  const error = create.error ?? update.error ?? remove.error ?? merge.error

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newName.trim()) return
    await create.mutateAsync({ name: newName.trim(), role: newRole as Person['role'] })
    setNewName('')
    setNotice(`${newName.trim()} adicionada ao time.`)
  }

  const submitMerge = async () => {
    if (!mergeSource || !mergeTarget) return
    const result = await merge.mutateAsync({ id: mergeSource.id, intoId: mergeTarget })
    setNotice(
      `"${result.absorbed}" foi mesclada em "${result.person.name}": ` +
        `${result.moved.suites} ciclo(s), ${result.moved.cases} cenário(s) e ${result.moved.bugs} bug(s) reatribuídos.`,
    )
    setMergeSource(null)
    setMergeTarget('')
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Pessoas</h1>
          <p className="subtitle">
            {totals.total} pessoas · {totals.active} ativas · {totals.qa} QA · {totals.dev} DEV
          </p>
        </div>
      </header>

      <div className="content stack">
        {notice && (
          <div className="banner">
            {notice}{' '}
            <button type="button" className="btn ghost" onClick={() => setNotice(null)}>Dispensar</button>
          </div>
        )}
        {error && <ErrorBanner error={error} />}

        <div className="stat-grid">
          <Stat label="Total" value={totals.total} />
          <Stat label="Ativas" value={totals.active} hint={`${totals.total - totals.active} inativas`} />
          <Stat label="QA" value={totals.qa} />
          <Stat label="DEV" value={totals.dev} />
        </div>

        <form className="card" onSubmit={submitCreate}>
          <div className="card-head"><h2>Nova pessoa</h2></div>
          <div className="card-body">
            <div className="toolbar">
              <input
                className="input search"
                placeholder="Nome"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <Select
                options={meta.data?.personRole ?? []}
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
              />
              <button type="submit" className="btn primary" disabled={create.isPending || !newName.trim()}>
                <UserPlus size={15} /> Adicionar
              </button>
            </div>
          </div>
        </form>

        <div className="card">
          <div className="card-head"><h2>Time</h2></div>
          {people.isLoading ? (
            <Loading />
          ) : !people.data?.length ? (
            <Empty title="Nenhuma pessoa cadastrada" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th style={{ width: 110 }}>Papel</th>
                    <th style={{ width: 100 }}>Ativa</th>
                    <th className="num" style={{ width: 80 }}>Ciclos</th>
                    <th className="num" style={{ width: 90 }}>Cenários</th>
                    <th className="num" style={{ width: 70 }}>Bugs</th>
                    <th style={{ width: 190 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {people.data.map((person) => {
                    const load = workload(person)
                    return (
                      <tr key={person.id} className={person.active ? undefined : 'row-muted'}>
                        <td>
                          <span className="cell-title">{person.name}</span>
                          {!person.active && <div className="cell-sub">fora dos seletores, histórico preservado</div>}
                        </td>
                        <td className="tight">
                          <Select
                            className="select-inline"
                            options={meta.data?.personRole ?? []}
                            value={person.role}
                            onChange={(event) =>
                              update.mutate({ id: person.id, data: { role: event.target.value as Person['role'] } })
                            }
                          />
                        </td>
                        <td className="tight">
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={person.active}
                              onChange={(event) =>
                                update.mutate({ id: person.id, data: { active: event.target.checked } })
                              }
                            />
                            <span>{person.active ? 'Ativa' : 'Inativa'}</span>
                          </label>
                        </td>
                        <td className="num">{load.suites}</td>
                        <td className="num">{load.cases}</td>
                        <td className="num">{load.bugs}</td>
                        <td className="tight">
                          <div className="toolbar">
                            {/* Com rótulo, não só ícone: o glifo de merge vem do
                                vocabulário de Git e não diz "juntar duas pessoas". */}
                            <button
                              type="button"
                              className="btn ghost"
                              title="Mesclar com outra pessoa"
                              onClick={() => { setMergeSource(person); setMergeTarget('') }}
                            >
                              <Merge size={14} /> Mesclar
                            </button>
                            {confirmDelete === person.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn danger"
                                  onClick={async () => {
                                    await remove.mutateAsync(person.id).catch(() => null)
                                    setConfirmDelete(null)
                                  }}
                                >
                                  Confirmar
                                </button>
                                <button type="button" className="btn ghost" onClick={() => setConfirmDelete(null)}>
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn ghost danger"
                                title={load.total
                                  ? 'Tem trabalho atribuído — marque como inativa ou mescle'
                                  : 'Excluir'}
                                onClick={() => setConfirmDelete(person.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {mergeSource && (
        <div className="drawer-backdrop ev-preview-backdrop" onClick={() => setMergeSource(null)} role="presentation">
          <div className="ev-preview" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <h2>Mesclar pessoas</h2>
                <p className="subtitle">
                  <strong>{mergeSource.name}</strong> deixa de existir e todo o trabalho dela passa para quem
                  você escolher.
                </p>
              </div>
              <button type="button" className="btn ghost" onClick={() => setMergeSource(null)}>Fechar</button>
            </div>
            <div className="drawer-body">
              <Field label="Manter esta pessoa">
                <select
                  className="select"
                  value={mergeTarget}
                  onChange={(event) => setMergeTarget(event.target.value)}
                >
                  <option value="">Escolha quem permanece…</option>
                  {(people.data ?? [])
                    .filter((person) => person.id !== mergeSource.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} ({person.role}){person.active ? '' : ' — inativa'}
                      </option>
                    ))}
                </select>
              </Field>
              <p className="small muted">
                Serão reatribuídos {workload(mergeSource).suites} ciclo(s),{' '}
                {workload(mergeSource).cases} cenário(s) e {workload(mergeSource).bugs} bug(s). A ação não
                tem desfazer.
              </p>
              {merge.error instanceof ApiError && <div className="banner danger">{merge.error.message}</div>}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn ghost" onClick={() => setMergeSource(null)}>Cancelar</button>
              <button
                type="button"
                className="btn primary"
                disabled={!mergeTarget || merge.isPending}
                onClick={submitMerge}
              >
                {merge.isPending ? 'Mesclando…' : 'Mesclar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
