# Construction de l'APK Android sans Android Studio :
#   docker compose --profile android run --rm android-build
# L'APK de débogage est copié dans android/dist/.
FROM eclipse-temurin:17-jdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl && rm -rf /var/lib/apt/lists/* \
  && mkdir -p $ANDROID_SDK_ROOT/cmdline-tools \
  && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/tools.zip \
  && unzip -q /tmp/tools.zip -d $ANDROID_SDK_ROOT/cmdline-tools && mv $ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools $ANDROID_SDK_ROOT/cmdline-tools/latest \
  && yes | $ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null \
  && $ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" >/dev/null
WORKDIR /src
CMD ["sh", "-c", "./gradlew :app:testDebugUnitTest :app:assembleDebug --no-daemon -Pstudymate.apiUrl=${STUDYMATE_API_URL:-http://10.0.2.2:4000/} && mkdir -p dist && cp app/build/outputs/apk/debug/app-debug.apk dist/studymate-debug.apk"]
