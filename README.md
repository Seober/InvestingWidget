# InvestingWidget

Windows 데스크톱에서 항상 위에 떠 있는 미니 위젯. 암호화폐(현물/선물) + 미국 주식/ETF + 한국 주식의 실시간 가격을 표시합니다.

## 주요 기능

- **항상 위 + 프레임리스 + 투명**
- **마우스 휠** = 투명도 조절 (0.15 ~ 1.0)
- **좌클릭 드래그** = 위젯 이동
- **행 좌클릭** = 거래소/차트 페이지 새 탭 열기
- **우클릭** = 메뉴 (항목 관리[추가·목록 편집], 갱신 간격, 설정, 항상 위, 자동 시작, 종료)
- 종료 후 재시작해도 위치·항목·갱신주기·투명도 등 모두 복원
- **기본 갱신주기 0.5초** (WebSocket 푸시 기반, 설정에서 100ms~5s 변경 가능)

## 데이터 소스

| 자산 유형 | 소스 | 비고 |
|---|---|---|
| 암호화폐 현물 | Binance WebSocket | 인증 불필요 |
| 암호화폐 선물 (USDT-M) | Binance WebSocket | 인증 불필요 |
| 미국 주식 / ETF | Finnhub WebSocket | **API 키 필요** ([finnhub.io](https://finnhub.io) 무료 발급) |
| 한국 주식 | TradingView WebSocket (비공식) | 설정에서 옵트인. 실험적, 깨질 수 있음 |

## 시작하기

### 개발 모드

```bash
npm install
npm run dev
```

### Windows .exe 빌드 (WSL/Linux 또는 Windows에서)

```bash
npm run package:win
```

산출물:
- `release/InvestingWidget Setup x.y.z.exe` (NSIS 설치 파일)
- `release/InvestingWidget-x.y.z-portable.exe` (포터블)

> **첫 실행 시 SmartScreen 경고**: 코드 서명 인증서가 없어서 "Windows에서 PC를 보호했습니다" 경고가 뜰 수 있습니다. **추가 정보 → 실행** 으로 진행하세요.

## 사용 방법

1. 위젯이 화면 우상단에 뜹니다.
2. 우클릭 → **항목 관리 → 항목 추가**
3. 자산 유형을 선택하고 심볼 입력:
   - 암호화폐: `BTC`, `ETH` (Quote는 기본 `USDT`, 변경 가능)
   - 미국 주식/ETF: `AAPL`, `SPY` — Finnhub API 키가 설정되어야 동작
   - 한국 주식: `005930` (KRX 자동 prefix), 코스닥은 `KOSDAQ:091990`
4. 추가 시 시세 1건 수신해야 등록됩니다 (잘못된 티커는 거부).
5. 행을 좌클릭하면 거래소/차트 페이지로 이동합니다.
6. 마우스 휠로 투명도 조절, 좌클릭 드래그로 이동.
7. 항목 일괄 정리: 우클릭 → **항목 관리 → 목록 편집** (드래그로 순서 변경, 체크박스 일괄 삭제, 행별 편집)

## 한국 주식 사용 시 주의

TradingView WebSocket은 **비공식 엔드포인트**입니다. 라이브러리/엔드포인트가 변경되면 한국 주식 행이 멈출 수 있습니다. 깨지면 설정에서 토글 OFF하세요. 안정적인 실시간이 필요하면 한국투자증권 KIS Open API 어댑터로 마이그레이션 가능합니다 (현재 미구현).

## 설정 파일 위치

- Windows: `%APPDATA%\investing-widget\config.json`

## 디렉토리 구조

```
src/
├─ main/             Electron 메인 프로세스 (윈도우, IPC, 영속화, 메뉴)
│  └─ priceService/  Binance/Finnhub/TradingView 어댑터
├─ preload/          contextBridge로 IPC를 렌더러에 노출
├─ renderer/         React UI (Zustand, 모달, 행 컴포넌트)
└─ shared/           메인/렌더러 공용 타입과 IPC 채널 상수
```

## 로드맵 (Phase 2)

- 시스템 트레이 + 위젯 숨김/복원
- Upbit/Bybit 어댑터
- 스파크라인 (작은 차트)
- 목표가 알림
- 한국투자증권 KIS Open API (TradingView 대체)

## 라이선스

MIT
