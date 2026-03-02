@echo off
set SRC=%USERPROFILE%\Downloads
set DST=C:\Users\lucca\Budget_app\android\app\src\main\res

copy /Y "%SRC%\icons_mipmap-mdpi_ic_launcher.png" "%DST%\mipmap-mdpi\ic_launcher.png"
copy /Y "%SRC%\icons_mipmap-mdpi_ic_launcher_round.png" "%DST%\mipmap-mdpi\ic_launcher_round.png"
copy /Y "%SRC%\icons_mipmap-hdpi_ic_launcher.png" "%DST%\mipmap-hdpi\ic_launcher.png"
copy /Y "%SRC%\icons_mipmap-hdpi_ic_launcher_round.png" "%DST%\mipmap-hdpi\ic_launcher_round.png"
copy /Y "%SRC%\icons_mipmap-xhdpi_ic_launcher.png" "%DST%\mipmap-xhdpi\ic_launcher.png"
copy /Y "%SRC%\icons_mipmap-xhdpi_ic_launcher_round.png" "%DST%\mipmap-xhdpi\ic_launcher_round.png"
copy /Y "%SRC%\icons_mipmap-xxhdpi_ic_launcher.png" "%DST%\mipmap-xxhdpi\ic_launcher.png"
copy /Y "%SRC%\icons_mipmap-xxhdpi_ic_launcher_round.png" "%DST%\mipmap-xxhdpi\ic_launcher_round.png"
copy /Y "%SRC%\icons_mipmap-xxxhdpi_ic_launcher.png" "%DST%\mipmap-xxxhdpi\ic_launcher.png"
copy /Y "%SRC%\icons_mipmap-xxxhdpi_ic_launcher_round.png" "%DST%\mipmap-xxxhdpi\ic_launcher_round.png"

echo Done! Now rebuild with: gradlew.bat installDebug
pause
