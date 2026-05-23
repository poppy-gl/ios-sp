Set-Location C:\video-backend
$env:NODE_ENV="production"
node .\dist\server.js *> .\logs\server.log