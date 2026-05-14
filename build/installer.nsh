; NSIS custom installer script — electron-builder 의 NSIS template 위에 추가되는 매크로.
;
; INSTDIR sanitize (디렉토리 자동 append) 는 patches/app-builder-lib+25.1.8.patch 가 instFilesPre
; 함수의 부분 문자열 검사를 마지막 segment 정확 검사로 교체해 처리. 본 파일은 Components 페이지만.
;
; Components 페이지 — 사용자가 바탕화면·시작메뉴 바로가기를 체크박스로 선택 (default 둘 다 체크).
; createDesktopShortcut/createStartMenuShortcut: false 로 default 자동 생성 끄고, 본 파일의 두 Section 이
; 사용자 선택 따라 생성.

; LogicLib + FileFunc 명시 include — customInclude hook 이 main installer.nsi 보다 먼저 처리되어
; ${if}·${GetOptions} 등 매크로가 정의 전 상태. 우리가 직접 include 필요 (NSIS 표준 include 라 안전).
!include LogicLib.nsh
!include FileFunc.nsh

!define MUI_COMPONENTSPAGE_NODESC

; -- electron-builder 의 default install Section ("install" INSTALL_SECTION_ID, installer.nsi:87) 을
;    Components 페이지에서 hide. NsisTarget.js:553 의 customInclude 가 우리 nsh 를 main
;    installer.nsi 보다 *먼저* 처리해 SecDesktop=0, SecStartMenu=1, install=2 순으로 등록되므로
;    hardcoded index 사용은 fragile. SectionGetText 로 모든 Section 순회·이름 "install" 인 것
;    찾아 SectionSetText 빈 이름 hide 로 변경 — 등록 순서·Section 추가에 robust.
;    SectionGetFlags 의 error flag 로 valid index 한계 정확 detect (hidden Section "" 안전).
;    StrCmp 는 case-insensitive 라 template 의 case 변경에도 robust.
;    Push/Pop 으로 $0/$1/$2 보존 — 다른 hook 의 composability 보호.
!macro customInit
  Push $0
  Push $1
  Push $2
  StrCpy $0 0
  customInit_loop:
    ClearErrors
    SectionGetFlags $0 $2
    IfErrors customInit_done
    SectionGetText $0 $1
    StrCmp $1 "install" 0 customInit_next
    SectionSetText $0 ""
  customInit_next:
    IntOp $0 $0 + 1
    Goto customInit_loop
  customInit_done:
  Pop $2
  Pop $1
  Pop $0
!macroend

; -- 페이지 추가 hook (electron-builder 의 assistedInstaller.nsh:42 에서 호출, INSTDIR sanitize 후)
!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_COMPONENTS
!macroend

; -- --updated argv 검사 매크로 — electron-updater 의 quitAndInstall 이 setup.exe 에 --updated 인자를
;    항상 붙임 (template uninstaller.nsh:202-204 와 동일 패턴). argv 에 있으면 update flow.
;    결과를 ${_flag} 에 "1" (updated) 또는 "0" (fresh install) 로 저장. 내부 $R0/$R1 Push/Pop 보존.
;    ${isUpdated} 매크로의 정의 위치를 template 내부에서 못 찾았기에 argv 직접 검사로 deterministic 처리.
!macro checkIsUpdated _flag
  Push $R0
  Push $R1
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${if} ${Errors}
    StrCpy ${_flag} "0"
  ${else}
    StrCpy ${_flag} "1"
  ${endIf}
  Pop $R1
  Pop $R0
!macroend

; -- 바로가기 옵션 Section (Components 페이지에서 사용자 체크박스로 선택)
; 업데이트 시(--updated argv 있음) 엔 바로가기 안 건드림 — 최초 설치에서 사용자가 선택한 상태 보존.
; per-user 설치라 INSTDIR 경로 안 바뀌므로 기존 바로가기는 stale 되지 않음.
Section "바탕화면 바로가기" SecDesktop
  Push $0
  !insertmacro checkIsUpdated $0
  ${if} $0 == "1"
    Pop $0
    Return
  ${endIf}
  Pop $0
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
SectionEnd

Section "시작메뉴 바로가기" SecStartMenu
  Push $0
  !insertmacro checkIsUpdated $0
  ${if} $0 == "1"
    Pop $0
    Return
  ${endIf}
  Pop $0
  CreateDirectory "$SMPROGRAMS\${SHORTCUT_NAME}"
  CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
SectionEnd

; -- uninstall 시 바로가기 함께 제거. 단 update flow (--updated argv) 에선
; 새 버전 install 의 SecDesktop/SecStartMenu 가 가드로 재생성 안 하므로
; 여기서 지우면 바로가기가 영구 사라짐 → update 시엔 바로가기 보존.
; RMDir "$INSTDIR" 은 default empty-only 라 install 단계가 파일 채우면 그대로 둠 → update flow 에도 안전.
!macro customUnInstall
  Push $0
  !insertmacro checkIsUpdated $0
  ${if} $0 == "0"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}\${SHORTCUT_NAME}.lnk"
    RMDir "$SMPROGRAMS\${SHORTCUT_NAME}"
  ${endIf}
  Pop $0
  RMDir "$INSTDIR"
!macroend
