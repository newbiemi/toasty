; Toasty custom NSIS uninstaller hook
; Called by electron-builder during uninstall.
; Removes the startup Run entry Electron wrote at runtime so it never
; survives as an orphaned pointer to a deleted .exe.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Toasty"
!macroend
