@echo off
title Deltamod
if exist "C:\Program Files\nodejs\node.exe" (
	echo Found Node.js
	set /a dep = 1
) else (
	echo Didn't find Node!
	set /p="Press Enter."
	exit
)

npm test
set /p="Press Enter."
