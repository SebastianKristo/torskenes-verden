plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}

// Signeringsnøkkelen leses fra miljøet (se docs/android-signering.md):
//   ANDROID_KEYSTORE_FILE (sti) eller ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
// Er de satt, signeres ALLE bygg (debug og release) i :app, :kalender og :wear med den nøkkelen. Mangler de, ligger det ingen
// nøkkel i repoet å falle tilbake på: debug-bygg signeres med Androids standard debug-nøkkel (~/.android/debug.keystore på
// maskinen som bygger), og release-bygg stopper med en feilmelding (under).
// Modulene leser resultatet fra rootProject.extra["sign86"] (tomt kart = ingen egen nøkkel). Verdiene skrives aldri ut.
val sign86: Map<String, String> = run {
    fun env(n: String): String? = System.getenv(n)?.takeIf { it.isNotBlank() }
    val b64 = env("ANDROID_KEYSTORE_BASE64")
    val file: String? = env("ANDROID_KEYSTORE_FILE")?.let { rootProject.file(it).absolutePath } ?: b64?.let {
        // Dekodes til en midlertidig fil utenfor repoet (slettes når Gradle avslutter).
        val f = java.io.File.createTempFile("android-keystore", ".jks")
        f.deleteOnExit()
        f.writeBytes(java.util.Base64.getMimeDecoder().decode(it.trim()))
        f.absolutePath
    }
    // Eldre måte (-Pandroid.injected.signing.*) virker fortsatt.
    fun prop(n: String): String? = providers.gradleProperty("android.injected.signing.$n").orNull?.takeIf { it.isNotBlank() }
    when {
        file != null -> {
            val mangler = listOf("ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD").filter { env(it) == null }
            if (mangler.isNotEmpty()) throw GradleException("Signering: nøkkelfil er satt i miljøet, men " + mangler.joinToString(", ") + " mangler. Se docs/android-signering.md.")
            if (!java.io.File(file).isFile) throw GradleException("Signering: fant ikke nøkkelfila fra ANDROID_KEYSTORE_FILE.")
            mapOf("file" to file, "storePassword" to env("ANDROID_KEYSTORE_PASSWORD")!!, "keyAlias" to env("ANDROID_KEY_ALIAS")!!, "keyPassword" to env("ANDROID_KEY_PASSWORD")!!)
        }
        prop("store.file") != null -> mapOf("file" to rootProject.file(prop("store.file")!!).absolutePath, "storePassword" to (prop("store.password") ?: ""),
            "keyAlias" to (prop("key.alias") ?: ""), "keyPassword" to (prop("key.password") ?: ""))
        else -> emptyMap()
    }
}
// Samme tekst står i .github/workflows/release.yml, som stopper før byggene starter.
val utenNokkel = "Release-bygg krever egen signeringsnøkkel, og ANDROID_KEYSTORE_* er ikke satt. " +
    "Lag nøkkelen med scripts/android-nokkel.sh og legg inn de fire hemmelighetene, se docs/android-signering.md."
if (sign86.isEmpty()) {
    logger.warn("ADVARSEL (signering): ANDROID_KEYSTORE_* er ikke satt. Debug-bygg signeres med Androids standard debug-nøkkel. " +
        "APK-en kan ikke installeres over en tidligere installert versjon som er signert med en annen nøkkel – avinstaller den først. " +
        "Release-bygg stopper. Se docs/android-signering.md.")
    // Stopp før noe bygges når en release-oppgave (assembleRelease, bundleRelease, installRelease …) er med i bygget.
    gradle.taskGraph.whenReady {
        val release = allTasks.filter { t ->
            t.name.endsWith("Release") && listOf("assemble", "bundle", "package", "install").any { t.name.startsWith(it) }
        }
        if (release.isNotEmpty()) throw GradleException(utenNokkel)
    }
} else {
    logger.lifecycle("Signering: egen nøkkel fra miljøet brukes for :app, :kalender og :wear.")
}
extra["sign86"] = sign86
