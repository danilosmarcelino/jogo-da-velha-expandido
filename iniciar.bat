@echo off
title Servidor Super Jogo da Velha
color 0A

echo ==========================================
echo   INICIANDO O SUPER JOGO DA VELHA...
echo ==========================================
echo.

:: 1. Abre o navegador automaticamente no endereço local
start http://localhost:3000

:: 2. Inicia o servidor Node.js
:: Certifique-se de que este arquivo esta na mesma pasta do package.json
call npm start

:: 3. Mantem a janela aberta caso ocorra algum erro
pause