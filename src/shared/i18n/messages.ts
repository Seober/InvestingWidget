// i18n 단일 진입점 — 현재 ko 만 지원, 향후 locale 추가 시 분기.
import { koMessages } from './messages.ko'

export const t = koMessages
export type Messages = typeof koMessages
