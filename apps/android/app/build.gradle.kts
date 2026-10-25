plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Versjon kan overstyres fra CI: ./gradlew assembleRelease -PversionName=4.1 -PversionCode=41
val appVersionName = providers.gradleProperty("versionName").orNull?.takeIf { it.isNotBlank() } ?: "4.0"
val appVersionCode = providers.gradleProperty("versionCode").orNull?.toIntOrNull() ?: 4

// Signering for utgivelser: brukes bare når CI sender inn android.injected.signing.* (keystore fra secrets).
val signStore = providers.gradleProperty("android.injected.signing.store.file").orNull?.takeIf { it.isNotBlank() }

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
        // Fast nøkkel for sideloading (apps/android/signing/sideload.jks). Alle bygg uten egen release-nøkkel signeres
        // med den, så en ny APK kan installeres over den forrige uten å avinstallere først.
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
            // Egen nøkkel når den sendes inn, ellers den faste sideload-nøkkelen.
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
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3:material3-window-size-class")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("androidx.security:security-crypto:1.0.0")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Hjemskjerm-widgets (Glance) og henting av widgetdata hvert 15. minutt.
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    // Familie: kart med OpenStreetMap-fliser, og helse fra Health Connect.
    implementation("org.osmdroid:osmdroid-android:6.1.20")
    implementation("androidx.health.connect:connect-client:1.1.0-alpha07")
    // Sanntid (Huskeliste, Familie, Sporing): én WebSocket mot /api/ws.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Prompt 46: QR-skanning uten kameratillatelse (Googles skanner-UI)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // Prompt 47: kvitteringer leses på telefonen (Google ML Kit, modellen via Play-tjenester). Task ventes på med
    // suspendCancellableCoroutine, så kotlinx-coroutines-play-services trengs ikke. Krever fragment ≥ 1.3 (fragment-ktx over).
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
    // Prompt 48: ML Kit Document Scanner (kantfinning, perspektivretting og beskjæring av kvitteringer). Skanner-UI og modell kommer
    // fra Play-tjenester (ingen kameratillatelse, ingen modell i APK-en). Brukes bare når «Dokumentskanner» er på; ellers/uten
    // Play-tjenester brukes systemkameraet som før (ui/Receipt48Ui.kt).
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")
    // Prompt 51 (ANDPLAT51): Android Auto – Avganger, På vei hjem og Media som bilmaler (Car51Plat.kt). Fast stabil versjon.
    implementation("androidx.car.app:app:1.4.0")
}
