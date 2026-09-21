# Ejecutar esto UNA VEZ en PowerShell como Administrador.
# Habilita TCP/IP con puerto fijo 1435 para la instancia SQLEXPRESS
# y reinicia el servicio para que el cambio surta efecto.

$base = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer\SuperSocketNetLib\Tcp"

Set-ItemProperty -Path $base -Name "Enabled" -Value 1 -Type DWord
Set-ItemProperty -Path "$base\IPAll" -Name "TcpPort" -Value "1435" -Type String
Set-ItemProperty -Path "$base\IPAll" -Name "TcpDynamicPorts" -Value "" -Type String

Restart-Service "MSSQL`$SQLEXPRESS" -Force

Write-Output "Listo. SQLEXPRESS ahora escucha en TCP puerto 1435."
