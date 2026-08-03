; ============================================================
;  Amazon Pet ERP  –  Inno Setup Installation Script
;  Version 1.0.0
; ============================================================

#define AppName    "Amazon Pet ERP"
#define AppVersion "1.0.0"
#define AppExe     "Amazon Pet.exe"
#define Publisher  "Amazon Pet"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
AppPublisherURL=http://www.amazon-pet.com
AppSupportURL=http://www.amazon-pet.com/support
AppUpdatesURL=http://www.amazon-pet.com/updates

; Installation Directory
; Use ProgramFiles64 so the app sits in C:\Program Files and can write to its own folder
DefaultDirName={autopf}\AmazonPetERP
DefaultGroupName={#AppName}

; Output
OutputDir=..\installer
OutputBaseFilename=AmazonPet_Setup_v{#AppVersion}

; Visuals
#ifexist "icon.ico"
SetupIconFile=icon.ico
#endif
WizardStyle=modern
WizardSizePercent=100

; Compression
Compression=lzma2/ultra64
SolidCompression=yes

; Privileges – needs admin so the app can write to C:\AnimaSysData on first launch
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Windows version requirement (Windows 10+)
MinVersion=10.0.17763

; Misc
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=no
AllowNoIcons=yes
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}

; Architecture
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "arabic";  MessagesFile: "compiler:Languages\Arabic.isl"

; ─── TASKS ──────────────────────────────────────────────────────────────────
[Tasks]
Name: "desktopicon";     Description: "{cm:CreateDesktopIcon}";      GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon";     Description: "Launch Amazon Pet on Windows startup"; GroupDescription: "Startup Options:"; Flags: unchecked

; ─── FILES ──────────────────────────────────────────────────────────────────
[Files]
; PackDir can be overridden by ISCC: /DPackDir=C:\path\to\electron-builder-output
#ifndef PackDir
  #define PackDir "packaged-build"
#endif
; Copy ALL Electron win-unpacked contents → {app}
Source: "{#PackDir}\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

; ─── ICONS ──────────────────────────────────────────────────────────────────
[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}";Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";  Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"; Tasks: desktopicon

; ─── REGISTRY (optional startup) ────────────────────────────────────────────
[Registry]
; Use HKLM because PrivilegesRequired=admin (machine-wide startup for all users)
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#AppName}"; ValueData: """{app}\{#AppExe}"""; Flags: uninsdeletevalue; Tasks: startupicon

; ─── DIRECTORIES ────────────────────────────────────────────────────────────
; Pre-create the AnimaSysData folder so MySQL can initialise with correct permissions
[Dirs]
Name: "C:\AnimaSysData";            Permissions: users-full
Name: "C:\AnimaSysData\Logs";       Permissions: users-full
Name: "C:\AnimaSysData\Backups";    Permissions: users-full
Name: "C:\AnimaSysData\database_data"; Permissions: users-full

; ─── RUN ────────────────────────────────────────────────────────────────────
[Run]
; Launch the app after setup completes
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent shellexec

; ─── UNINSTALL RUN ──────────────────────────────────────────────────────────
[UninstallRun]
; Gracefully stop MySQL before uninstalling
Filename: "taskkill"; Parameters: "/F /IM mysqld.exe"; Flags: runhidden; RunOnceId: "KillMySQL"
Filename: "taskkill"; Parameters: "/F /IM javaw.exe";  Flags: runhidden; RunOnceId: "KillJava"

; ─── UNINSTALL DELETE ───────────────────────────────────────────────────────
; NOTE: We intentionally do NOT delete C:\AnimaSysData on uninstall
;       so the client's database data is preserved.
[UninstallDelete]
Type: filesandordirs; Name: "{app}"
