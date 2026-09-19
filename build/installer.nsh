!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "${windows_folder_local_appdata}\${product_shortname}"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "${windows_folder_local_appdata}\${product_shortname}"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "${windows_folder_local_appdata}\${product_shortname}"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "${windows_folder_local_appdata}\${product_shortname}"
!macroend