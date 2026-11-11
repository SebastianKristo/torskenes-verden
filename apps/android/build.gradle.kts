plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}

// Prompt 86 (AND86): signeringsnøkkelen leses fra miljøet (se docs/android-signering.md):
//   ANDROID_KEYSTORE_FILE (sti) eller ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
// Er de satt, signeres ALLE bygg (debug og release) i :app, :kalender og :wear med den nøkkelen. Mangler de, brukes
// nøkkelen i repoet (signing/sideload.jks) som før, og bygget advarer: den nøkkelen er offentlig og gir ingen beskyttelse.
// Modulene leser resultatet fra rootProject.extra["sign86"] (tomt kart = nøkkelen i repoet). Verdiene skrives aldri ut.
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
if (sign86.isEmpty()) {
    logger.warn("ADVARSEL (signering): ANDROID_KEYSTORE_* er ikke satt. Appene signeres med nøkkelen i repoet (apps/android/signing/sideload.jks). " +
        "Den er offentlig – alle med repoet kan signere en «oppdatering». Bytt til egen nøkkel: docs/android-signering.md.")
} else {
    logger.lifecycle("Signering: egen nøkkel fra miljøet brukes for :app, :kalender og :wear.")
}
extra["sign86"] = sign86
