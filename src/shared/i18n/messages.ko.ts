// 한국어 system message single source — adapter error, updater dialog, priceService error.
// 향후 다국어 추가 시 messages.en.ts 등 동일 shape 으로 작성하고 messages.ts 의 locale 분기.
export const koMessages = {
  adapter: {
    invalidSymbol: (adapterId: string) => `${adapterId}에 없는 심볼입니다`,
    finnhubKeyMissing: 'Finnhub API 키가 필요합니다 (설정에서 입력)',
    tradingviewLoadFailed: (err: string) => `@mathieuc/tradingview 로드 실패: ${err}`,
    tradingviewInitFailed: 'TradingView 어댑터 초기화 실패',
    tradingviewModuleMissing: 'TradingView 모듈 없음',
    tradingviewSessionFailed: (err: string) => `TradingView 세션 생성 실패: ${err}`,
    tradingviewSymbolFailed: (err: string) => `TradingView 심볼 생성 실패: ${err}`,
    tradingviewError: (err: string) => `TradingView 오류: ${err}`,
    tradingviewDisabled: 'TradingView 어댑터가 비활성화되어 있습니다 (설정에서 활성화)',
    unsupportedAssetType: '지원하지 않는 자산 유형입니다.',
    receiveFailed: '시세 수신 실패',
  },
  updater: {
    info: '정보',
    error: '오류',
    devModeBlocked: '개발 모드에서는 업데이트 확인이 동작하지 않습니다.',
    upToDate: (version: string) => `현재 최신 버전을 사용 중입니다 (v${version}).`,
    checkFailed: (msg: string) => `업데이트 확인 실패: ${msg}`,
    foundTitle: '업데이트 발견',
    foundMessage: (version: string) => `새 버전 v${version} 이 있습니다.`,
    downloadPrompt: '지금 다운로드할까요? (다운로드 중에도 위젯 사용 가능)',
    downloadButton: '다운로드',
    laterButton: '나중에',
    downloadFailed: (msg: string) => `다운로드 실패: ${msg}`,
    downloadedTitle: '업데이트 다운로드 완료',
    downloadedMessage: (version: string) => `v${version} 다운로드가 완료되었습니다.`,
    restartPrompt: '지금 재시작하고 적용하시겠습니까?',
    restartButton: '재시작·적용',
  },
}
