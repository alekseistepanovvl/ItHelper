param(
  [string]$BaseUrl = "https://prenotami.esteri.it",
  [string]$ServiceText = "TURIZAM",
  [string]$FullyBookedMessage = "Sorry, all appointments for this service are currently booked. Please check again tomorrow for cancellations or new appointments.",
  [ValidateSet("edge", "chrome", "firefox")]
  [string]$BrowserType = "edge",
  [int]$NavigationTimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"
$script:Events = @()

switch ($BrowserType) {
  "edge" {
    $BrowserProcessName = "msedge"
    $BrowserExecutable = "msedge.exe"
    $BrowserDisplayName = "Microsoft Edge"
  }
  "chrome" {
    $BrowserProcessName = "chrome"
    $BrowserExecutable = "chrome.exe"
    $BrowserDisplayName = "Google Chrome"
  }
  "firefox" {
    $BrowserProcessName = "firefox"
    $BrowserExecutable = "firefox.exe"
    $BrowserDisplayName = "Mozilla Firefox"
  }
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function Add-Event {
  param(
    [string]$Stage,
    $Details = $null
  )

  $script:Events += [pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    stage = $Stage
    details = $Details
  }
}

function Get-PrenotamiWindow {
  $process = Get-Process -Name $BrowserProcessName -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -like "*Prenot@mi*"
    } |
    Select-Object -First 1

  if (-not $process) {
    Add-Event "browser.opening" @{
      browser = $BrowserType
      url = $BaseUrl
    }
    Start-Process $BrowserExecutable -ArgumentList $BaseUrl
    $deadline = (Get-Date).AddSeconds($NavigationTimeoutSeconds)
    do {
      Start-Sleep -Milliseconds 500
      $process = Get-Process -Name $BrowserProcessName -ErrorAction SilentlyContinue |
        Where-Object {
          $_.MainWindowHandle -ne 0 -and
          $_.MainWindowTitle -like "*Prenot@mi*"
        } |
        Select-Object -First 1
    } while (-not $process -and (Get-Date) -lt $deadline)
  }

  if (-not $process) {
    throw "Could not open Prenotami in $BrowserDisplayName."
  }

  Add-Event "browser.ready" @{
    browser = $BrowserType
    processId = $process.Id
    title = $process.MainWindowTitle
  }
  return $process
}

function Get-WindowRoot {
  param($Process)

  $Process.Refresh()
  return [System.Windows.Automation.AutomationElement]::FromHandle(
    $Process.MainWindowHandle
  )
}

function Get-DocumentUrl {
  param($Root)

  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document
  )
  $documents = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $condition
  )

  foreach ($document in $documents) {
    try {
      $value = $document.GetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern
      ).Current.Value
      if ($value -like "$BaseUrl*") {
        return $value
      }
    } catch {
      continue
    }
  }

  return $null
}

function Set-EnglishLanguage {
  param($Process)

  $root = Get-WindowRoot -Process $Process
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Hyperlink
  )
  $links = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $condition
  )

  foreach ($link in $links) {
    if ($link.Current.Name -notmatch "^(EN|En)$") {
      continue
    }

    try {
      $link.GetCurrentPattern(
        [System.Windows.Automation.InvokePattern]::Pattern
      ).Invoke()
      Start-Sleep -Seconds 2
      Add-Event "language.english-selected"
      return
    } catch {
      throw "The English language link was found but could not be invoked."
    }
  }

  Add-Event "language.english-link-absent"
  return
}

function Get-HttpDocumentUrls {
  param($Root)

  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document
  )
  $documents = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $condition
  )
  $urls = @()

  foreach ($document in $documents) {
    try {
      $value = $document.GetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern
      ).Current.Value
      if ($value -match "^https?://") {
        $urls += $value
      }
    } catch {
      continue
    }
  }

  return $urls
}

