import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import {
  computeMetrics, effectiveStatus, percent, PLATFORM, SQUAD,
  type CaseStatus, type Platform, type SuiteMetrics,
} from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError } from '../lib/http.js'

const reportQuery = z.object({
  platform: z.enum(PLATFORM).optional(),
  squad: z.enum(SQUAD).optional(),
  /** IDs separados por vírgula — o multi-select de suítes vira uma query string simples. */
  suiteIds: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['pdf', 'xlsx']).default('pdf'),
})

interface ReportScope {
  platform?: Platform
  squad?: string
  suiteIds: string[]
  from?: Date
  to?: Date
}

interface BugRow {
  jiraKey: string | null
  number: string
  description: string | null
  severity: string
  status: string
  platform: Platform
  affectedArea: string | null
  responsible: string | null
  reportedDate: Date | null
  fixedDate: Date | null
}

interface FailedScenarioRow {
  code: string
  scenario: string | null
  suiteName: string
  platform: Platform
  responsible: string | null
  notes: string | null
}

interface ReportData {
  generatedAt: Date
  scope: {
    platform: Platform | null
    squad: string | null
    suiteCount: number
    from: Date | null
    to: Date | null
  }
  metrics: SuiteMetrics
  byPlatform: { platform: Platform; metrics: SuiteMetrics }[]
  bugs: {
    total: number
    fixed: number
    byPlatform: { platform: Platform; count: number }[]
    bySeverity: { severity: string; count: number }[]
    list: BugRow[]
  }
  failedScenarios: FailedScenarioRow[]
}

function roll(item: { automated: boolean; qaStatus: string; stageStatus: string }) {
  return {
    automated: item.automated,
    qaStatus: item.qaStatus as CaseStatus,
    stageStatus: item.stageStatus as CaseStatus,
  }
}

/**
 * Monta os dados do relatório final (US-3.4) — uma função só, consumida
 * pelos dois formatos (PDF e xlsx), pra garantir que os dois nunca mostrem
 * números diferentes pro mesmo escopo.
 *
 * Escopo: squad e lista de suítes recortam só os cenários (bug não tem
 * squad no modelo — ligar isso exigiria o vínculo bug↔cenário da US-2.5,
 * que cobre poucos casos hoje). Plataforma e período recortam os dois,
 * porque `Bug` carrega as duas colunas nativamente.
 */
async function buildReportData(scope: ReportScope): Promise<ReportData> {
  const suites = await prisma.testSuite.findMany({
    where: {
      platform: scope.platform,
      squad: scope.squad,
      id: scope.suiteIds.length ? { in: scope.suiteIds } : undefined,
      startDate: scope.from || scope.to ? { gte: scope.from, lte: scope.to } : undefined,
    },
    include: {
      cases: {
        include: { responsible: { select: { name: true } } },
      },
    },
    orderBy: [{ platform: 'asc' }, { name: 'asc' }],
  })

  const allCases = suites.flatMap((suite) => suite.cases.map(roll))
  const metrics = computeMetrics(allCases)

  const byPlatform = (['Web', 'App'] as Platform[])
    .map((platform) => {
      const scoped = suites.filter((suite) => suite.platform === platform)
      return { platform, metrics: computeMetrics(scoped.flatMap((suite) => suite.cases.map(roll))) }
    })
    .filter((row) => row.metrics.total > 0)

  const failedScenarios: FailedScenarioRow[] = suites.flatMap((suite) =>
    suite.cases
      .filter(
        (item) => effectiveStatus(item.qaStatus as CaseStatus, item.stageStatus as CaseStatus) === 'Failed',
      )
      .map((item) => ({
        code: item.code,
        scenario: item.scenario,
        suiteName: suite.name,
        platform: suite.platform as Platform,
        responsible: item.responsible?.name ?? null,
        notes: item.notes,
      })),
  )

  const bugs = await prisma.bug.findMany({
    where: {
      platform: scope.platform,
      reportedDate: scope.from || scope.to ? { gte: scope.from, lte: scope.to } : undefined,
    },
    include: {
      responsible: { select: { name: true } },
      affectedArea: { select: { name: true } },
    },
    orderBy: [{ platform: 'asc' }, { number: 'asc' }],
  })

  const bugsByPlatform = (['Web', 'App'] as Platform[])
    .map((platform) => ({ platform, count: bugs.filter((bug) => bug.platform === platform).length }))
    .filter((row) => row.count > 0)

  const severityCounts = new Map<string, number>()
  for (const bug of bugs) severityCounts.set(bug.severity, (severityCounts.get(bug.severity) ?? 0) + 1)
  const bySeverity = [...severityCounts.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count)

  return {
    generatedAt: new Date(),
    scope: {
      platform: scope.platform ?? null,
      squad: scope.squad ?? null,
      suiteCount: suites.length,
      from: scope.from ?? null,
      to: scope.to ?? null,
    },
    metrics,
    byPlatform,
    bugs: {
      total: bugs.length,
      fixed: bugs.filter((bug) => bug.status === 'Resolved').length,
      byPlatform: bugsByPlatform,
      bySeverity,
      list: bugs.map((bug) => ({
        jiraKey: bug.jiraKey,
        number: bug.number,
        description: bug.description,
        severity: bug.severity,
        status: bug.status,
        platform: bug.platform as Platform,
        affectedArea: bug.affectedArea?.name ?? null,
        responsible: bug.responsible?.name ?? null,
        reportedDate: bug.reportedDate,
        fixedDate: bug.fixedDate,
      })),
    },
    failedScenarios,
  }
}

