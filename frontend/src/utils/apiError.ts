import axios from 'axios'

type ValidationDetail = {
  msg?: string
  loc?: Array<string | number>
}

const hasMessage = (value: unknown): value is { message: string } =>
  typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'

const hasDetail = (value: unknown): value is { detail: unknown } =>
  typeof value === 'object' && value !== null && 'detail' in value

const isValidationDetail = (value: unknown): value is ValidationDetail =>
  typeof value === 'object' && value !== null && ('msg' in value || 'loc' in value)

const detailToMessage = (detail: unknown): string | null => {
  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => detailToMessage(item))
      .filter((message): message is string => Boolean(message))

    return messages.length > 0 ? messages.join('; ') : null
  }

  if (isValidationDetail(detail)) {
    const location = Array.isArray(detail.loc) ? detail.loc.join(' -> ') : null
    if (location && detail.msg) {
      return `${location}: ${detail.msg}`
    }

    if (detail.msg) {
      return detail.msg
    }
  }

  if (hasMessage(detail)) {
    return detail.message
  }

  if (hasDetail(detail)) {
    return detailToMessage(detail.detail)
  }

  return null
}

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  const directMessage = detailToMessage(error)
  if (directMessage) {
    return directMessage
  }

  if (axios.isAxiosError(error)) {
    return detailToMessage(error.response?.data?.detail) ?? detailToMessage(error.response?.data) ?? error.message ?? fallback
  }

  if (hasMessage(error)) {
    return error.message
  }

  return fallback
}
