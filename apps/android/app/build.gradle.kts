plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Versjon kan overstyres fra CI: ./gradlew assembleRelease -PversionName=4.1 -PversionCode=41
val appVersionName = providers.gradleProperty("versionName").orNull?.takeIf { it.isNotBlank() } ?: "4.0"
val appVersionCode = providers.gradleProperty("versionCode").orNull?.toIntOrNull() ?: 4

// Signering fra miljøet (ANDROID_KEYSTORE_*), regnet ut én gang i ../build.gradle.kts. Samme nøkkel for :app, :kalender og :wear.
// Uten egen nøkkel (tomt kart) brukes Androids standard debug-nøkkel for debug, og release-bygg stopper. Se docs/android-signering.md.
@Suppress("UNCHECKED_CAST")
val sign86 = rootProject.extra["sign86"] as Map<String, String>

android {
    namespace = "no.kristo.finanshub"
    compileSdk = 35

    defaultConfig {
        applicationId = "no.kristo.finanshub"
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

dependencies {
    // Delt kode (Fase 5): serveradresse, klartekstregelen, HTTP-klient, feilsvar og «i dag».
    implementation(project(":felles"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material3.windowsize)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.core.ktx)
    implementation(libs.exifinterface)
    implementation(libs.security.crypto)
    implementation(libs.fragment.ktx)
    implementation(libs.biometric)
    implementation(libs.coroutines.android)
    // Hjemskjerm-widgets (Glance) og henting av widgetdata hvert 15. minutt.
    implementation(libs.glance.appwidget)
    implementation(libs.work.runtime.ktx)
    // Familie: kart med OpenStreetMap-fliser, og helse fra Health Connect.
    implementation(libs.osmdroid)
    implementation(libs.health.connect)
    // Sanntid (Huskeliste, Familie, Sporing): én WebSocket mot /api/ws.
    implementation(libs.okhttp)
    // Prompt 46: QR-skanning uten kameratillatelse (Googles skanner-UI)
    implementation(libs.play.code.scanner)
    // Prompt 47: kvitteringer leses på telefonen (Google ML Kit, modellen via Play-tjenester). Task ventes på med
    // suspendCancellableCoroutine, så kotlinx-coroutines-play-services trengs ikke. Krever fragment ≥ 1.3 (fragment-ktx over).
    implementation(libs.play.mlkit.text)
    // Prompt 48: ML Kit Document Scanner (kantfinning, perspektivretting og beskjæring av kvitteringer). Skanner-UI og modell kommer
    // fra Play-tjenester (ingen kameratillatelse, ingen modell i APK-en). Brukes bare når «Dokumentskanner» er på; ellers/uten
    // Play-tjenester brukes systemkameraet som før (ui/Receipt48Ui.kt).
    implementation(libs.play.mlkit.document.scanner)
    // Prompt 51 (ANDPLAT51): Android Auto – Avganger, På vei hjem og Media som bilmaler (Car51Plat.kt). Fast stabil versjon.
    implementation(libs.car.app)
    // Prompt 71 (ANIAND71): Baseline Profile (src/main/baseline-prof.txt) for Hjem, Chat og ark. Profilinstalleren skriver profilen ved
    // første oppstart, også for APK-er som sideloades. Ingen ny Gradle-plugin (AGP tar med baseline-prof.txt av seg selv).
    implementation(libs.profileinstaller)
}
