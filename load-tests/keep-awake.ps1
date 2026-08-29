# Keeps this machine awake (no sleep/display-off-driven suspend) for the duration of the 16h soak,
# using the standard SetThreadExecutionState Windows API -- a per-process request that reverts
# automatically the moment this script exits, not a persistent power-plan change.
Add-Type -Name Power -Namespace Win32 -MemberDefinition @'
[DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@

$ES_CONTINUOUS = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"
$ES_AWAYMODE_REQUIRED = [uint32]"0x00000040"

$durationMin = if ($env:KEEP_AWAKE_DURATION_MIN) { [int]$env:KEEP_AWAKE_DURATION_MIN } else { 960 }
$endAt = (Get-Date).AddMinutes($durationMin)
Write-Output "[keep-awake] starting, duration=$durationMin min, until $endAt"

while ((Get-Date) -lt $endAt) {
    [Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_AWAYMODE_REQUIRED) | Out-Null
    Start-Sleep -Seconds 60
}
Write-Output "[keep-awake] duration elapsed, releasing execution-state request"