function formatDate(value: Date | null): string {
  if (!value) return '—'
  return value.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function scopeDescription(scope: ReportData['scope']): string {
  const parts: string[] = []
  parts.push(scope.platform ?? 'Web + App')
  if (scope.squad) parts.push(scope.squad)
  if (scope.from || scope.to) parts.push(`${formatDate(scope.from)} – ${formatDate(scope.to)}`)
  parts.push(`${scope.suiteCount} ciclo(s)`)
  return parts.join(' · ')
}

// ---------- xlsx -----------------------------------------------------------

async function renderXlsx(data: ReportData): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'QA Hub'
  workbook.created = data.generatedAt

  const summary = workbook.addWorksheet('Resumo')
  summary.columns = [{ width: 26 }, { width: 34 }]
  summary.addRow(['Relatório Final', '']).font = { bold: true, size: 14 }
  summary.addRow([scopeDescription(data.scope)])
  summary.addRow([`Gerado em ${formatDate(data.generatedAt)}`])
  summary.addRow([])
  summary.addRow(['Métricas']).font = { bold: true }
  summary.addRow(['Ciclos', data.scope.suiteCount])
  summary.addRow(['Cenários', data.metrics.total])
  summary.addRow(['Executados', `${data.metrics.executed} (${percent(data.metrics.executionRate)})`])
  summary.addRow(['Automatizados', `${data.metrics.automated} (${percent(data.metrics.automationRate)})`])
  summary.addRow(['Aprovados', `${data.metrics.approved} (${percent(data.metrics.passRate)} dos executados)`])
  summary.addRow(['Falhas', data.metrics.failed])
  summary.addRow(['Bloqueados', data.metrics.blocked])
  for (const row of data.byPlatform) {
    summary.addRow([
      `  ${row.platform}`,
      `${row.metrics.total} cenários · ${percent(row.metrics.executionRate)} execução · ${percent(row.metrics.automationRate)} automação`,
    ])
  }
  summary.addRow([])
  summary.addRow(['Bugs']).font = { bold: true }
  summary.addRow(['Total', data.bugs.total])
  summary.addRow(['Corrigidos (Resolved)', data.bugs.fixed])
  for (const row of data.bugs.byPlatform) summary.addRow([`  ${row.platform}`, row.count])
  for (const row of data.bugs.bySeverity) summary.addRow([`  ${row.severity}`, row.count])

  const bugSheet = workbook.addWorksheet('Bugs')
  bugSheet.columns = [
    { header: 'Jira', key: 'jira', width: 14 },
    { header: 'Descrição', key: 'description', width: 60 },
    { header: 'Severidade', key: 'severity', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Plataforma', key: 'platform', width: 10 },
    { header: 'Área afetada', key: 'area', width: 20 },
    { header: 'Responsável', key: 'responsible', width: 18 },
    { header: 'Criado em', key: 'reportedDate', width: 12 },
    { header: 'Corrigido em', key: 'fixedDate', width: 12 },
  ]
  bugSheet.getRow(1).font = { bold: true }
  for (const bug of data.bugs.list) {
    bugSheet.addRow({
      jira: bug.jiraKey ?? `#${bug.number}`,
      description: bug.description ?? '—',
      severity: bug.severity,
      status: bug.status,
      platform: bug.platform,
      area: bug.affectedArea ?? '—',
      responsible: bug.responsible ?? '—',
      reportedDate: formatDate(bug.reportedDate),
      fixedDate: formatDate(bug.fixedDate),
    })
  }

  const failedSheet = workbook.addWorksheet('Cenários Reprovados')
  failedSheet.columns = [
    { header: 'Código', key: 'code', width: 10 },
    { header: 'Cenário', key: 'scenario', width: 60 },
    { header: 'Ciclo', key: 'suite', width: 34 },
    { header: 'Plataforma', key: 'platform', width: 10 },
    { header: 'Responsável', key: 'responsible', width: 18 },
    { header: 'Notas', key: 'notes', width: 40 },
  ]
  failedSheet.getRow(1).font = { bold: true }
  for (const item of data.failedScenarios) {
    failedSheet.addRow({
      code: item.code,
      scenario: item.scenario ?? '—',
      suite: item.suiteName,
      platform: item.platform,
      responsible: item.responsible ?? '—',
      notes: item.notes ?? '',
    })
  }

  return workbook.xlsx.writeBuffer()
}

// ---------- pdf --------------------------------------------------------

const INK = '#101828'
const MUTED = '#667085'
const BORDER = '#eaecf0'
const ACCENT = '#7f56d9'

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8)
  doc.fillColor(ACCENT).fontSize(13).font('Helvetica-Bold').text(title)
  doc.fillColor(INK).font('Helvetica')
  doc.moveDown(0.3)
}

function metricRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y
  doc.fontSize(10).fillColor(MUTED).text(label, doc.page.margins.left, y, { continued: false, width: 200 })
  doc.fontSize(10).fillColor(INK).text(value, doc.page.margins.left + 160, y)
}

/** Tabela simples: largura de coluna fixa, cabeçalho, quebra de página automática. */
function table(doc: PDFKit.PDFDocument, headers: string[], widths: number[], rows: string[][]) {
  const left = doc.page.margins.left
  const usableBottom = doc.page.height - doc.page.margins.bottom

  function drawHeader() {
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
    let x = left
    headers.forEach((header, index) => {
      doc.text(header, x, y, { width: widths[index] })
      x += widths[index]
    })
    doc.moveDown(0.4)
    doc.moveTo(left, doc.y).lineTo(left + widths.reduce((a, b) => a + b, 0), doc.y).strokeColor(BORDER).stroke()
    doc.moveDown(0.3)
    doc.font('Helvetica').fillColor(INK)
  }

  drawHeader()

  for (const row of rows) {
    const heights = row.map((cell, index) => doc.heightOfString(cell || '—', { width: widths[index] }))
    const rowHeight = Math.max(...heights, 12)

    if (doc.y + rowHeight > usableBottom) {
      doc.addPage()
      drawHeader()
    }

    const y = doc.y
    let x = left
    row.forEach((cell, index) => {
      doc.fontSize(9).fillColor(INK).text(cell || '—', x, y, { width: widths[index] })
      x += widths[index]
    })
    doc.y = y + rowHeight + 4
  }
}

