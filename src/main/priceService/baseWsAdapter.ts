import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { AdapterStatus } from '@shared/schema'
import type { PriceAdapter } from './types'

// Base WebSocket adapter — binance/gateio/finnhub 의 공통 lifecycle 추출.
// 공통: WS connect/reconnect with exponential backoff, status 전이, send wrapper, destroy cleanup.
// Subclass 책임: getWsUrl/onWsOpen/handleMessage/hasSubscriptions + 자체 state maps + send protocol.
//
// Extension 포인트:
// - getWsUrl(): URL string 반환. null 이면 connect skip (예: finnhub apiKey 없을 때).
// - onWsOpen(): WS open 직후 호출 — 보유 sub 재전송 + REST snapshot 등 recovery 작업.
// - handleMessage(msg): 수신된 JSON 파싱 후 호출. tick/itemError emit 책임.
// - hasSubscriptions(): close 이벤트 시 reconnect 결정용 — 활성 sub 있으면 true.
// - onDestroy(): destroy() 시 추가 cleanup (timer 등) — closeWs/reconnectTimer 는 base 가 처리.

const RECONNECT_INITIAL_MS = 1000
const RECONNECT_MAX_MS = 30_000

export abstract class BaseWsAdapter extends EventEmitter implements PriceAdapter {
  abstract readonly id: string

  protected ws: WebSocket | null = null
  protected currentStatus: AdapterStatus = 'closed'
  protected reconnectDelayMs = RECONNECT_INITIAL_MS
  protected reconnectTimer: NodeJS.Timeout | null = null
  protected destroyed = false

  // Subclass 가 구현
  protected abstract getWsUrl(): string | null
  protected abstract hasSubscriptions(): boolean
  protected abstract onWsOpen(): void
  protected abstract handleMessage(msg: unknown): void
  abstract subscribe(item: import('@shared/schema').ItemConfig): void
  abstract unsubscribe(itemId: string): void

  // Subclass 가 override 가능 (timer 등 자체 cleanup)
  protected onDestroy(): void {
    // default no-op
  }

  status(): AdapterStatus {
    return this.currentStatus
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.onDestroy()
    this.closeWs()
  }

  protected connectIfNeeded(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    )
      return
    if (this.destroyed) return
    const url = this.getWsUrl()
    if (!url) return // adapter not ready (e.g. finnhub no apiKey)
    this.setStatus('connecting')
    this.ws = new WebSocket(url)

    this.ws.on('open', () => {
      this.setStatus('open')
      this.reconnectDelayMs = RECONNECT_INITIAL_MS
      this.onWsOpen()
    })

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        this.handleMessage(msg)
      } catch {
        // ignore non-JSON frames (pings handled by ws automatically)
      }
    })

    this.ws.on('close', () => {
      this.ws = null
      if (!this.destroyed && this.hasSubscriptions()) {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      } else {
        this.setStatus('closed')
      }
    })

    this.ws.on('error', () => {
      // close handler reconnect 처리
    })
  }

  protected scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS)
      this.connectIfNeeded()
    }, this.reconnectDelayMs)
  }

  protected closeWs(): void {
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
  }

  protected setStatus(s: AdapterStatus, message?: string): void {
    if (s === this.currentStatus) return
    this.currentStatus = s
    this.emit('status', s, message)
  }

  // 안전한 WS send — open 상태가 아니면 false 반환 (silent skip)
  protected sendWs(payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    return true
  }
}
