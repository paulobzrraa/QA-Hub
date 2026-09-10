import { z } from 'zod'
import {
  CASE_STATUS, SUITE_STATUS, ENVIRONMENT, PLATFORM, SQUAD, PERSON_ROLE,
  BUG_SEVERITY, BUG_STATUS, USER_KIND, USER_ENV, USER_STATUS, ACCESS_ROLE,
} from './domain.js'
import { normalizeCpf } from './test-users.js'

/** Texto opcional: string vazia da UI vira `null` no banco. */
const optionalText = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()

export const personInput = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(PERSON_ROLE).default('QA'),
  active: z.boolean().default(true),
})

export const suiteInput = z.object({
  name: z.string().trim().min(1, 'Nome do ciclo é obrigatório').max(300),
  jiraKey: optionalText,
  platform: z.enum(PLATFORM),
  squad: z.enum(SQUAD).nullable().optional(),
  status: z.enum(SUITE_STATUS).default('To Do'),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  responsibleId: z.string().nullable().optional(),
  notes: optionalText,
})

export const caseInput = z.object({
  code: z.string().trim().min(1).max(40),
  jiraKey: optionalText,
  scenario: optionalText,
  objective: optionalText,
  bdd: optionalText,
  automated: z.boolean().default(false),
  environment: z.enum(ENVIRONMENT).nullable().optional(),
  testData: optionalText,
  responsibleId: z.string().nullable().optional(),
  qaStatus: z.enum(CASE_STATUS).default('Backlog'),
  stageStatus: z.enum(CASE_STATUS).default('Backlog'),
  notes: optionalText,
})

export const affectedAreaInput = z.object({
  name: z.string().trim().min(1, 'Nome da área é obrigatório').max(120),
})

export const bugInput = z.object({
  number: z.string().trim().min(1).max(40),
  jiraKey: optionalText,
  relatedUs: optionalText,
  description: optionalText,
  platform: z.enum(PLATFORM),
  severity: z.enum(BUG_SEVERITY).default('Medium'),
  status: z.enum(BUG_STATUS).default('Open'),
  responsibleId: z.string().nullable().optional(),
  affectedAreaId: z.string().nullable().optional(),
  reportedDate: z.coerce.date().nullable().optional(),
  fixedDate: z.coerce.date().nullable().optional(),
  notes: optionalText,
})

/**
 * Conta da massa de teste (US-4.1). `cpf` entra com ou sem máscara e é
 * guardado só com os dígitos — a busca compara dígito a dígito, então a
 * normalização tem que acontecer na borda, não na tela.
 */
export const testUserInput = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().optional(),
  cpf: z
    .string()
    .trim()
    .transform((value) => normalizeCpf(value))
    .nullable()
    .optional(),
  password: z.string().max(200).nullable().optional(),
  kind: z.enum(USER_KIND).nullable().optional(),
  environment: z.enum(USER_ENV),
  status: z.enum(USER_STATUS).default('Ativo'),
  profile: optionalText,
  notes: optionalText,
})

export const suiteUpdate = suiteInput.partial()
export const caseUpdate = caseInput.partial()
export const bugUpdate = bugInput.partial()
export const testUserUpdate = testUserInput.partial()

export type PersonInput = z.infer<typeof personInput>
export type SuiteInput = z.infer<typeof suiteInput>
export type CaseInput = z.infer<typeof caseInput>
export type AffectedAreaInput = z.infer<typeof affectedAreaInput>
export type BugInput = z.infer<typeof bugInput>
export type TestUserInput = z.infer<typeof testUserInput>

/**
 * Credenciais de acesso ao QA Hub (US-5.1). Nada a ver com `testUserInput`,
 * que é a massa de contas usada PARA testar.
 */
export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe a senha'),
})

/** Mínimo de 10 caracteres: é a chave do sistema inteiro, não uma conta de teste. */
const accountPassword = z.string().min(10, 'A senha precisa de pelo menos 10 caracteres').max(200)

export const accountInput = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  password: accountPassword,
  role: z.enum(ACCESS_ROLE).default('viewer'),
  /** Liga a conta a uma pessoa do time, para o histórico apontar para ela. */
  personId: z.string().nullable().optional(),
})

export const accountUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ACCESS_ROLE).optional(),
  active: z.boolean().optional(),
  personId: z.string().nullable().optional(),
})

export const passwordChange = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: accountPassword,
})

export type LoginInput = z.infer<typeof loginInput>
export type AccountInput = z.infer<typeof accountInput>