function Ensure-LoggedIn {
  param($Process)

  $root = Get-WindowRoot -Process $Process
  $linkCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Hyperlink
  )
  $links = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $linkCondition
  )
  $loginLink = $null

  foreach ($link in $links) {
    if ($link.Current.Name -match "^Log in to access the portal$") {
      $loginLink = $link
      break
    }
  }

  if (-not $loginLink) {
    Add-Event "login.existing-session"
    return
  }

  Add-Event "login.portal-link-found"
  if (
    -not $env:PRENOTAMI_UIA_USERNAME -or
    -not $env:PRENOTAMI_UIA_PASSWORD
  ) {
    throw "Prenotami UI Automation credentials are not configured."
  }

  $loginLink.GetCurrentPattern(
    [System.Windows.Automation.InvokePattern]::Pattern
  ).Invoke()
  Add-Event "login.iam-opened"

  $formDeadline = (Get-Date).AddSeconds($NavigationTimeoutSeconds)
  $username = $null
  $password = $null
  do {
    Start-Sleep -Milliseconds 500
    $root = Get-WindowRoot -Process $Process
    $urls = @(Get-HttpDocumentUrls -Root $root)
    if ($urls | Where-Object { $_ -like "https://validate.perfdrive.com/*" }) {
      throw "Manual CAPTCHA verification is required in Edge."
    }

    $editCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit
    )
    $edits = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $editCondition
    )
    foreach ($edit in $edits) {
      if ($edit.Current.Name -match "^User Name$") {
        $username = $edit
      } elseif ($edit.Current.Name -match "^Password$") {
        $password = $edit
      }
    }
  } while (
    (-not $username -or -not $password) -and
    (Get-Date) -lt $formDeadline
  )

  if (-not $username -or -not $password) {
    throw "Timed out waiting for the IAM login form."
  }

  $username.GetCurrentPattern(
    [System.Windows.Automation.ValuePattern]::Pattern
  ).SetValue($env:PRENOTAMI_UIA_USERNAME)
  $password.GetCurrentPattern(
    [System.Windows.Automation.ValuePattern]::Pattern
  ).SetValue($env:PRENOTAMI_UIA_PASSWORD)
  Add-Event "login.credentials-filled"

  $root = Get-WindowRoot -Process $Process
  $buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $buttons = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $buttonCondition
  )
  $nextButton = $null
  foreach ($button in $buttons) {
    if ($button.Current.Name -match "^Next$") {
      $nextButton = $button
      break
    }
  }

  if (-not $nextButton) {
    throw "The IAM Next button was not found."
  }

  $nextButton.GetCurrentPattern(
    [System.Windows.Automation.InvokePattern]::Pattern
  ).Invoke()
  Add-Event "login.form-submitted"

  $loginDeadline = (Get-Date).AddSeconds($NavigationTimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 500
    $root = Get-WindowRoot -Process $Process
    $urls = @(Get-HttpDocumentUrls -Root $root)
    if ($urls | Where-Object { $_ -like "https://validate.perfdrive.com/*" }) {
      throw "Manual CAPTCHA verification is required after login."
    }

    $authenticatedUrl = $urls |
      Where-Object {
        $_ -like "$BaseUrl/UserArea*" -or
        $_ -like "$BaseUrl/Services*"
      } |
      Select-Object -First 1
    if ($authenticatedUrl) {
      Add-Event "login.completed" @{
        url = $authenticatedUrl
      }
      return
    }
  } while ((Get-Date) -lt $loginDeadline)

  throw "Timed out waiting for Prenotami login to complete."
}

function Test-DocumentContainsExactText {
  param(
    $Root,
    [string]$Text
  )

  $documentCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document
  )
  $documents = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $documentCondition
  )
  $textCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    $Text
  )

  foreach ($document in $documents) {
    try {
      $value = $document.GetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern
      ).Current.Value
      if ($value -notlike "$BaseUrl*") {
        continue
      }

      $match = $document.FindFirst(
        [System.Windows.Automation.TreeScope]::Descendants,
        $textCondition
      )
      if ($match) {
        return $true
      }
    } catch {
      continue
    }
  }

  return $false
}

