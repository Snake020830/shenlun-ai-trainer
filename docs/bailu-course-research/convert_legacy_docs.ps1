param(
    [string]$ResearchRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $ResearchRoot 'corpus-manifest.csv'
$outputRoot = Join-Path $ResearchRoot 'legacy-docx'
$conversionManifest = Join-Path $ResearchRoot 'legacy-conversion-manifest.csv'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$pending = Import-Csv -LiteralPath $manifestPath | Where-Object {
    $_.Status -eq '待转换' -and $_.Extension -in @('.doc', '.wps')
}
$results = [System.Collections.Generic.List[object]]::new()
$word = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    # msoAutomationSecurityForceDisable: do not execute macros in course files.
    $word.AutomationSecurity = 3

    $index = 0
    foreach ($row in $pending) {
        $index++
        $source = $row.FullPath
        $bytes = [System.IO.File]::ReadAllBytes($source)
        $sha = [System.Security.Cryptography.SHA256]::HashData($bytes)
        $digest = [Convert]::ToHexString($sha)
        $safeStem = [regex]::Replace([System.IO.Path]::GetFileNameWithoutExtension($source), '[^0-9A-Za-z\p{IsCJKUnifiedIdeographs}_-]+', '_').Trim('_')
        if ($safeStem.Length -gt 70) { $safeStem = $safeStem.Substring(0, 70) }
        $target = Join-Path $outputRoot ($digest.Substring(0, 12) + '__' + $safeStem + '.docx')
        $status = '已转换'
        $message = ''
        $document = $null
        try {
            if (-not (Test-Path -LiteralPath $target)) {
                # ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false.
                $document = $word.Documents.Open($source, $false, $true, $false)
                # wdFormatDocumentDefault (.docx)
                $document.SaveAs2($target, 16)
            }
        }
        catch {
            $status = '失败'
            $message = $_.Exception.Message
        }
        finally {
            if ($null -ne $document) {
                $document.Close(0)
                [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
            }
        }

        $results.Add([pscustomobject]@{
            Status = $status
            Message = $message
            SHA256 = $digest
            ConvertedPath = if ($status -eq '已转换') { $target } else { '' }
            RelativePath = $row.RelativePath
            FullPath = $source
        })
        if (($index % 10) -eq 0) { Write-Host "converted $index / $($pending.Count)" }
    }
}
finally {
    if ($null -ne $word) {
        $word.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$results | Export-Csv -LiteralPath $conversionManifest -NoTypeInformation -Encoding utf8BOM
$success = @($results | Where-Object Status -eq '已转换').Count
$failed = @($results | Where-Object Status -eq '失败').Count
Write-Output "converted=$success failed=$failed"
