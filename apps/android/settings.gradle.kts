pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "FinansHub"
include(":app")
// Prompt 33: Kalender – egen app (no.kristo.kalender) som deler konto og data med Homelab.
include(":kalender")
// Prompt 51 (ANDPLAT51): Wear OS-app (no.kristo.finanshub.wear) – Sjekk inn, «Hent meg», avganger, handleliste og Glimt med tale.
include(":wear")
// Fase 5: delt kode for alle tre appene. :felles er ren Kotlin med JUnit-tester mot shared/testvektorer; :felles-android har
// det som trenger Android (kryptert lagring).
include(":felles")
include(":felles-android")
