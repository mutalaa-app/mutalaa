plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.ahmed.mutalaa"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.ahmed.mutalaa"
        minSdk = 29
        targetSdk = 34
        versionCode = 2
        versionName = "2.0"
    }
    // مفتاح توقيع ثابت حتى تتحدث النسخ فوق بعضها بدون حذف التطبيق
    signingConfigs {
        getByName("debug") {
            storeFile = file("release.keystore")
            storePassword = "mutalaa123"
            keyAlias = "mutalaa"
            keyPassword = "mutalaa123"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