function renderPdf(data: ReportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true })

  doc.fillColor(INK).fontSize(20).font('Helvetica-Bold').text('QA Hub — Relatório Final')
  doc.fontSize(10).fillColor(MUTED).font('Helvetica').text(scopeDescription(data.scope))
  doc.text(`Gerado em ${formatDate(data.generatedAt)} — nenhum número aqui é digitado à mão`)

  sectionTitle(doc, 'Métricas')
  metricRow(doc, 'Ciclos', String(data.scope.suiteCount))
  doc.moveDown(0.6)
  metricRow(doc, 'Cenários', String(data.metrics.total))
  doc.moveDown(0.6)
  metricRow(doc, 'Execução', `${percent(data.metrics.executionRate)} (${data.metrics.executed} executados)`)
  doc.moveDown(0.6)
  metricRow(doc, 'Automação', `${percent(data.metrics.automationRate)} (${data.metrics.automated} automatizados)`)
  doc.moveDown(0.6)
  metricRow(doc, 'Aprovação', `${percent(data.metrics.passRate)} (${data.metrics.failed} falhas, ${data.metrics.blocked} bloqueados)`)
  doc.moveDown(0.8)
  for (const row of data.byPlatform) {
    metricRow(
      doc,
      row.platform,
      `${row.metrics.total} cenários · ${percent(row.metrics.executionRate)} execução · ${percent(row.metrics.automationRate)} automação`,
    )
    doc.moveDown(0.6)
  }

  sectionTitle(doc, 'Bugs')
  metricRow(doc, 'Total', String(data.bugs.total))
  doc.moveDown(0.6)
  metricRow(doc, 'Corrigidos', String(data.bugs.fixed))
  doc.moveDown(0.6)
  for (const row of data.bugs.bySeverity) {
    metricRow(doc, row.severity, String(row.count))
    doc.moveDown(0.6)
  }
  doc.moveDown(0.4)

  if (data.bugs.list.length) {
    table(
      doc,
      ['Jira', 'Descrição', 'Severidade', 'Status', 'Responsável'],
      [60, 210, 65, 65, 90],
      data.bugs.list.map((bug) => [
        bug.jiraKey ?? `#${bug.number}`,
        bug.description ?? '',
        bug.severity,
        bug.status,
        bug.responsible ?? '',
      ]),
    )
  } else {
    doc.fontSize(10).fillColor(MUTED).text('Nenhum bug no escopo selecionado.')
  }

  doc.addPage()
  sectionTitle(doc, 'Cenários reprovados')
  if (data.failedScenarios.length) {
    table(
      doc,
      ['Código', 'Cenário', 'Ciclo', 'Responsável'],
      [50, 190, 150, 100],
      data.failedScenarios.map((item) => [item.code, item.scenario ?? '', item.suiteName, item.responsible ?? '']),
    )
  } else {
    doc.fontSize(10).fillColor(MUTED).text('Nenhum cenário reprovado no escopo selecionado.')
  }

  doc.end()
  return doc
}

async function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

export function reportRoutes(app: FastifyInstance) {
  /**
   * Relatório final (US-3.4) — mesmo escopo, dois formatos. Reproduz o
   * espírito da aba "4. Final Report" (resumo + bugs + reprovados), mas com
   * números recalculados na hora, não digitados numa planilha de release em
   * release. A categoria "Usability/Functionality" daquela aba não existe no
   * nosso modelo de bug (nunca foi importada de nenhuma coluna); no lugar,
   * o corte é por severidade, que é o dado real que temos.
   */
  app.get('/api/reports/final', async (request, reply) => {
    try {
      const filters = parse(reportQuery, request.query)
      const data = await buildReportData({
        platform: filters.platform,
        squad: filters.squad,
        suiteIds: filters.suiteIds ? filters.suiteIds.split(',').filter(Boolean) : [],
        from: filters.from,
        to: filters.to,
      })

      const stamp = new Date().toISOString().slice(0, 10)

      if (filters.format === 'xlsx') {
        const buffer = await renderXlsx(data)
        return reply
          .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          .header('Content-Disposition', `attachment; filename="relatorio-final-${stamp}.xlsx"`)
          .send(Buffer.from(buffer))
      }

      const buffer = await streamToBuffer(renderPdf(data))
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="relatorio-final-${stamp}.pdf"`)
        .send(buffer)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
