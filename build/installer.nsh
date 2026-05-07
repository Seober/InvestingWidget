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
;    Components 페이지에서 hide. 빈 이름 SectionSetText 로 표시 제거 — NSIS 표준 동작.
;    customInit 은 installer.nsi 의 .onInit 안 (Section 정의 후) 에서 호출되므로 ID 사용 가능.
!macro customInit
  SectionSetText ${INSTALL_SECTION_ID} ""
!macroend

; -- 페이지 추가 hook (electron-builder 의 assistedInstaller.nsh:42 에서 호출, INSTDIR sanitize 후)
!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_COMPONENTS
!macroend

; -- 바로가기 옵션 Section (Components 페이지에서 사용자 체크박스로 선택)
Section "바탕화면 바로가기" SecDesktop
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
SectionEnd

Section "시작메뉴 바로가기" SecStartMenu
  CreateDirectory "$SMPROGRAMS\${SHORTCUT_NAME}"
  CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
SectionEnd

; -- uninstall 시 사용자가 만든 바로가기 함께 제거 + 빈 INSTDIR 폴더 정리
; RMDir 은 default 가 empty-only 이므로 다른 파일 남아있으면 안전하게 skip.
!macro customUnInstall
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}\${SHORTCUT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${SHORTCUT_NAME}"
  RMDir "$INSTDIR"
!macroend
