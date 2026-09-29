param(
    [ValidateSet('backup','build','list','restore')][string]$Action = 'backup',
    [string]$Label = 'manual',
    [string]$Id
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$vault = Join-Path (Split-Path $root -Parent) 'irotomo-backups'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-Snapshot {
    if ($Label -notmatch '^[a-zA-Z0-9_-]{1,60}$') { throw 'Label must contain 1-60 letters, digits, underscores or hyphens.' }
    $stamp = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $Label + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $entry = Join-Path $vault $stamp
    $source = Join-Path $entry 'source'
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $root -Force) {
        if ($item.Name -in @('.git','node_modules','dist','.vercel')) { continue }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked files are not supported.' }
        Copy-Item -LiteralPath $item.FullName -Destination $source -Recurse -Force
    }
    $hashes = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force | ForEach-Object {
        [ordered]@{path=$_.FullName.Substring($source.Length+1); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
    })
    $archive = Join-Path $entry 'source.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($source,$archive)
    [ordered]@{
        id=$stamp; created=(Get-Date).ToString('o'); label=$Label
        archiveSha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
        files=$hashes
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $entry 'manifest.json') -Encoding UTF8
    # A complete snapshot is marked only after the archive and manifest succeed.
    Set-Content -LiteralPath (Join-Path $entry 'COMPLETE') -Value $stamp -Encoding ASCII
    return $entry
}

switch ($Action) {
    'list' {
        if (Test-Path -LiteralPath $vault) {
            Get-ChildItem -LiteralPath $vault -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'COMPLETE') } | Select-Object -ExpandProperty Name
        }
    }
    'backup' { New-Snapshot }
    'build' {
        $entry = New-Snapshot
        $source = Join-Path $entry 'source'
        $public = Join-Path $entry 'public'
        New-Item -ItemType Directory -Path $public | Out-Null
        # Explicit public allowlist. Add future public assets here.
        foreach ($name in @('index.html','board.html','privacy.html','gallery.html','seat.html','kana.html','logo.png','og.png','robots.txt','sitemap.xml')) {
            Copy-Item -LiteralPath (Join-Path $source $name) -Destination $public
        }
        [IO.Compression.ZipFile]::CreateFromDirectory($public,(Join-Path $entry 'frontend.zip'))
        Set-Content -LiteralPath (Join-Path $entry 'BUILD-COMPLETE') -Value 'Static files packaged; application tests are separate.' -Encoding ASCII
        Write-Output "Backup: $entry"
        Write-Output "Deploy frontend only: $public"
        Write-Output "Frontend archive: $(Join-Path $entry 'frontend.zip')"
    }
    'restore' {
        if (!$Id -or $Id -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Specify an exact snapshot Id from list.' }
        $entry = Join-Path $vault $Id
        if (!(Test-Path -LiteralPath (Join-Path $entry 'COMPLETE'))) { throw 'Snapshot is missing or incomplete.' }
        $archive = Join-Path $entry 'source.zip'
        $manifest = Get-Content -LiteralPath (Join-Path $entry 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $manifest.archiveSha256) { throw 'Archive checksum mismatch.' }
        # Back up the current workspace before preparing a rollback.
        $Label = 'before-restore'
        $safety = New-Snapshot
        $target = Join-Path (Split-Path $root -Parent) ('irotomo-restored-' + [guid]::NewGuid().ToString('N'))
        [IO.Compression.ZipFile]::ExtractToDirectory($archive,$target)
        foreach ($file in $manifest.files) {
            $candidate = [IO.Path]::GetFullPath((Join-Path $target $file.path))
            if (!$candidate.StartsWith($target + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid manifest path.' }
            if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -ne $file.sha256) { throw "File checksum mismatch: $($file.path)" }
        }
        Write-Output "Current workspace backup: $safety"
        Write-Output "Verified rollback workspace: $target"
        Write-Output 'Open the restored folder to continue or build it for redeployment. Original workspace is unchanged.'
    }
}

