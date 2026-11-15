plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Prompt 51 (ANDPLAT51): Wear OS-app (no.kristo.finanshub.wear) – frittstående, logger inn med QR fra FinansHub på telefonen.
// Samme versjonering og signering som :app og :kalender:
//   ./gradlew :wear:assembleDebug                                         (CI – bygges også av ./gradlew assembleDebug)
//   ./gradlew :wear:assembleRelease -PversionName=4.2 -PversionCode=42    (utgivelse → wear/build/outputs/apk/release/wear-release.apk)
val appVersionName = providers.gradleProperty("versionName").orNull?.takeIf { it.isNotBlank() } ?: "4.0"
val appVersionCode = providers.gradleProperty("versionCode").orNull?.toIntOrNull() ?: 4

// Signering fra miljøet (ANDROID_KEYSTORE_*), regnet ut én gang i ../build.gradle.kts. Samme nøkkel for :app, :kalender og :wear.
// Uten egen nøkkel (tomt kart) brukes Androids standard debug-nøkkel for debug, og release-bygg stopper. Se docs/android-signering.md.
@Suppress("UNCHECKED_CAST")
val sign86 = rootProject.extra["sign86"] as Map<String, String>

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
            // Uten egen nøkkel: AGPs standard debug-signering.
            if (sign86.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = false
            // Uten egen nøkkel stopper ../build.gradle.kts release-bygget før det starter.
            if (sign86.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
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
    // Delt kode (Fase 5): serveradresse, klartekstregelen, HTTP-klient, feilsvar og «i dag».
    implementation(project(":felles"))
    // Kryptert lagring av tokens som tåler en ødelagt Keystore-nøkkel (B4).
    implementation(project(":felles-android"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.activity.compose)
    implementation(libs.core.ktx)
    implementation(libs.coroutines.android)
    // Fase 5: LocalLifecycleOwner, så henting som gjentas stopper når skjermen slukkes (samme versjon som :app og :kalender).
    implementation(libs.lifecycle.runtime.compose)
    // Prompt 51: godkjente Wear-avhengigheter (faste, stabile versjoner). androidx.wear:wear trengs ikke (ingen ambient-modus ennå).
    implementation(libs.wear.compose.material)
    implementation(libs.wear.compose.foundation)
}
