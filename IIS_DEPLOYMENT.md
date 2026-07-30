# IIS Deployment Guide for officiallms

This guide shows how to deploy the Next.js app in `C:\inetpub\wwwroot\officiallms` and expose it at `http://10.40.10.125:7000`.

## 1. Copy the project to IIS

1. Copy the repository to:
   - `C:\inetpub\wwwroot\officiallms`

## 2. Install dependencies and build the app

Open PowerShell as Administrator:

```powershell
cd C:\inetpub\wwwroot\officiallms
npm install
npm run build
```

## 3. Run the Node backend as a service

The app must run as a Node process and stay alive after reboot. Use `nssm` or `pm2`.

### Option A: Using `nssm`

1. Download `nssm` and unzip it.
2. Open PowerShell as Administrator.
3. Install the service:

```powershell
nssm install officiallms
```

4. In the `nssm` UI, set:
   - Path: `C:\Program Files\nodejs\node.exe`
   - Startup directory: `C:\inetpub\wwwroot\officiallms`
   - Arguments: `C:\inetpub\wwwroot\officiallms\node_modules\next\dist\bin\next-cli.js start -p 7001`

5. Set `Start service automatically`.
6. Start the service:

```powershell
nssm start officiallms
```

### Option B: Using `pm2`

1. Install `pm2` globally:

```powershell
npm install -g pm2
```

2. Start the app:

```powershell
cd C:\inetpub\wwwroot\officiallms
pm2 start npm --name officiallms -- run start -- -p 7001
pm2 startup windows
pm2 save
```

## 4. Configure IIS as a reverse proxy

IIS should forward requests from `10.40.10.125:7000` to the Node app on `127.0.0.1:7001`.

### Install these IIS features:
- URL Rewrite
- Application Request Routing (ARR)

### Create or configure the IIS site:
- Site name: `officiallms`
- Physical path: `C:\inetpub\wwwroot\officiallms`
- Binding IP: `10.40.10.125`
- Binding port: `7000`

### Enable proxy in ARR:
1. Open IIS Manager.
2. Click `Application Request Routing Cache`.
3. Click `Server Proxy Settings`.
4. Check `Enable proxy`.

### Add the rewrite rule
Use the `web.config` below in the app folder.

## 5. `web.config`

Create a file named `web.config` inside `C:\inetpub\wwwroot\officiallms` with this exact content:

```xml
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyToNode" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:7001/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <proxy enabled="true" preserveHostHeader="true" />
  </system.webServer>
</configuration>
```

## 6. Restart IIS

```powershell
iisreset
```

## 7. Verify the deployment

Open in a browser:
- `http://10.40.10.125:7000`

If the site loads, IIS is correctly proxying traffic to the Node backend.

## Notes
- `7000` is the public IIS port.
- `7001` is the local Node process port.
- Email settings in your app are separate from IIS port configuration.
- After reboot, the Node process is kept alive by `nssm` or `pm2`.
