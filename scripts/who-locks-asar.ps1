param(
  [string]$Target = ""
)
if (-not $Target) {
  $Target = Join-Path $PSScriptRoot "..\desktop\packaged\win-unpacked\resources\app.asar"
  $Target = [IO.Path]::GetFullPath($Target)
}
if (-not (Test-Path -LiteralPath $Target)) {
  Write-Host "File not found (nothing to diagnose): $Target"
  exit 0
}

$signature = @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Collections.Generic;

public static class FileLockUtil2 {
  private const int CCH_RM_MAX_APP_NAME = 255;
  private const int CCH_RM_MAX_SVC_NAME = 63;

  [StructLayout(LayoutKind.Sequential)]
  struct RM_UNIQUE_PROCESS {
    public int dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)]
    public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)]
    public string strServiceShortName;
    public uint ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)]
    public bool bRestartable;
  }

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

  [DllImport("rstrtmgr.dll")]
  static extern int RmEndSession(uint pSessionHandle);

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames,
    uint nApplications, IntPtr rgApplications, uint nServices, string[] rgsServiceNames);

  [DllImport("rstrtmgr.dll")]
  static extern int RmGetList(uint pSessionHandle, out uint pnProcInfoNeeded,
    ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, out uint lpdwRebootReasons);

  public static List<string> WhoLocks(string path) {
    var result = new List<string>();
    uint handle;
    string key = Guid.NewGuid().ToString();
    int res = RmStartSession(out handle, 0, key);
    if (res != 0) { result.Add("RmStartSession failed: " + res); return result; }
    try {
      string[] files = new string[] { path };
      res = RmRegisterResources(handle, (uint)files.Length, files, 0, IntPtr.Zero, 0, null);
      if (res != 0) { result.Add("RmRegisterResources failed: " + res); return result; }

      uint needed = 0;
      uint count = 0;
      uint reboot = 0;
      res = RmGetList(handle, out needed, ref count, null, out reboot);
      if (res == 234) {
        count = needed;
        var arr = new RM_PROCESS_INFO[count];
        res = RmGetList(handle, out needed, ref count, arr, out reboot);
        if (res == 0) {
          for (int i = 0; i < count; i++) {
            int pid = arr[i].Process.dwProcessId;
            string name = arr[i].strAppName;
            string exe = "";
            try { exe = Process.GetProcessById(pid).MainModule.FileName; } catch {}
            result.Add("PID=" + pid + " App=" + name + " Path=" + exe);
          }
        } else {
          result.Add("RmGetList(2) failed: " + res);
        }
      } else if (res == 0) {
        result.Add("(no locking processes reported)");
      } else {
        result.Add("RmGetList failed: " + res);
      }
    } finally {
      RmEndSession(handle);
    }
    return result;
  }
}
"@

Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue | Out-Null
Write-Host "Processes locking: $Target"
[FileLockUtil2]::WhoLocks($Target) | ForEach-Object { Write-Host "  $_" }
