$ErrorActionPreference = 'Continue'
$base = 'http://localhost:5000/api'
$ph = Read-Host 'Owner phone'
$pw = Read-Host 'Owner password'
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (ConvertTo-Json -InputObject @{ phone = $ph; password = $pw })
$h = @{ Authorization = "Bearer $($login.token)" }
$tag = Get-Date -Format 'HHmmss'
$script:pass = 0
$script:fail = 0
$script:failed = @()
function Call([string]$method, [string]$path, $body = $null) {
  $p = @{ Method = $method; Uri = ($base + $path); Headers = $h; ContentType = 'application/json' }
  if ($null -ne $body) { $p.Body = (ConvertTo-Json -InputObject $body -Depth 8) }
  try {
    $r = Invoke-RestMethod @p
    return [pscustomobject]@{ ok = $true; code = 200; data = $r; msg = '' }
  } catch {
    $err = $_
    $code = 0
    try { $code = [int]$err.Exception.Response.StatusCode } catch { }
    $msg = ''
    try { $msg = ($err.ErrorDetails.Message | ConvertFrom-Json).message } catch { $msg = [string]$err.ErrorDetails.Message }
    return [pscustomobject]@{ ok = $false; code = $code; data = $null; msg = $msg }
  }
}
function Check([string]$name, $cond, [string]$detail = '') {
  if ($cond) { $script:pass++; Write-Host ("PASS  " + $name) -ForegroundColor Green }
  else { $script:fail++; $script:failed += $name; Write-Host ("FAIL  " + $name + "  " + $detail) -ForegroundColor Red }
}
function Near($a, $b) { return [math]::Abs([double]$a - [double]$b) -lt 0.011 }
function Dash { return (Call GET '/dashboard').data }
function Stock($id) { $p = (Call GET '/products').data | Where-Object { $_.id -eq $id }; return [double]$p.stockQty }
Write-Host "`n== Setup" -ForegroundColor Cyan
$phone = '9' + (Get-Random -Minimum 100000000 -Maximum 999999999)
$supPhone = '9' + (Get-Random -Minimum 100000000 -Maximum 999999999)
$cust = Call POST '/customers' @{ name = "ZZ Test Customer $tag"; phone = $phone }
$cat = Call POST '/services/categories' @{ name = "ZZ Cat $tag" }
$cat2 = Call POST '/services/categories' @{ name = "ZZ Cat2 $tag" }
$svc = Call POST '/services' @{ name = "ZZ Haircut $tag"; categoryId = $cat.data.id; price = 500; durationMin = 30 }
$prod = Call POST '/products' @{ name = "ZZ Product $tag"; sku = "ZZ$tag"; unit = 'piece'; usage = 'SALE'; costPrice = 50; salePrice = 100; openingStock = 10; lowStockLevel = 2 }
$salon = Call POST '/products' @{ name = "ZZ Salon Use $tag"; sku = "ZZS$tag"; unit = 'piece'; usage = 'SALON_USE'; costPrice = 10; salePrice = 10; openingStock = 5 }
if (-not ($cust.ok -and $cat.ok -and $cat2.ok -and $svc.ok -and $prod.ok -and $salon.ok)) {
  Write-Host 'SETUP FAILED - cannot continue. Check that the backend is running and the login is an Owner.' -ForegroundColor Red
  Write-Host ("customer: " + $cust.msg + " | category: " + $cat.msg + " | service: " + $svc.msg + " | product: " + $prod.msg + " | salon product: " + $salon.msg)
  exit 1
}
$custId = $cust.data.id
$svcId = $svc.data.id
$prodId = $prod.data.id
$salonId = $salon.data.id
Write-Host "`n== Security and basic errors" -ForegroundColor Cyan
try { Invoke-RestMethod -Uri "$base/customers" -ErrorAction Stop | Out-Null; $c401 = 200 } catch { $c401 = [int]$_.Exception.Response.StatusCode }
Check 'No login token is rejected (401)' ($c401 -eq 401) "got $c401"
$r = Call GET '/customers/999999'
Check 'Unknown customer gives 404' ($r.code -eq 404) "got $($r.code)"
$r = Call GET '/invoices/999999'
Check 'Unknown bill gives 404' ($r.code -eq 404) "got $($r.code)"
$r = Call GET '/customers?q=%27%20OR%201%3D1%20--'
Check 'Search with quote characters does not crash' $r.ok "got $($r.code)"
$r = Call GET '/customers?q=%3Cscript%3E'
Check 'Search with script characters does not crash' $r.ok "got $($r.code)"
Write-Host "`n== Customer and service validation" -ForegroundColor Cyan
$r = Call POST '/customers' @{ name = 'ZZ Bad Phone'; phone = '12345' }
Check 'Customer: 5-digit mobile rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/customers' @{ name = 'ZZ Bad Start'; phone = '5876543210' }
Check 'Customer: mobile starting with 5 rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/customers' @{ name = 'Z'; phone = '9876543211' }
Check 'Customer: 1-letter name rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/customers' @{ name = 'ZZ Dup'; phone = $phone }
Check 'Customer: same mobile twice rejected (409)' ($r.code -eq 409) "got $($r.code)"
$r = Call POST '/services' @{ name = "zz haircut $tag "; categoryId = $cat.data.id; price = 400; durationMin = 20 }
Check 'Service: same name in same category rejected (case and space ignored)' ($r.code -eq 409) "got $($r.code)"
$svcB = Call POST '/services' @{ name = "ZZ Haircut $tag"; categoryId = $cat2.data.id; price = 450; durationMin = 30 }
Check 'Service: same name in a different category is allowed' $svcB.ok
$r = Call POST '/services' @{ name = 'X'; categoryId = $cat.data.id; price = 10 }
Check 'Service: 1-letter name rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/services' @{ name = "ZZ Neg $tag"; categoryId = $cat.data.id; price = -5 }
Check 'Service: negative price rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/services/categories' @{ name = "zz cat $tag" }
Check 'Category: same name twice rejected' ($r.code -eq 409) "got $($r.code)"
Write-Host "`n== Billing maths, stock and payments" -ForegroundColor Cyan
$s0 = Stock $prodId
$items = @( @{ type = 'SERVICE'; serviceId = $svcId; qty = 1 }, @{ type = 'PRODUCT'; productId = $prodId; qty = 2 } )
$pv = Call POST '/invoices/preview' @{ customerId = $custId; items = $items; isGst = $true; gstRate = 18; discountType = 'PERCENT'; discountValue = 10 }
Check 'Maths: subtotal 700 (500 + 2 x 100)' (Near $pv.data.subtotal 700) "got $($pv.data.subtotal)"
Check 'Maths: 10 percent discount = 70' (Near $pv.data.discountAmount 70) "got $($pv.data.discountAmount)"
Check 'Maths: taxable amount 630' (Near $pv.data.taxableAmount 630) "got $($pv.data.taxableAmount)"
Check 'Maths: GST 18 percent = 113.40' (Near $pv.data.gstAmount 113.4) "got $($pv.data.gstAmount)"
Check 'Maths: total 743.40' (Near $pv.data.total 743.4) "got $($pv.data.total)"
$inv = Call POST '/invoices' @{ customerId = $custId; items = $items; isGst = $true; gstRate = 18; discountType = 'PERCENT'; discountValue = 10; payments = @( @{ mode = 'CASH'; amount = 100 } ) }
Check 'Bill saved with part payment gives PARTIAL' ($inv.ok -and $inv.data.status -eq 'PARTIAL') "$($inv.msg)"
Check 'Bill number looks like SP/2026-27/0001' ($inv.data.invoiceNo -match '^SP/\d{4}-\d{2}/\d{4}$') "got $($inv.data.invoiceNo)"
Check 'Stock reduced by 2 after selling 2 pieces' ((Stock $prodId) -eq ($s0 - 2))
$due = [math]::Round([double]$inv.data.total - 100, 2)
$r = Call POST "/invoices/$($inv.data.id)/payments" @{ mode = 'UPI'; amount = ($due + 1) }
Check 'Paying more than the due is rejected' (-not $r.ok)
$r = Call POST "/invoices/$($inv.data.id)/payments" @{ mode = 'UPI'; amount = $due }
Check 'Paying the exact due makes the bill PAID' ($r.ok -and $r.data.status -eq 'PAID') "$($r.msg)"
$r = Call POST '/invoices' @{ customerId = $custId; items = @( @{ type = 'PRODUCT'; productId = $prodId; qty = 1000 } ) }
Check 'Selling more than the stock is rejected' (($r.code -eq 400) -and ($r.msg -match 'stock')) "$($r.msg)"
$r = Call POST '/invoices' @{ customerId = $custId; items = @( @{ type = 'PRODUCT'; productId = $salonId; qty = 1 } ) }
Check 'Salon-use product cannot be sold' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/invoices' @{ customerId = $custId; items = @( @{ type = 'SERVICE'; serviceId = $svcId; qty = 1 } ); payments = @( @{ mode = 'CASH'; amount = 99999 } ) }
Check 'Payment above the bill total is rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/invoices' @{ customerId = $custId; items = @() }
Check 'Empty bill is rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/invoices' @{ customerId = 999999; items = @( @{ type = 'SERVICE'; serviceId = $svcId; qty = 1 } ) }
Check 'Bill for an unknown customer is rejected' ($r.code -eq 400) "got $($r.code)"
Check 'Stock is not changed by the rejected bills' ((Stock $prodId) -eq ($s0 - 2))
Write-Host "`n== Guest bills" -ForegroundColor Cyan
$r = Call POST '/invoices' @{ guestName = 'ZZ Guest'; items = @( @{ type = 'MEMBERSHIP'; planId = 1 } ) }
Check 'Guest cannot buy a membership' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/invoices' @{ guestName = 'ZZ Guest'; items = @( @{ type = 'PRODUCT'; productId = $prodId; qty = 1 } ); payments = @( @{ mode = 'CASH'; amount = 50 } ) }
Check 'Guest bill must be paid in full' (($r.code -eq 400) -and ($r.msg -match 'full')) "$($r.msg)"
$r = Call POST '/invoices' @{ guestName = 'ZZ Guest'; items = @( @{ type = 'PRODUCT'; productId = $prodId; qty = 1 } ); payments = @( @{ mode = 'UPI'; amount = 100 } ) }
Check 'Guest bill paid in full is accepted' ($r.ok -and $r.data.status -eq 'PAID') "$($r.msg)"
Write-Host "`n== E-Wallet" -ForegroundColor Cyan
$d0 = Dash
$r = Call POST '/wallet/offers' @{ name = "ZZ Bad $tag"; payAmount = 2000; creditAmount = 1000 }
Check 'Wallet offer with credit below payment is rejected' ($r.code -eq 400) "got $($r.code)"
$off = Call POST '/wallet/offers' @{ name = "ZZ Offer $tag"; payAmount = 2000; creditAmount = 3000 }
Check 'Wallet offer pay 2000 get 3000 created' $off.ok
$t1 = Call POST "/wallet/customer/$custId/topup" @{ paidAmount = 1000; bonusAmount = 500; mode = 'CASH' }
Check 'Top-up 1000 + 500 extra gives balance 1500' ($t1.ok -and (Near $t1.data.balance 1500)) "$($t1.msg)"
$t2 = Call POST "/wallet/customer/$custId/topup" @{ offerId = $off.data.id; mode = 'UPI' }
Check 'Top-up with the offer adds 3000 (balance 4500)' ($t2.ok -and (Near $t2.data.balance 4500)) "$($t2.msg)"
$r = Call POST "/wallet/customer/$custId/topup" @{ paidAmount = 0; mode = 'CASH' }
Check 'Top-up of 0 is rejected' ($r.code -eq 400) "got $($r.code)"
$d1 = Dash
Check 'Dashboard collection grows by the money received only (3000)' (Near ($d1.todayCollection - $d0.todayCollection) 3000) "got $($d1.todayCollection - $d0.todayCollection)"
$w1 = Call POST '/invoices' @{ customerId = $custId; items = @( @{ type = 'SERVICE'; serviceId = $svcId; qty = 1 } ); payments = @( @{ mode = 'WALLET'; amount = 500 } ) }
Check 'Bill paid fully from the E-Wallet is PAID' ($w1.ok -and $w1.data.status -eq 'PAID') "$($w1.msg)"
$wl = Call GET "/wallet/customer/$custId"
Check 'Wallet balance after the bill is 4000' (Near $wl.data.balance 4000) "got $($wl.data.balance)"
$d2 = Dash
Check 'Wallet payment is not counted as new collection' (Near ($d2.todayCollection - $d1.todayCollection) 0) "got $($d2.todayCollection - $d1.todayCollection)"
Check 'Wallet-paid bill is counted in sales (+500)' (Near ($d2.todaySales - $d1.todaySales) 500) "got $($d2.todaySales - $d1.todaySales)"
$r = Call POST '/invoices' @{ customerId = $custId; items = @( @{ type = 'SERVICE'; serviceId = $svcId; qty = 10 } ); payments = @( @{ mode = 'WALLET'; amount = 5000 } ) }
Check 'Paying more than the wallet balance is rejected' (($r.code -eq 400) -and ($r.msg -match 'wallet')) "$($r.msg)"
$r = Call POST '/invoices' @{ guestName = 'ZZ Guest'; items = @( @{ type = 'PRODUCT'; productId = $prodId; qty = 1 } ); payments = @( @{ mode = 'WALLET'; amount = 100 } ) }
Check 'A guest cannot pay from the E-Wallet' ($r.code -eq 400) "got $($r.code)"
$wl2 = Call GET "/wallet/customer/$custId"
Check 'Wallet balance unchanged after the rejected bills' (Near $wl2.data.balance 4000) "got $($wl2.data.balance)"
Check 'Wallet history has 3 entries (2 top-ups, 1 bill)' (@($wl2.data.transactions).Count -eq 3) "got $(@($wl2.data.transactions).Count)"
Check 'Latest wallet entry is the bill with balance 4000' (($wl2.data.transactions[0].type -eq 'PAYMENT') -and (Near $wl2.data.transactions[0].balanceAfter 4000))
$r = Call POST "/wallet/customer/$custId/adjust" @{ amount = -999999; note = 'ZZ test' }
Check 'Adjustment below zero balance is rejected' ($r.code -eq 400) "got $($r.code)"
Write-Host "`n== Delete service keeps history" -ForegroundColor Cyan
$svc3 = Call POST '/services' @{ name = "ZZ Delete Me $tag"; categoryId = $cat.data.id; price = 300; durationMin = 15 }
$b3 = Call POST '/invoices' @{ customerId = $custId; items = @( @{ type = 'SERVICE'; serviceId = $svc3.data.id; qty = 1 } ); payments = @( @{ mode = 'CASH'; amount = 300 } ) }
Check 'Service used in a bill' $b3.ok
$del = Call DELETE "/services/$($svc3.data.id)"
Check 'A service already used in a bill can be deleted' $del.ok "$($del.msg)"
$list = Call GET '/services'
Check 'Deleted service is gone from the list' (-not ($list.data | Where-Object { $_.id -eq $svc3.data.id }))
$old = Call GET "/invoices/$($b3.data.id)"
Check 'Old bill still shows the deleted service name' ($old.ok -and $old.data.items[0].name -eq "ZZ Delete Me $tag")
$again = Call POST '/services' @{ name = "ZZ Delete Me $tag"; categoryId = $cat.data.id; price = 320; durationMin = 15 }
Check 'The deleted name can be added again' $again.ok "$($again.msg)"
$r = Call DELETE "/services/categories/$($cat.data.id)"
Check 'A category with live services cannot be deleted' ($r.code -eq 409) "got $($r.code)"
$prof = Call GET "/history/customer/$custId"
Check 'Customer history keeps the deleted service under services taken' (@($prof.data.services | Where-Object { $_.name -eq "ZZ Delete Me $tag" }).Count -ge 1)
Check 'Customer history lists all bills (at least 4)' (@($prof.data.bills).Count -ge 4) "got $(@($prof.data.bills).Count)"
$r = Call DELETE '/services/999999'
Check 'Deleting an unknown service gives 404' ($r.code -eq 404) "got $($r.code)"
Write-Host "`n== Expenses" -ForegroundColor Cyan
$d3 = Dash
$ec = Call GET '/expenses/categories'
Check 'Expense categories exist' ($ec.ok -and @($ec.data).Count -ge 1)
$catId = $ec.data[0].id
$e1 = Call POST '/expenses' @{ categoryId = $catId; amount = 250; mode = 'CASH'; payee = "ZZ Payee $tag" }
Check 'Expense of 250 saved' $e1.ok "$($e1.msg)"
$r = Call POST '/expenses' @{ categoryId = $catId; amount = 0; mode = 'CASH' }
Check 'Expense with amount 0 rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call POST '/expenses' @{ categoryId = $catId; amount = 99999999999; mode = 'CASH' }
Check 'Expense with an absurd amount rejected' ($r.code -eq 400) "got $($r.code)"
$future = (Get-Date).AddDays(5).ToUniversalTime().ToString('o')
$r = Call POST '/expenses' @{ categoryId = $catId; amount = 10; mode = 'CASH'; expenseDate = $future }
Check 'Expense with a future date rejected' ($r.code -eq 400) "got $($r.code)"
$d4 = Dash
Check 'Dashboard expenses up by 250' (Near ($d4.todayExpenses - $d3.todayExpenses) 250) "got $($d4.todayExpenses - $d3.todayExpenses)"
Check 'Dashboard profit down by 250' (Near ($d4.estimatedProfit - $d3.estimatedProfit) -250) "got $($d4.estimatedProfit - $d3.estimatedProfit)"
$r = Call POST "/expenses/$($e1.data.id)/void" @{ reason = 'x' }
Check 'Void needs a reason of 3 or more letters' ($r.code -eq 400) "got $($r.code)"
$r = Call POST "/expenses/$($e1.data.id)/void" @{ reason = 'ZZ test cleanup' }
Check 'Expense voided' $r.ok "$($r.msg)"
$r = Call POST "/expenses/$($e1.data.id)/void" @{ reason = 'ZZ test cleanup' }
Check 'Voiding twice is rejected' ($r.code -eq 400) "got $($r.code)"
$r = Call PUT "/expenses/$($e1.data.id)" @{ amount = 500 }
Check 'A voided expense cannot be edited' ($r.code -eq 400) "got $($r.code)"
$d5 = Dash
Check 'Dashboard expenses back to normal after void' (Near ($d5.todayExpenses - $d3.todayExpenses) 0)
Write-Host "`n== Suppliers and purchases" -ForegroundColor Cyan
$r = Call POST '/suppliers' @{ name = 'ZZ Bad Supplier'; phone = '123' }
Check 'Supplier: bad mobile rejected' ($r.code -eq 400) "got $($r.code)"
$sup = Call POST '/suppliers' @{ name = "ZZ Supplier $tag"; phone = $supPhone }
Check 'Supplier created' $sup.ok "$($sup.msg)"
$r = Call POST '/suppliers' @{ name = "zz supplier $tag" }
Check 'Supplier: same name twice rejected' ($r.code -eq 409) "got $($r.code)"
$supId = $sup.data.id
$s1 = Stock $prodId
$pu = Call POST '/purchases' @{ supplierId = $supId; billNo = "ZZB$tag"; items = @( @{ productId = $prodId; qty = 10; rate = 50; gstRate = 18 } ); payments = @( @{ mode = 'CASH'; amount = 300 } ) }
Check 'Purchase total = 500 + 18 percent GST = 590' ($pu.ok -and (Near $pu.data.total 590)) "$($pu.msg)"
Check 'Purchase number looks like PUR/2026-27/0001' ($pu.data.purchaseNo -match '^PUR/\d{4}-\d{2}/\d{4}$') "got $($pu.data.purchaseNo)"
Check 'Stock increased by 10 after the purchase' ((Stock $prodId) -eq ($s1 + 10))
$r = Call POST '/purchases' @{ supplierId = $supId; billNo = "zzb$tag"; items = @( @{ productId = $prodId; qty = 1; rate = 50 } ) }
Check 'Same supplier bill number twice rejected' ($r.code -eq 409) "got $($r.code)"
$r = Call POST '/purchases' @{ supplierId = $supId; items = @( @{ productId = $prodId; qty = 1; rate = 50 } ); payments = @( @{ mode = 'CASH'; amount = 99999 } ) }
Check 'Purchase payment above the total rejected' ($r.code -eq 400) "got $($r.code)"
$sd = Call GET "/suppliers/$supId"
Check 'Supplier due = 590 - 300 = 290' (Near $sd.data.summary.due 290) "got $($sd.data.summary.due)"
$r = Call POST "/suppliers/$supId/payments" @{ mode = 'UPI'; amount = 100 }
Check 'Paying the supplier 100 accepted' $r.ok "$($r.msg)"
$r = Call POST "/suppliers/$supId/payments" @{ mode = 'UPI'; amount = 5000 }
Check 'Paying the supplier more than the due rejected' ($r.code -eq 400) "got $($r.code)"
$sd = Call GET "/suppliers/$supId"
Check 'Supplier due is now 190' (Near $sd.data.summary.due 190) "got $($sd.data.summary.due)"
$v = Call POST "/purchases/$($pu.data.id)/void" @{ reason = 'ZZ test cleanup' }
Check 'Purchase can be cancelled while its stock is still there' $v.ok "$($v.msg)"
Check 'Stock goes back to the earlier value' ((Stock $prodId) -eq $s1)
$sd = Call GET "/suppliers/$supId"
Check 'Supplier due is 0 after cancelling the purchase' (Near $sd.data.summary.due 0) "got $($sd.data.summary.due)"
$pu2 = Call POST '/purchases' @{ supplierId = $supId; items = @( @{ productId = $prodId; qty = 5; rate = 50 } ) }
$cur = Stock $prodId
$sell = [int]($cur - 2)
$g = Call POST '/invoices' @{ guestName = 'ZZ Guest'; items = @( @{ type = 'PRODUCT'; productId = $prodId; qty = $sell } ); payments = @( @{ mode = 'CASH'; amount = ($sell * 100) } ) }
Check 'Most of the new stock sold' $g.ok "$($g.msg)"
$r = Call POST "/purchases/$($pu2.data.id)/void" @{ reason = 'ZZ test' }
Check 'Cancelling a purchase whose stock is already sold is blocked' (($r.code -eq 400) -and ($r.msg -match 'Cannot void')) "$($r.msg)"
Write-Host "`n== Dashboard" -ForegroundColor Cyan
$dz = Dash
Check 'Dashboard has all the numbers and billing is ready' (($null -ne $dz.todaySales) -and ($null -ne $dz.todayCollection) -and ($null -ne $dz.todayExpenses) -and ($null -ne $dz.estimatedProfit) -and ($dz.billingReady -eq $true))
Check 'Dashboard staff list carries todayRevenue' (@($dz.staff).Count -eq 0 -or $null -ne $dz.staff[0].todayRevenue)
Write-Host "`n== Cleanup of test records" -ForegroundColor Cyan
Call POST "/wallet/customer/$custId/adjust" @{ amount = -4000; note = 'ZZ test cleanup' } | Out-Null
Call PUT "/customers/$custId" @{ isActive = $false } | Out-Null
Call PUT "/products/$prodId" @{ isActive = $false } | Out-Null
Call PUT "/products/$salonId" @{ isActive = $false } | Out-Null
Call PUT "/wallet/offers/$($off.data.id)" @{ isActive = $false } | Out-Null
Call PUT "/suppliers/$supId" @{ isActive = $false } | Out-Null
Call DELETE "/services/$svcId" | Out-Null
Call DELETE "/services/$($svcB.data.id)" | Out-Null
Call DELETE "/services/$($again.data.id)" | Out-Null
Write-Host 'Test customer, products, services, offer and supplier were switched off. Bills, wallet history and purchases stay in the records.'
Write-Host ("`n==== RESULT: " + $script:pass + " passed, " + $script:fail + " failed ====") -ForegroundColor Cyan
if ($script:fail -gt 0) { Write-Host 'Failed checks:' -ForegroundColor Red; $script:failed | ForEach-Object { Write-Host (' - ' + $_) -ForegroundColor Red }; exit 1 } else { exit 0 }
