package no.kristo.felles

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Fasitene i repoet (shared/…). Stien kommer fra Gradle (homelab.repo), ellers letes det oppover fra arbeidsmappa. */
object Repo {
    val rot: File by lazy {
        System.getProperty("homelab.repo")?.let { File(it) }?.takeIf { File(it, "shared/testvektorer").isDirectory }
            ?: generateSequence(File("").absoluteFile) { it.parentFile }.firstOrNull { File(it, "shared/testvektorer").isDirectory }
            ?: error("Fant ikke shared/testvektorer (sett -Dhomelab.repo)")
    }

    fun fil(sti: String): File = File(rot, sti).also { require(it.isFile) { "Mangler $sti" } }

    fun json(sti: String): JSONObject = JSONObject(fil(sti).readText())

    /** «vektorer» i shared/testvektorer/<navn>.json. */
    fun vektorer(navn: String): List<JSONObject> {
        val a: JSONArray = json("shared/testvektorer/$navn.json").getJSONArray("vektorer")
        return (0 until a.length()).map { a.getJSONObject(it) }
    }
}
