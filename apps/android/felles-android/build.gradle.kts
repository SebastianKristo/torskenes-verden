// :felles-android – det :app, :kalender og :wear deler som trenger Android: kryptert lagring av tokens (SikkerLagring).
// Ren Kotlin uten Android ligger i :felles.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "no.kristo.felles.android"
    compileSdk = 35

    defaultConfig {
        // Laveste i appene (:wear har 30).
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    api(libs.security.crypto)
}
