import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { appendFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Cifragem em repouso das senhas da massa de teste (US-4.2).
 *
 * AES-256-GCM: além de cifrar, autentica — um valor adulterado no banco falha
 * na decifragem em vez de devolver lixo silenciosamente.
 *
 * A chave vive em `apps/api/.env` (fora do controle de versão) e o dado vive
 * em `data/qahub.db`. São dois lugares diferentes de propósito: o problema que
 * esta US resolve é a planilha com senha em texto puro circulando por e-mail,
 * então uma cópia solta do banco não pode bastar para ler as senhas.
 */

const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url))
const KEY_VAR = 'CREDENTIALS_KEY'
const KEY_BYTES = 32
const IV_BYTES = 12

/** Marca o formato do valor cifrado — permite trocar de esquema depois. */
const PREFIX = 'enc:v1:'

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey

  // O projeto não usa dotenv; o Node 20.12+ lê o arquivo nativamente.
  if (!process.env[KEY_VAR] && existsSync(ENV_PATH)) {
    try {
      process.loadEnvFile(ENV_PATH)
    } catch {
      // .env ilegível não é fatal: cai na geração abaixo.
    }
  }

  const raw = process.env[KEY_VAR]
  if (raw) {
    const key = Buffer.from(raw, 'base64')
    if (key.length !== KEY_BYTES) {
      // Nunca gerar uma chave nova por cima de uma existente e inválida:
      // isso tornaria todo valor já cifrado impossível de recuperar.
      throw new Error(
        `${KEY_VAR} inválida: esperados ${KEY_BYTES} bytes em base64, encontrados ${key.length}.`,
      )
    }
    cachedKey = key
    return key
  }

  // Primeira execução: gera e persiste. Derrubar o servidor seria pior para
  // uma ferramenta local, e guardar em .env mantém a chave fora do banco.
  const key = randomBytes(KEY_BYTES)
  const encoded = key.toString('base64')
  appendFileSync(
    ENV_PATH,
    `\n# Chave de cifragem das senhas da massa de teste (US-4.2).\n` +
      `# Gerada automaticamente. Perder esta chave torna as senhas irrecuperáveis.\n` +
      `${KEY_VAR}=${encoded}\n`,
  )
  process.env[KEY_VAR] = encoded
  console.warn(`[crypto] ${KEY_VAR} gerada e gravada em ${ENV_PATH}. Faça backup: sem ela, as senhas não voltam.`)

  cachedKey = key
  return key
}

/** `true` se o valor já está no formato cifrado desta versão. */
export function isEncrypted(value: string | null): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/** Cifra um valor. Já cifrado passa direto — a operação é idempotente. */
export function encrypt(value: string | null): string | null {
  if (value === null || value === '') return value
  if (isEncrypted(value)) return value

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decifra um valor.
 *
 * Valor sem o prefixo é texto puro anterior à US-4.2 e volta como está — a
 * migração pode rodar depois do deploy sem que a tela quebre no intervalo.
 */
export function decrypt(value: string | null): string | null {
  if (value === null || value === '') return value
  if (!isEncrypted(value)) return value

  const [iv, tag, payload] = value.slice(PREFIX.length).split(':')
  if (!iv || !tag || !payload) throw new Error('Valor cifrado malformado')

  const decipher = createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
