// :felles – ren Kotlin (JVM) som :app, :kalender og :wear deler: serveradressen og lokalt nett (klartekst bare hjemme),
// feilsvaret fra serveren, HTTP-klienten og «i dag» i Oslo. Ingen Android-avhengigheter, så JUnit-testene (Q25) kjører
// på en vanlig JVM mot shared/testvektorer og shared/schemas/eksempler:
//   ./gradlew :felles:test
// Det som trenger Android (kryptert lagring), ligger i :felles-android.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

// Samme bytekode som Android-modulene (Java 17), uansett hvilken JDK som bygger.
kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    // org.json er en del av Android. Her brukes den bare til kompilering; testene får biblioteket fra Maven Central.
    compileOnly(libs.org.json)
    testImplementation(libs.org.json)
    testImplementation(libs.junit)
}

// Fase 6: modullisten (shared/schemas/moduler.json) bygges inn i :felles som reserve når serveren ikke svarer og ingen liste
// er bufret. Den kopieres ved hver bygging, så det finnes ingen egen håndskrevet liste i appene (Modulliste.innebygd()).
tasks.processResources {
    from(rootProject.file("../../shared/schemas/moduler.json")) {
        into("no/kristo/felles/moduler")
    }
}

tasks.test {
    // Testene leser fasitene fra repoet (shared/testvektorer, shared/schemas/eksempler).
    systemProperty("homelab.repo", rootProject.projectDir.parentFile.parentFile.absolutePath)
    testLogging {
        events("failed", "skipped")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
