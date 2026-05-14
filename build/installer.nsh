; NSIS custom installer script — electron-builder 의 NSIS template 위에 추가되는 매크로.
;
; INSTDIR sanitize (디렉토리 자동 append) 는 patches/app-builder-lib+25.1.8.patch 가 instFilesPre
; 함수의 부분 문자열 검사를 마지막 segment 정확 검사로 교체해 처리. 본 파일은 Components 페이지만.
;
; Components 페이지 — 사용자가 바탕화면·시작메뉴 바로가기를 체크박스로 선택 (default 둘 다 체크).
; createDesktopShortcut/createStartMenuShortcut: false 로 default 자동 생성 끄고, 본 파일의 두 Section 이
; 사용자 선택 따라 생성.

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

; -- 바로가기 옵션 Section (Components 페이지에서 사용자 체크박스로 선택)
; ${isUpdated} = setup.exe 가 --updated argv 로 실행된 경우 (electron-updater 의 update flow).
; 업데이트 시엔 바로가기 안 건드림 — 최초 설치에서 사용자가 선택한 상태 보존.
; per-user 설치라 INSTDIR 경로 안 바뀌므로 기존 바로가기는 stale 되지 않음.
Section "바탕화면 바로가기" SecDesktop
  ${if} ${isUpdated}
    Return
  ${endIf}
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
SectionEnd

Section "시작메뉴 바로가기" SecStartMenu
  ${if} ${isUpdated}
    Return
  ${endIf}
  CreateDirectory "$SMPROGRAMS\${SHORTCUT_NAME}"
  CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
SectionEnd

; -- uninstall 시 바로가기 함께 제거. 단 update flow (${isUpdated}=TRUE) 에선
; 새 버전 install 의 SecDesktop/SecStartMenu 가 ${isUpdated} 가드로 재생성 안 하므로
; 여기서 지우면 바로가기가 영구 사라짐 → update 시엔 바로가기 보존.
; RMDir "$INSTDIR" 은 default empty-only 라 install 단계가 파일 채우면 그대로 둠 → update flow 에도 안전.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}\${SHORTCUT_NAME}.lnk"
    RMDir "$SMPROGRAMS\${SHORTCUT_NAME}"
  ${endIf}
  RMDir "$INSTDIR"
!macroend
