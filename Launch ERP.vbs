Set objShell = CreateObject("WScript.Shell")

' Kill any leftover node processes on the ports
objShell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True

' Start the ERP (server + frontend) silently
objShell.Run "cmd /c cd /d """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & """ && npm run dev", 0, False

' Wait 5 seconds for servers to boot
WScript.Sleep 5000

' Open browser
objShell.Run "http://localhost:5173"
