Unicode true
ManifestDPIAware true
RequestExecutionLevel user
Name "AlumexFlow Desktop"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\AlumexFlow Desktop"
InstallDirRegKey HKCU "Software\AlumexFlow Desktop" "InstallDir"
SetCompressor /SOLID lzma
SetDatablockOptimize on
BrandingText "AlumexFlow Desktop"
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "AlumexFlow Desktop"
VIAddVersionKey /LANG=1033 "FileDescription" "AlumexFlow Desktop Setup"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Alumex"

!include "MUI2.nsh"
!include "x64.nsh"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\AlumexFlow.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "AlumexFlow Desktop requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd

Section "AlumexFlow Desktop" MainSection
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\AlumexFlow Desktop" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "DisplayName" "AlumexFlow Desktop"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "Publisher" "Alumex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "DisplayIcon" "$INSTDIR\resources\app\assets\alumex.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\AlumexFlow Desktop"
  CreateShortcut "$SMPROGRAMS\AlumexFlow Desktop\AlumexFlow Desktop.lnk" "$INSTDIR\AlumexFlow.exe" "" "$INSTDIR\resources\app\assets\alumex.ico"
  CreateShortcut "$DESKTOP\AlumexFlow Desktop.lnk" "$INSTDIR\AlumexFlow.exe" "" "$INSTDIR\resources\app\assets\alumex.ico"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\AlumexFlow Desktop.lnk"
  Delete "$SMPROGRAMS\AlumexFlow Desktop\AlumexFlow Desktop.lnk"
  RMDir "$SMPROGRAMS\AlumexFlow Desktop"
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\AlumexFlow Desktop"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlumexFlow Desktop"
  ; AppData holds the employee's offline work and is deliberately preserved.
SectionEnd
