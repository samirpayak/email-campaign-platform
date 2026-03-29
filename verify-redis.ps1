#!/usr/bin/env powershell
# Redis Setup Verification Script
# Run this after adding REDIS_URL to Vercel and redeploying

$baseUrl = "https://mail.trugydex.in"

Write-Host "🔴 Redis Setup Verification" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Health Endpoint
Write-Host "1️⃣ Checking /api/health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -ErrorAction Stop
    $data = $health.Content | ConvertFrom-Json
    
    Write-Host "   ✅ Health endpoint responding" -ForegroundColor Green
    Write-Host "   MongoDB: $($data.mongodb)" -ForegroundColor White
    Write-Host "   Redis configured: $($data.config.redis)" -ForegroundColor White
    
    if ($data.config.redis -eq $true) {
        Write-Host "   ✅ REDIS DETECTED!" -ForegroundColor Green
        $redisWorking = $true
    } else {
        Write-Host "   ❌ Redis not detected" -ForegroundColor Red
        Write-Host "   Check: Did you add REDIS_URL to Vercel?" -ForegroundColor Yellow
        $redisWorking = $false
    }
} catch {
    Write-Host "   ❌ Health endpoint failed: $_" -ForegroundColor Red
    $redisWorking = $false
}

Write-Host ""

# Check 2: Diagnostic Endpoint
Write-Host "2️⃣ Checking /api/diagnose endpoint..." -ForegroundColor Yellow
try {
    $diag = Invoke-WebRequest -Uri "$baseUrl/api/diagnose" -UseBasicParsing -ErrorAction Stop
    $data = $diag.Content | ConvertFrom-Json
    
    Write-Host "   ✅ Diagnostic endpoint responding" -ForegroundColor Green
    Write-Host "   REDIS_URL set: $($data.environment.REDIS_URL_SET)" -ForegroundColor White
    Write-Host "   Queue config: $($data.queue.config)" -ForegroundColor White
    Write-Host "   Queue status: $($data.queue.status)" -ForegroundColor White
    
    if ($data.environment.REDIS_URL_SET -eq $true) {
        Write-Host "   ✅ REDIS_URL is configured!" -ForegroundColor Green
        $redisUrl = $true
    } else {
        Write-Host "   ❌ REDIS_URL not set" -ForegroundColor Red
        $redisUrl = $false
    }
} catch {
    Write-Host "   ❌ Diagnostic endpoint failed: $_" -ForegroundColor Red
    $redisUrl = $false
}

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan

# Summary
Write-Host ""
if ($redisWorking -and $redisUrl) {
    Write-Host "✅ SUCCESS! Redis is configured and working!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your email platform can now:" -ForegroundColor Green
    Write-Host "  ✨ Send 1000 emails in ~10 seconds" -ForegroundColor Green
    Write-Host "  ✨ Return instantly to user (no blocking)" -ForegroundColor Green
    Write-Host "  ✨ Auto-retry failed emails 3 times" -ForegroundColor Green
    Write-Host "  ✨ Scale to unlimited bulk campaigns" -ForegroundColor Green
} else {
    Write-Host "⚠️  Redis setup not complete" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify REDIS_URL is in Vercel environment variables" -ForegroundColor Yellow
    Write-Host "  2. Manually redeploy Vercel (wait 5+ mins)" -ForegroundColor Yellow
    Write-Host "  3. Hard refresh browser (Ctrl+Shift+R)" -ForegroundColor Yellow
    Write-Host "  4. Run this script again to verify" -ForegroundColor Yellow
}

Write-Host ""

# Test email sending if Redis is working
if ($redisWorking) {
    Write-Host "3️⃣ Testing email queue..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To test email sending with Redis queue:" -ForegroundColor Cyan
    Write-Host "  1. Login to https://mail.trugydex.in" -ForegroundColor Cyan
    Write-Host "  2. Create a test group with your email" -ForegroundColor Cyan
    Write-Host "  3. Send a test campaign" -ForegroundColor Cyan
    Write-Host "  4. Response should show: \"method\": \"queue\"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "If you see \"method\": \"queue\" → Redis is active! ⚡" -ForegroundColor Green
}

Write-Host ""
Write-Host "For detailed setup guide, see: REDIS_SETUP_GUIDE.md" -ForegroundColor Cyan
