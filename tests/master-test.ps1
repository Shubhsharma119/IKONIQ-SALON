$base = 'http://localhost:5000/api'
$ph = Read-Host 'Owner phone'
$pw = Read-Host 'Owner password'
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (ConvertTo-Json -InputObject @{ phone = $ph; password = $pw })
$h = @{ Authorization = "Bearer $($login.token)" }
$script:pass = 0; $script:fail = 0; $script:failed = @()
function Check([string]$name, $cond, [string]$detail = '') {
  if ($cond) { $script:pass++; Write-Host ("PASS  " + $name) -ForegroundColor Green }
  else { $script:fail++; $script:failed += $name; Write-Host ("FAIL  " + $name + "  " + $detail) -ForegroundColor Red }
}
function Near($a, $b) { return [math]::Abs([double]$a - [double]$b) -lt 0.011 }
function Master($from, $to) {
  $u = "$base/master-report?from=" + [uri]::EscapeDataString($from.ToUniversalTime().ToString('o')) + '&to=' + [uri]::EscapeDataString($to.ToUniversalTime().ToString('o'))
  return Invoke-RestMethod $u -Headers $h
}
function Code($from, $to) {
  $u = "$base/master-report?from=" + [uri]::EscapeDataString($from) + '&to=' + [uri]::EscapeDataString($to)
  try { Invoke-RestMethod $u -Headers $h | Out-Null; return 200 } catch { return [int]$_.Exception.Response.StatusCode }
}
$s = (Get-Date).Date
$m = Master $s $s.AddDays(1)
$d = Invoke-RestMethod "$base/dashboard" -Headers $h
Write-Host "`n== Today: master report against the dashboard" -ForegroundColor Cyan
Check 'Total sales equals dashboard sales' (Near $m.current.billed $d.todaySales) "master $($m.current.billed) dashboard $($d.todaySales)"
Check 'Collection equals dashboard collection' (Near $m.current.collection $d.todayCollection) "master $($m.current.collection) dashboard $($d.todayCollection)"
Check 'Expenses equal dashboard expenses' (Near $m.current.expenses $d.todayExpenses) "master $($m.current.expenses) dashboard $($d.todayExpenses)"
Check 'Net profit = net sales - product cost - expenses' (Near $m.current.profit ($m.current.netSales - $m.current.cogs - $m.current.expenses))
Check 'Cash flow net = collection - expenses - supplier payments' (Near $m.cashFlow.net ($m.current.collection - $m.current.expenses - $m.purchasing.paidToSuppliers))
Check 'One trend point for one day' (@($m.trend).Count -eq 1) "got $(@($m.trend).Count)"
Check 'Trend sales equals total sales' (Near (($m.trend | Measure-Object sales -Sum).Sum) $m.current.billed)
Check 'Average bill is total / bills' (($m.current.bills -eq 0) -or (Near $m.current.avgBill ($m.current.billed / $m.current.bills)))
Write-Host "`n== Longer ranges" -ForegroundColor Cyan
$w = Master $s.AddDays(-6) $s.AddDays(1)
Check 'Last 7 days gives 7 daily points' (@($w.trend).Count -eq 7 -and $w.range.bucket -eq 'day') "got $(@($w.trend).Count) $($w.range.bucket)"
Check 'Trend sales equals total sales (7 days)' (Near (($w.trend | Measure-Object sales -Sum).Sum) $w.current.billed)
Check 'Trend collection equals collection (7 days)' (Near (($w.trend | Measure-Object collection -Sum).Sum) $w.current.collection)
Check 'Trend expenses equal expenses (7 days)' (Near (($w.trend | Measure-Object expenses -Sum).Sum) $w.current.expenses)
Check 'Payment modes add up to the collection' (Near (($w.payModes | Measure-Object amount -Sum).Sum) $w.current.collection)
$y = Master $s.AddDays(-200) $s.AddDays(1)
Check 'A 200 day range is grouped by month' ($y.range.bucket -eq 'month' -and @($y.trend).Count -ge 6) "got $($y.range.bucket) $(@($y.trend).Count)"
Check 'Monthly trend sales equals total sales' (Near (($y.trend | Measure-Object sales -Sum).Sum) $y.current.billed)
$prevCheck = Master $s.AddDays(-13) $s.AddDays(-6)
$w3 = Master $s.AddDays(-2) $s.AddDays(1)
$p3 = Master $s.AddDays(-5) $s.AddDays(-2)
Check 'Previous period of a 3 day range matches the real previous 3 days' (Near $w3.previous.billed $p3.current.billed) "got $($w3.previous.billed) vs $($p3.current.billed)"
Check 'Previous period of a 7 day range matches the real previous 7 days' (Near $w.previous.billed $prevCheck.current.billed) "got $($w.previous.billed) vs $($prevCheck.current.billed)"
Write-Host "`n== Snapshot and safety" -ForegroundColor Cyan
Check 'Snapshot has receivable, supplier due, stock and wallet' (($null -ne $m.snapshot.receivable.total) -and ($null -ne $m.snapshot.supplierDue.total) -and ($null -ne $m.snapshot.stock.value) -and ($null -ne $m.snapshot.wallet.balance))
Check 'Sales mix adds up to the item amounts (not above billed + discounts)' ((($w.salesMix | Measure-Object amount -Sum).Sum) -ge ($w.current.netSales - 0.011) -or $w.current.bills -eq 0)
Check 'A reversed date range is rejected' ((Code $s.AddDays(1).ToUniversalTime().ToString('o') $s.ToUniversalTime().ToString('o')) -eq 400)
Check 'A range over 400 days is rejected' ((Code $s.AddDays(-500).ToUniversalTime().ToString('o') $s.ToUniversalTime().ToString('o')) -eq 400)
Check 'Garbage dates are rejected' ((Code 'abc' 'xyz') -eq 400)
try { Invoke-RestMethod "$base/master-report?from=2026-01-01&to=2026-02-01" | Out-Null; $c = 200 } catch { $c = [int]$_.Exception.Response.StatusCode }
Check 'No login token is rejected (401)' ($c -eq 401) "got $c"
Write-Host ("`n==== RESULT: " + $script:pass + " passed, " + $script:fail + " failed ====") -ForegroundColor Cyan
if ($script:fail -gt 0) { $script:failed | ForEach-Object { Write-Host (' - ' + $_) -ForegroundColor Red } }

