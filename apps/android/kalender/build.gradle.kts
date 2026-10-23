plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Prompt 33: Kalender – egen app med eget ikon og egne widgets. Samme versjonering og signering som Homelab-appen (:app):
//   ./gradlew :kalender:assembleDebug                                         (CI)
//   ./gradlew :kalender:assembleRelease -PversionName=4.2 -PversionCode=42    (utgivelse → kalender/build/outputs/apk/release/kalender-release.apk)
val appVersionName = providers.gradleProperty("versionName").orNull?.takeIf { it.isNotBlank() } ?: "4.0"
val appVersionCode = providers.gradleProperty("versionCode").orNull?.toIntOrNull() ?: 4

// Egen release-nøkkel bare når CI sender inn android.injected.signing.* (samme som :app). Ellers den faste sideload-nøkkelen.
// Begge appene MÅ ha samme nøkkel: «Logg inn med Homelab-appen» bruker en signature-tillatelse.
val signStore = providers.gradleProperty("android.injected.signing.store.file").orNull?.takeIf { it.isNotBlank() }

android {
    namespace = "no.kristo.kalender"
    compileSdk = 35

    defaultConfig {
        applicationId = "no.kristo.kalender"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    signingConfigs {
        create("sideload") {
            storeFile = rootProject.file("signing/sideload.jks")
            storePassword = "finanshub-sideload"
            keyAlias = "finanshub"
            keyPassword = "finanshub-sideload"
        }
        if (signStore != null) {
            create("release") {
                storeFile = file(signStore)
                storePassword = providers.gradleProperty("android.injected.signing.store.password").orNull
                keyAlias = providers.gradleProperty("android.injected.signing.key.alias").orNull
                keyPassword = providers.gradleProperty("android.injected.signing.key.password").orNull
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("sideload")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (signStore != null) "release" else "sideload")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

// Bare avhengigheter som :app allerede har (ingen nye eksterne biblioteker).
dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.security:security-crypto:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Hjemskjerm-widgets (Glance) og henting hvert 15. minutt.
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    // Prompt 46: QR-skanning uten kameratillatelse (Googles skanner-UI)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