function Navigate-Browser {
  param(
    $Process,
    [string]$Url
  )

  $root = Get-WindowRoot -Process $Process
  $editCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit
  )
  $edits = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $editCondition
  )
  $addressBar = $null
  foreach ($edit in $edits) {
    if (
      $edit.Current.Name -match
        "Address and search bar|Address bar|Search with .* or enter address"
    ) {
      $addressBar = $edit
      break
    }
  }

  if (-not $addressBar) {
    throw "$BrowserDisplayName address bar was not found."
  }

  $valuePattern = $addressBar.GetCurrentPattern(
    [System.Windows.Automation.ValuePattern]::Pattern
  )
  [NativeWindow]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
  $addressBar.SetFocus()
  $valuePattern.SetValue($Url)
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Add-Event "navigation.started" @{
    url = $Url
  }

  $deadline = (Get-Date).AddSeconds($NavigationTimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 500
    $root = Get-WindowRoot -Process $Process
    $documentUrl = Get-DocumentUrl -Root $root
    if ($documentUrl -and $documentUrl -ne "about:blank") {
      $path = ([Uri]$documentUrl).AbsolutePath
      if (
        $path -eq "/Services" -or
        $path.StartsWith("/Services/Booking/")
      ) {
        Start-Sleep -Seconds 2
        $finalUrl = Get-DocumentUrl -Root (Get-WindowRoot -Process $Process)
        Add-Event "navigation.completed" @{
          requestedUrl = $Url
          resultUrl = $finalUrl
        }
        return $finalUrl
      }
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out navigating Edge to $Url"
}

function Get-TourismServices {
  param($Root)

  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::DataItem
  )
  $rows = $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $condition
  )
  $services = @()

  foreach ($row in $rows) {
    if (
      $row.Current.Name -notmatch "^VIZE" -or
      $row.Current.Name -notmatch [regex]::Escape($ServiceText)
    ) {
      continue
    }

    $links = $row.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      (New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Hyperlink
      ))
    )

    foreach ($link in $links) {
      if ($link.Current.Name -notlike "REZERVI*") {
        continue
      }

      try {
        $url = $link.GetCurrentPattern(
          [System.Windows.Automation.ValuePattern]::Pattern
        ).Current.Value
        if ($url -match "/Services/Booking/\d+$") {
          $label = [regex]::Match(
            $row.Current.Name,
            "TURIZAM\s*\([^)]*_\d+\)",
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
          ).Value
          $services += [pscustomobject]@{
            label = if ($label) { $label } else { $ServiceText }
            url = $url
          }
        }
      } catch {
        continue
      }
    }
  }

  return $services | Sort-Object url -Unique
}

$process = Get-PrenotamiWindow
Set-EnglishLanguage -Process $process
Ensure-LoggedIn -Process $process
$servicesUrl = "$($BaseUrl.TrimEnd('/'))/Services"
$currentUrl = Get-DocumentUrl -Root (Get-WindowRoot -Process $process)

if (-not $currentUrl -or ([Uri]$currentUrl).AbsolutePath -ne "/Services") {
  $currentUrl = Navigate-Browser -Process $process -Url $servicesUrl
}

if (([Uri]$currentUrl).AbsolutePath -ne "/Services") {
  throw "Edge did not reach the Prenot@mi Services page."
}

$services = @(Get-TourismServices -Root (Get-WindowRoot -Process $process))
if ($services.Count -eq 0) {
  throw "No reservation links matching '$ServiceText' were found."
}
Add-Event "services.discovered" @{
  count = $services.Count
  labels = @($services | ForEach-Object { $_.label })
}

$results = @()
foreach ($service in $services) {
  Add-Event "service.check-started" @{
    label = $service.label
    url = $service.url
  }
  $resultUrl = Navigate-Browser -Process $process -Url $service.url
  $messageFound = $false
  $messageDeadline = (Get-Date).AddSeconds(5)
  do {
    $root = Get-WindowRoot -Process $process
    $messageFound = Test-DocumentContainsExactText `
      -Root $root `
      -Text $FullyBookedMessage
    if (-not $messageFound) {
      Start-Sleep -Milliseconds 250
    }
  } while (-not $messageFound -and (Get-Date) -lt $messageDeadline)

  $available = -not $messageFound

  $results += [pscustomobject]@{
    label = $service.label
    requestedUrl = $service.url
    resultUrl = $resultUrl
    fullyBookedMessageFound = $messageFound
    available = $available
  }
  Add-Event "service.check-completed" @{
    label = $service.label
    resultUrl = $resultUrl
    fullyBookedMessageFound = $messageFound
    available = $available
  }

  if ($available) {
    break
  }
}

[pscustomobject]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  browser = $BrowserType
  events = $script:Events
  services = $results
} | ConvertTo-Json -Depth 5 -Compress
