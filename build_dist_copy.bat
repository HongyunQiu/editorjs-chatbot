@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo 开始构建 editorjs-chatbot 插件...
call npx --yes vite build
set BUILD_RESULT=!ERRORLEVEL!

echo.
echo 构建完成，返回码: !BUILD_RESULT!

if !BUILD_RESULT! NEQ 0 (
    echo 构建失败！错误代码: !BUILD_RESULT!
    exit /b !BUILD_RESULT!
)

echo 构建成功，开始复制文件到 QNotes/public/vendor/editorjs-chatbot ...
echo.

if not exist "dist\chatbot.umd.js" (
    echo 错误：找不到 dist\chatbot.umd.js 文件！
    exit /b 1
)

if not exist "..\..\QNotes\public\vendor\editorjs-chatbot" (
    echo 创建目标目录...
    mkdir "..\..\QNotes\public\vendor\editorjs-chatbot"
    set MKDIR_RESULT=!ERRORLEVEL!
    if !MKDIR_RESULT! NEQ 0 (
        echo 创建目录失败！错误代码: !MKDIR_RESULT!
        exit /b !MKDIR_RESULT!
    )
)

echo 正在复制文件...
copy /Y "dist\chatbot.umd.js" "..\..\QNotes\public\vendor\editorjs-chatbot\chatbot.umd.js"
set COPY_RESULT=!ERRORLEVEL!

if !COPY_RESULT! EQU 0 (
    echo 文件复制成功！
) else (
    echo 文件复制失败！错误代码: !COPY_RESULT!
    exit /b !COPY_RESULT!
)

echo.
echo ========================================
echo 完成！editorjs-chatbot 构建与复制已成功执行。
echo ========================================

exit /b 0
