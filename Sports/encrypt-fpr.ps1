# Encrypt FPR plaintext source into the deployed, password-protected FPR.html
# Usage:
#   .\encrypt-fpr.ps1 -Password 'your-passphrase'
#   .\encrypt-fpr.ps1                       # prompts securely instead
#   .\encrypt-fpr.ps1 -Src FPR.src.html -Out FPR.html -Password 'x'
#
# Output is AES-256-CBC over the whole HTML, key derived from the password
# via PBKDF2 (SHA-256, falling back to SHA-1 on older .NET). Salt and IV are
# random per run and embedded in the output. No plaintext, hash, or password
# is written anywhere.

param(
  [string]$Src = "FPR.src.html",
  [string]$Out = "FPR.html",
  [string]$Password
)

if (-not $Password) {
  $sec = Read-Host "Enter password for FPR (kept secret, not stored)" -AsSecureString
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if ([string]::IsNullOrEmpty($Password)) { throw "Password required. Pass -Password or answer the prompt." }
if (-not (Test-Path -LiteralPath $Src)) { throw "Source not found: $Src" }

$plainBytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Src))

$salt = New-Object byte[] 16
$iv = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($salt); $rng.GetBytes($iv) } finally { $rng.Dispose() }

$iter = 250000
$hashName = "SHA-256"
$derived = $null
try {
  $pbkdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Password, $salt, $iter, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $derived = $pbkdf.GetBytes(32)
} catch {
  $hashName = "SHA-1"
  $pbkdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Password, $salt, $iter)
  $derived = $pbkdf.GetBytes(32)
}
$pbkdf.Dispose()

$aes = [System.Security.Cryptography.Aes]::Create()
try {
  $aes.KeySize = 256
  $aes.Key = $derived
  $aes.IV = $iv
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $enc = $aes.CreateEncryptor()
  $ct = $enc.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
  $enc.Dispose()
} finally {
  $aes.Dispose()
}

$blob = @{
  v    = 1
  hash = $hashName
  iter = $iter
  salt = [Convert]::ToBase64String($salt)
  iv   = [Convert]::ToBase64String($iv)
  ct   = [Convert]::ToBase64String($ct)
}
$blobJson = $blob | ConvertTo-Json -Compress

$bootstrap = @'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FPR</title>
<style>
  :root { --bg: #12181a; --amber: #f2b134; --text: #e8e4d9; --muted: #8a9490; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .lock {
    width: 100%;
    max-width: 320px;
    padding: 32px;
    text-align: center;
  }
  .lock .eyebrow {
    letter-spacing: 0.25em;
    color: var(--amber);
    font-size: 11px;
    font-weight: 700;
  }
  .lock h1 {
    font-size: 42px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 4px 0 24px;
  }
  .lock input {
    width: 100%;
    font-size: 14px;
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid #2c3b34;
    background: #0d1210;
    color: var(--text);
    text-align: center;
    margin-bottom: 12px;
  }
  .lock button {
    width: 100%;
    padding: 11px;
    border-radius: 4px;
    background: var(--amber);
    color: #12181a;
    font-weight: 700;
    font-size: 14px;
    border: none;
    cursor: pointer;
  }
  .lock button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err { display: none; font-size: 12px; color: #e8a3a3; margin-top: 12px; }
  .sub { font-size: 11px; color: var(--muted); margin-top: 18px; }
</style>
</head>
<body>
  <div class="lock">
    <div class="eyebrow">PERSONAL</div>
    <h1>FPR</h1>
    <input type="password" id="pw" placeholder="Password" autocomplete="off">
    <button id="unlockBtn">Unlock</button>
    <div class="err" id="err">Wrong password.</div>
    <div class="sub">Content is encrypted. Enter the password to decrypt.</div>
  </div>
<script>
const BLOB = __BLOB_JSON__;

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(password) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBuf(BLOB.salt), iterations: BLOB.iter, hash: BLOB.hash },
    material,
    { name: "AES-CBC", length: 256 },
    false,
    ["decrypt"]
  );
}

async function unlock() {
  const pw = document.getElementById("pw").value;
  const err = document.getElementById("err");
  const btn = document.getElementById("unlockBtn");
  if (!pw) return;
  btn.disabled = true;
  btn.textContent = "Unlocking...";
  try {
    const key = await deriveKey(pw);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: b64ToBuf(BLOB.iv) }, key, b64ToBuf(BLOB.ct));
    document.open();
    document.write(new TextDecoder().decode(plain));
    document.close();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Unlock";
    err.style.display = "block";
  }
}

document.getElementById("unlockBtn").onclick = unlock;
document.getElementById("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
document.getElementById("pw").focus();
</script>
</body>
</html>
'@

$bootstrap = $bootstrap.Replace("__BLOB_JSON__", $blobJson)
$outFull = [System.IO.Path]::GetFullPath($Out)
[System.IO.File]::WriteAllText($outFull, $bootstrap, [System.Text.UTF8Encoding]::new($false))

Write-Host ("Encrypted {0} ({1} bytes) -> {2} using PBKDF2-{3} x{4}" -f $Src, $plainBytes.Length, $Out, $hashName, $iter)
Write-Host "Verify: open the deployed https URL, enter your password. Wrong password must fail; correct one must load FPR."
