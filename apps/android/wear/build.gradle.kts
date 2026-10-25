plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Prompt 51 (ANDPLAT51): Wear OS-app (no.kristo.finanshub.wear) – frittstående, logger inn med QR fra FinansHub på telefonen.
// Samme versjonering og signering som :app og :kalender:
//   ./gradlew :wear:assembleDebug                                         (CI – bygges også av ./gradlew assembleDebug)
//   ./gradlew :wear:assembleRelease -PversionName=4.2 -PversionCode=42    (utgivelse → wear/build/outputs/apk/release/wear-release.apk)
val appVersionName = providers.gradleProperty("versionName").orNull?.takeIf { it.isNotBlank() } ?: "4.0"
val appVersionCode = providers.gradleProperty("versionCode").orNull?.toIntOrNull() ?: 4

// Egen release-nøkkel bare når CI sender inn android.injected.signing.* (samme som :app). Ellers den faste sideload-nøkkelen.
val signStore = providers.gradleProperty("android.injected.signing.store.file").orNull?.takeIf { it.isNotBlank() }

android {
    namespace = "no.kristo.finanshub.wear"
    compileSdk = 35

    defaultConfig {
        applicationId = "no.kristo.finanshub.wear"
        // Wear OS 3 (API 30) og nyere.
        minSdk = 30
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

dependencies {
    // Samme Compose-BOM og AndroidX-versjoner som :app (ingen nye utenom de godkjente Wear-bibliotekene under).
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.security:security-crypto:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Prompt 51: godkjente Wear-avhengigheter (faste, stabile versjoner). androidx.wear:wear trengs ikke (ingen ambient-modus ennå).
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
}
