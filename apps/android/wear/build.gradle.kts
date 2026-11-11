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

// Prompt 86 (AND86): signering fra miljøet (ANDROID_KEYSTORE_*), regnet ut én gang i ../build.gradle.kts. Tomt kart = nøkkelen
// i repoet (signing/sideload.jks) som før. Samme nøkkel for :app, :kalender og :wear. Se docs/android-signering.md.
@Suppress("UNCHECKED_CAST")
val sign86 = rootProject.extra["sign86"] as Map<String, String>
val signName86 = if (sign86.isNotEmpty()) "release" else "sideload"

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
        if (sign86.isNotEmpty()) {
            create("release") {
                storeFile = file(sign86.getValue("file"))
                storePassword = sign86["storePassword"]
                keyAlias = sign86["keyAlias"]
                keyPassword = sign86["keyPassword"]
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName(signName86)
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(signName86)
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
