plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Prompt 33: Kalender – egen app med eget ikon og egne widgets. Samme versjonering og signering som Homelab-appen (:app):
//   ./gradlew :kalender:assembleDebug                                         (CI)
//   ./gradlew :kalender:assembleRelease -PversionName=4.2 -PversionCode=42    (utgivelse → kalender/build/outputs/apk/release/kalender-release.apk)
val appVersionName = providers.gradleProperty("versionName").orNull?.takeIf { it.isNotBlank() } ?: "4.0"
val appVersionCode = providers.gradleProperty("versionCode").orNull?.toIntOrNull() ?: 4

// Signering fra miljøet (ANDROID_KEYSTORE_*), regnet ut én gang i ../build.gradle.kts. Samme nøkkel for :app, :kalender og :wear.
// Uten egen nøkkel (tomt kart) brukes Androids standard debug-nøkkel for debug, og release-bygg stopper. Se docs/android-signering.md.
// Begge appene MÅ ha samme nøkkel: «Logg inn med Homelab-appen» sammenligner signeringssertifikatene.
@Suppress("UNCHECKED_CAST")
val sign86 = rootProject.extra["sign86"] as Map<String, String>

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

// Bare avhengigheter som :app allerede har (ingen nye eksterne biblioteker).
dependencies {
    // Delt kode (Fase 5): serveradresse, klartekstregelen, HTTP-klient, feilsvar og «i dag».
    implementation(project(":felles"))
    // Kryptert lagring av tokens som tåler en ødelagt Keystore-nøkkel (B4).
    implementation(project(":felles-android"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.core.ktx)
    // Code Scanner drar inn en gammel fragment-versjon; ActivityResult-API-et krever ≥ 1.3 (lintVitalRelease). Samme versjon som Finans-appen.
    implementation(libs.fragment.ktx)
    implementation(libs.coroutines.android)
    // Hjemskjerm-widgets (Glance) og henting hvert 15. minutt.
    implementation(libs.glance.appwidget)
    implementation(libs.work.runtime.ktx)
    // Prompt 46: QR-skanning uten kameratillatelse (Googles skanner-UI)
    implementation(libs.play.code.scanner)
    // JUnit (Q25): HurtigtolkingTest kjører shared/testvektorer/datoer.json mot parseQuick. org.json fra Maven, fordi
    // org.json i android.jar bare er stubber i enhetstester.
    testImplementation(libs.junit)
    testImplementation(libs.org.json)
}
