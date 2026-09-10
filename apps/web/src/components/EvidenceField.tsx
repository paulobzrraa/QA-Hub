import { useRef, useState } from 'react'
import { ExternalLink, FileVideo, Hash, Paperclip, Trash2 } from 'lucide-react'
import { useAddEvidenceLink, useDeleteEvidence, useUploadEvidence } from '../lib/queries'
import type { Evidence } from '../lib/types'
import { Field } from './ui'

/** `1.4 MB`, `812 kB`. Tamanho ausente sai vazio, não "0 B". */
function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function evidenceLabel(item: Evidence): string {
  return item.caption ?? item.originalName ?? item.url ?? 'Evidência'
}

/**
 * Miniatura de uma evidência (US-4.3).
 *
 * Imagem usa o próprio arquivo reduzido por CSS — não geramos thumbnail no
 * servidor, que exigiria uma dependência de processamento de imagem para um
 * ganho que a rede local não sente. Vídeo mostra o primeiro quadro via
 * `preload="metadata"`, e link/referência ficam com ícone.
 */
export function EvidenceThumb({ item, size = 34 }: { item: Evidence; size?: number }) {
  const style = { width: size, height: size }

  if (item.kind === 'image') {
    return <img className="ev-thumb" style={style} src={`/api/evidence/${item.id}/file`} alt={evidenceLabel(item)} loading="lazy" />
  }
  if (item.kind === 'video') {
    return (
      <span className="ev-thumb ev-thumb-video" style={style} title={evidenceLabel(item)}>
        <video src={`/api/evidence/${item.id}/file`} preload="metadata" muted playsInline />
        <FileVideo size={13} />
      </span>
    )
  }
  return (
    <span className="ev-thumb ev-thumb-icon" style={style} title={evidenceLabel(item)}>
      {item.kind === 'link' ? <ExternalLink size={14} /> : <Hash size={14} />}
    </span>
  )
}

/**
 * Painel de evidências do cenário: enviar arquivo, anexar link, ver e remover.
 *
 * Assim como os bugs vinculados, age na hora e não espera o "Salvar" do
 * formulário — anexar arquivo é uma operação própria, não a edição de um campo.
 */
export function EvidenceField({
  caseId, suiteId, evidences,
}: { caseId: string; suiteId: string; evidences: Evidence[] }) {
  const upload = useUploadEvidence(suiteId, caseId)
  const addLink = useAddEvidenceLink(suiteId, caseId)
  const remove = useDeleteEvidence(suiteId)

  const fileInput = useRef<HTMLInputElement>(null)
  const [linkValue, setLinkValue] = useState('')
  const [preview, setPreview] = useState<Evidence | null>(null)

  const error = upload.error ?? addLink.error

  const submitLink = async () => {
    if (!linkValue.trim()) return
    await addLink.mutateAsync(linkValue.trim())
    setLinkValue('')
  }

  return (
    <Field label="Evidências">
      <div className="ev-list">
        {!evidences.length && <span className="small muted">Nenhuma evidência anexada.</span>}

        {evidences.map((item) => (
          <div key={item.id} className="ev-item">
            {item.kind === 'image' || item.kind === 'video' ? (
              <button
                type="button"
                className="ev-open"
                onClick={() => setPreview(item)}
                title="Ver em tamanho maior"
              >
                <EvidenceThumb item={item} />
              </button>
            ) : (
              <EvidenceThumb item={item} />
            )}

            <div className="ev-meta">
              {item.kind === 'link' ? (
                <a href={item.url ?? '#'} target="_blank" rel="noreferrer" className="cell-title">
                  {evidenceLabel(item)}
                </a>
              ) : (
                <span className="cell-title">{evidenceLabel(item)}</span>
              )}
              <span className="cell-sub">
                {item.kind === 'reference'
                  ? 'Referência da planilha'
                  : [item.kind === 'link' ? 'Link externo' : item.mimeType, formatSize(item.sizeBytes)]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </div>

            <button
              type="button"
              className="btn ghost danger"
              onClick={() => remove.mutate(item.id)}
              disabled={remove.isPending}
              aria-label={`Remover ${evidenceLabel(item)}`}
              title="Remover evidência"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 8 }}>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) upload.mutate(file)
            // Sem isto, escolher o mesmo arquivo de novo não dispara `change`.
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
        >
          <Paperclip size={14} />
          {upload.isPending ? 'Enviando…' : 'Enviar print ou vídeo'}
        </button>
      </div>

      <div className="toolbar ev-link-row" style={{ marginTop: 6 }}>
        <input
          className="input"
          placeholder="Ou cole um link externo (Drive, Jira, Loom)…"
          value={linkValue}
          onChange={(event) => setLinkValue(event.target.value)}
          onKeyDown={(event) => {
            // O painel inteiro é um <form>; sem isto, Enter salvaria o cenário.
            if (event.key === 'Enter') {
              event.preventDefault()
              void submitLink()
            }
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={submitLink}
          disabled={addLink.isPending || !linkValue.trim()}
        >
          Anexar link
        </button>
      </div>

      {error && <span className="error">{(error as Error).message}</span>}

      {preview && (
        /* Este backdrop vive DENTRO do backdrop do CaseDrawer: sem parar a
           propagação, fechar o preview fecharia o painel do cenário junto. */
        <div
          className="drawer-backdrop ev-preview-backdrop"
          onClick={(event) => { event.stopPropagation(); setPreview(null) }}
          role="presentation"
        >
          <div className="ev-preview" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <h2>{evidenceLabel(preview)}</h2>
                <p className="subtitle">{[preview.mimeType, formatSize(preview.sizeBytes)].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" className="btn ghost" onClick={() => setPreview(null)}>Fechar</button>
            </div>
            <div className="ev-preview-body">
              {preview.kind === 'image' ? (
                <img src={`/api/evidence/${preview.id}/file`} alt={evidenceLabel(preview)} />
              ) : (
                <video src={`/api/evidence/${preview.id}/file`} controls autoPlay />
              )}
            </div>
          </div>
        </div>
      )}
    </Field>
  )
}
